import type { Context } from 'hono'
import type { SimpleErrorResponse } from './hono.ts'
import { sendDiscordAlert500 } from './discord.ts'
import { cloudlogErr, serializeError } from './loggin.ts'
import { backgroundTask } from './utils.ts'

export function onError(functionName: string) {
  return async (e: any, c: Context) => {
    let body = 'N/A'
    try {
      const clonedReq = c.req.raw.clone()
      body = await clonedReq.text().catch(() => 'Failed to read body')
      if (body.length > 1000) {
        body = `${body.substring(0, 1000)}... (truncated)`
      }
    }
    catch {
      body = 'Failed to read body'
    }

    // const safeCause = e ? JSON.stringify(e, Object.getOwnPropertyNames(e)) : undefined
    const defaultResponse: SimpleErrorResponse = {
      error: 'unknown_error',
      message: 'Unknown error',
      // cause: safeCause,
      moreInfo: {},
    }

    const isHttpException = e && typeof e === 'object' && typeof e.status === 'number' && typeof e.getResponse === 'function'
    if (isHttpException) {
      // Pull the JSON we attached to the HTTPException to improve logs and response
      let res: SimpleErrorResponse = defaultResponse
      try {
        const parsed = await e.getResponse().json()
        res = {
          error: typeof parsed?.error === 'string' ? parsed.error : 'unknown_error',
          message: typeof parsed?.message === 'string' ? parsed.message : 'Unknown error',
          moreInfo: parsed?.moreInfo ?? (typeof parsed === 'object' ? parsed : {}),
        }
      }
      catch {
        // ignore JSON parse errors; fall back to default
      }
      // Single, structured error log entry
      cloudlogErr({
        requestId: c.get('requestId'),
        functionName,
        kind: 'http_exception',
        method: c.req.method,
        url: c.req.url,
        status: e.status,
        errorCode: res.error,
        errorMessage: res.message,
        moreInfo: res.moreInfo,
        stack: serializeError(e)?.stack ?? 'N/A',
      })
      if (e.status === 429) {
        return c.json({ error: 'too_many_requests', message: 'You are being rate limited' }, e.status)
      }
      if (e.status >= 500) {
        await backgroundTask(c, sendDiscordAlert500(c, functionName, body, e))
      }
      c.get('sentry')?.captureException(e)
      return c.json(res, e.status)
    }
    // Non-HTTP errors: log with stack and return 500
    cloudlogErr({
      requestId: c.get('requestId'),
      functionName,
      kind: 'unhandled_error',
      method: c.req.method,
      url: c.req.url,
      errorMessage: e?.message ?? 'Unknown error',
      stack: serializeError(e)?.stack ?? 'N/A',
    })
    await backgroundTask(c, sendDiscordAlert500(c, functionName, body, e))
    c.get('sentry')?.captureException(e)
    return c.json(defaultResponse, 500)
  }
}
