import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getEnv } from './utils.ts'

function hasBento(c: Context) {
  return getEnv(c, 'BENTO_PUBLISHABLE_KEY').length > 0 && getEnv(c, 'BENTO_SECRET_KEY').length > 0 && getEnv(c, 'BENTO_SITE_UUID').length > 0
}

function getBentoHeaders(c: Context) {
  if (!hasBento(c)) {
    cloudlog({ requestId: c.get('requestId'), context: 'getBentoHeaders', error: 'Bento is not enabled' })
    return null
  }

  const publishableKey = getEnv(c, 'BENTO_PUBLISHABLE_KEY')
  const secretKey = getEnv(c, 'BENTO_SECRET_KEY')

  const authKey = btoa(`${publishableKey}:${secretKey}`)

  return {
    'Authorization': `Basic ${authKey}`,
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'Capgo',
  }
}

async function bentoFetch(c: Context, path: string, siteUuid: string, body: any) {
  const headers = getBentoHeaders(c)
  if (!headers)
    return null

  const url = new URL(`https://app.bentonow.com/api/v1/${path}`)
  url.searchParams.set('site_uuid', siteUuid)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Bento API error: ${response.status} ${error}`)
  }

  return response.json()
}

export async function trackBentoEvent(c: Context, email: string, data: any, event: string) {
  if (!hasBento(c))
    return

  try {
    const siteUuid = getEnv(c, 'BENTO_SITE_UUID')

    const payload = {
      events: [{
        type: event,
        email,
        details: data,
      }],
    }

    const res = await bentoFetch(c, 'batch/events', siteUuid, payload) as { results: number, failed: number }
    if (res.failed > 0) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'trackBentoEvent', error: res })
      return false
    }
    return true
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'trackBentoEvent error', error: serializeError(e) })
    return false
  }
}

export async function addTagBento(c: Context, email: string, segments: { segments: string[], deleteSegments: string[] }) {
  if (!hasBento(c))
    return

  try {
    const siteUuid = getEnv(c, 'BENTO_SITE_UUID')

    const commands = [
      ...segments.deleteSegments.map(segment => ({
        command: 'remove_tag',
        email,
        query: segment,
      })),
      ...segments.segments.map(segment => ({
        command: 'add_tag',
        email,
        query: segment,
      })),
    ]

    const results = await Promise.all(commands.map(command =>
      bentoFetch(c, 'fetch/commands', siteUuid, { command }),
    ))

    cloudlog({ requestId: c.get('requestId'), message: 'addTagBento', email, commands, results })
    return true
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'addTagBento error', error: serializeError(e) })
    return false
  }
}

export async function unsubscribeBento(c: Context, email: string) {
  if (!hasBento(c))
    return

  try {
    const siteUuid = getEnv(c, 'BENTO_SITE_UUID')
    const command = {
      command: 'unsubscribe',
      email,
    }

    const result = await bentoFetch(c, 'fetch/commands', siteUuid, { command })

    cloudlog({ requestId: c.get('requestId'), message: 'unsubscribeBento', email, result })
    return true
  }
  catch (e) {
    cloudlog({ requestId: c.get('requestId'), message: 'unsubscribeBento error', error: e })
    return false
  }
}
