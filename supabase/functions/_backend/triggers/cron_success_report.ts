import type { Context } from 'hono'
import { BRES, createHono, middlewareAPISecret, parseBody, quickError, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { version } from '../utils/version.ts'

interface CronSuccessReportPayload {
  runId: string
  taskName: string
  url: string
}

/**
 * Hono app for delivering cron success callbacks.
 *
 * This is invoked via the internal trigger router (`/triggers/cron_success_report`)
 * with `middlewareAPISecret` authentication.
 */
export const app = createHono('', version)

/**
 * Deliver a cron success webhook after a run completes successfully.
 */
async function handleCronSuccessReport(c: Context) {
  const payload = await parseBody<CronSuccessReportPayload>(c)
  const url = payload?.url?.trim()

  if (!payload?.runId || !payload?.taskName || !url) {
    throw simpleError('invalid_payload', 'Missing runId, taskName, or url', { payload })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  }
  catch {
    throw simpleError('invalid_url', 'Invalid success report URL', { payload })
  }

  if (parsedUrl.protocol !== 'https:') {
    throw simpleError('invalid_url_protocol', 'Success report URL must use HTTPS', { url })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  let response: Response
  try {
    response = await fetch(parsedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Capgo-Cron-Health/1.0',
      },
      signal: controller.signal,
    })
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw quickError(504, 'cron_success_report_timeout', 'Success report request timed out')
    }
    throw quickError(
      502,
      'cron_success_report_failed',
      `Success report request failed: ${error instanceof Error ? error.message : String(error)}`,
      { error },
    )
  }
  finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'cron success report failed',
      runId: payload.runId,
      taskName: payload.taskName,
      url: '[redacted]',
      status: response.status,
    })
    throw quickError(502, 'cron_success_report_failed', 'Failed to deliver cron success report')
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'cron success report delivered',
    runId: payload.runId,
    taskName: payload.taskName,
    url: '[redacted]',
    status: response.status,
  })

  return c.json(BRES)
}

app.post('/', middlewareAPISecret, handleCronSuccessReport)
