import type { Context } from 'hono'
import type { SimpleErrorResponse } from './hono.ts'
import { DrizzleError, entityKind, TransactionRollbackError } from 'drizzle-orm'
import { sendDiscordAlert500 } from './discord.ts'
import { cloudlogErr, serializeError } from './logging.ts'
import { backgroundTask } from './utils.ts'

const drizzleErrorNames = new Set(['DrizzleError', 'DrizzleQueryError', 'TransactionRollbackError'])

export function onError(functionName: string) {
  return async (e: any, c: Context) => {
    let body = 'N/A'
    try {
      body = await c.req.json().then(body => JSON.stringify(body)).catch(failToReadBody => `Failed to read body (${JSON.stringify(failToReadBody)})`)
      if (body.length > 1000) {
        body = `${body.substring(0, 1000)}... (truncated)`
      }
    }
    catch (failToReadBody) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'failToReadBody', failToReadBody })
      body = `Failed to read body (${JSON.stringify(failToReadBody)})`
    }

    // const safeCause = e ? JSON.stringify(e, Object.getOwnPropertyNames(e)) : undefined
    const defaultResponse: SimpleErrorResponse = {
      error: 'unknown_error',
      message: 'Unknown error',
      // cause: safeCause,
      moreInfo: {},
    }

    const isHttpException = e && typeof e === 'object' && typeof e.status === 'number' && typeof e.getResponse === 'function'
    // DrizzleError detection: check for known Drizzle error classes or entityKind
    const isDrizzleError
      = e instanceof DrizzleError
        || e instanceof TransactionRollbackError
        || (typeof e === 'object' && e !== null && ((
          typeof (e as any)[entityKind] === 'string' && drizzleErrorNames.has((e as any)[entityKind])
        ) || (
          typeof (e as any).name === 'string' && drizzleErrorNames.has((e as any).name)
        )))

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
    if (isDrizzleError) {
      // Log Drizzle errors with more detailed information
      cloudlogErr({
        requestId: c.get('requestId'),
        functionName,
        kind: 'drizzle_error',
        method: c.req.method,
        url: c.req.url,
        errorMessage: e?.message ?? 'Unknown error',
        stack: serializeError(e)?.stack ?? 'N/A',
        moreInfo: {
          drizzleErrorCause: serializeError((e as Error).cause),
        },
      })
      await backgroundTask(c, sendDiscordAlert500(c, functionName, body, e))
      c.get('sentry')?.captureException(e)
      return c.json(defaultResponse, 500)
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
