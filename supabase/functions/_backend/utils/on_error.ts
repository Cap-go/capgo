import type { SimpleErrorResponse } from './hono.ts'
import { HTTPException } from 'hono/http-exception'
import { sendDiscordAlert500 } from './discord.ts'
import { cloudlogErr } from './loggin.ts'
import { backgroundTask } from './utils.ts'

export function onError(functionName: string) {
  return async (e: any, c: any) => {
    c.get('sentry')?.captureException(e)
    cloudlogErr({ requestId: c.get('requestId'), functionName, message: e?.message ?? 'app onError', error: e })

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

    if (e instanceof HTTPException) {
      cloudlogErr({ requestId: c.get('requestId'), functionName, message: 'HTTPException found', status: e.status })
      if (e.status === 429) {
        return c.json({ error: 'you are beeing rate limited' }, e.status)
      }
      if (e.status >= 500) {
        await backgroundTask(c, sendDiscordAlert500(c, functionName, body, e))
      }
      const res: SimpleErrorResponse = await e.getResponse().json<SimpleErrorResponse>().catch(() => (defaultResponse))
      return c.json(res, e.status)
    }
    else {
      await backgroundTask(c, sendDiscordAlert500(c, functionName, body, e))
    }
    return c.json(defaultResponse, 500)
  }
}
