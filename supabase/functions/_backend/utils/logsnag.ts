import type { Context } from 'hono'
import { LogSnag } from '@logsnag/node'

import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getEnv } from './utils.ts'

const MAX_LOGSNAG_ERROR_BODY_BYTES = 4 * 1024
const LOGSNAG_ERROR_BODY_TOO_LARGE = '[logsnag_error_body_too_large]'

function logsnag(c: Context) {
  const ls = getEnv(c, 'LOGSNAG_TOKEN')
    ? new LogSnag({
        token: getEnv(c, 'LOGSNAG_TOKEN'),
        project: getEnv(c, 'LOGSNAG_PROJECT'),
      })
    : {
        publish: () => Promise.resolve(true),
        track: (_obj: any) => Promise.resolve(true),
        insight: {
          track: (_obj: any) => Promise.resolve(true),
          increment: () => Promise.resolve(true),
        },
      }
  return ls as LogSnag
}

function isOversizedContentLength(response: Response, maxBytes: number) {
  const contentLength = response.headers.get('content-length')
  if (!contentLength)
    return false

  const parsed = Number.parseInt(contentLength, 10)
  return Number.isFinite(parsed) && parsed > maxBytes
}

async function readLimitedResponseText(response: Response, maxBytes: number) {
  if (isOversizedContentLength(response, maxBytes)) {
    await response.body?.cancel().catch(() => undefined)
    return LOGSNAG_ERROR_BODY_TOO_LARGE
  }

  if (!response.body) {
    const text = await response.text()
    return new TextEncoder().encode(text).byteLength > maxBytes ? LOGSNAG_ERROR_BODY_TOO_LARGE : text
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    receivedBytes += value.byteLength
    if (receivedBytes > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return LOGSNAG_ERROR_BODY_TOO_LARGE
    }
    chunks.push(value)
  }

  const body = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(body)
}

async function logsnagInsights(c: Context, data: { title: string, value: string | boolean | number, icon: string }[]) {
  cloudlog({ requestId: c.get('requestId'), message: 'logsnagInsights', data })
  const ls = getEnv(c, 'LOGSNAG_TOKEN')
  const project = getEnv(c, 'LOGSNAG_PROJECT')
  if (!ls || !project)
    return Promise.resolve(false)

  // Send all insights in parallel
  const promises = data.map(async (d) => {
    const payload = {
      title: d.title,
      value: d.value,
      icon: d.icon,
      project,
    }

    try {
      const response = await fetch('https://api.logsnag.com/v1/insight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ls}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await readLimitedResponseText(response, MAX_LOGSNAG_ERROR_BODY_BYTES)
        cloudlogErr({ requestId: c.get('requestId'), message: 'logsnagInsights error', status: response.status, error, payload })
        return false
      }

      return await response.json()
    }
    catch (e) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'logsnagInsights error', error: serializeError(e), payload })
      return false
    }
  })

  return Promise.all(promises)
}

export const logsnagTestUtils = {
  LOGSNAG_ERROR_BODY_TOO_LARGE,
  MAX_LOGSNAG_ERROR_BODY_BYTES,
}

export { logsnag, logsnagInsights }
