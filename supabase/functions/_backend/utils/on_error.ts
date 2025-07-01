import { HTTPException } from 'hono/http-exception'
import { sendDiscordAlert } from './discord.ts'
import { cloudlogErr } from './loggin.ts'
import { backgroundTask, getEnv } from './utils.ts'
import { SimpleErrorResponse } from './hono.ts'

export function onError(functionName: string) {
  return async (e: any, c: any) => {
    cloudlogErr({ requestId: c.get('requestId'), functionName, message: 'app onError', error: e })
    c.get('sentry')?.captureException(e)

    const requestId = c.get('requestId') ?? 'unknown'
    const timestamp = new Date().toISOString()
    const userAgent = c.req.header('user-agent') ?? 'unknown'
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown'
    const method = c.req.method
    const url = c.req.url
    const headers = Object.fromEntries(c.req.raw.headers.entries())

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

    const errorMessage = e?.message ?? 'Unknown error'
    const errorStack = e?.stack ?? 'No stack trace'
    const errorName = e?.name ?? 'Error'
    // const safeCause = e ? JSON.stringify(e, Object.getOwnPropertyNames(e)) : undefined
    const defaultResponse: SimpleErrorResponse = {
      errorCode: 'unknown_error',
      message: 'Unknown error',
      // cause: safeCause,
      moreInfo: {},
    }

    await backgroundTask(c, sendDiscordAlert(c, {
      content: `🚨 **${functionName}** Error Alert`,
      embeds: [
        {
          title: `❌ ${functionName} Function Failed`,
          description: `**Error:** ${errorName}\n**Message:** ${errorMessage}`,
          color: 0xFF0000, // Red color
          timestamp,
          fields: [
            {
              name: '🔍 Request Details',
              value: `**Method:** ${method}\n**URL:** ${url}\n**Request ID:** ${requestId}`,
              inline: false,
            },
            {
              name: '🌐 Client Info',
              value: `**IP:** ${ip}\n**User-Agent:** ${userAgent}`,
              inline: false,
            },
            {
              name: '📝 Request Body',
              value: `\`\`\`\n${body}\n\`\`\``,
              inline: false,
            },
            {
              name: '🔧 Headers',
              value: `\`\`\`json\n${JSON.stringify(headers, null, 2).substring(0, 1000)}\n\`\`\``,
              inline: false,
            },
            {
              name: '💥 Error Stack',
              value: `\`\`\`\n${errorStack.substring(0, 1000)}\n\`\`\``,
              inline: false,
            },
            {
              name: '🔍 Full Error Object',
              value: `\`\`\`json\n${JSON.stringify(e, Object.getOwnPropertyNames(e), 2).substring(0, 1000)}\n\`\`\``,
              inline: false,
            },
          ],
          footer: {
            text: `Function: ${functionName} | Environment: ${getEnv(c as any, 'ENVIRONMENT') || 'unknown'}`,
          },
        },
      ],
    })).catch((e: any) => {
      cloudlogErr({ requestId: c.get('requestId'), functionName, message: 'sendDiscordAlert failed', error: e })
      return
    })
    if (e instanceof HTTPException) {
      cloudlogErr({ requestId: c.get('requestId'), functionName, message: 'HTTPException found', status: e.status })
      if (e.status === 429) {
        return c.json({ error: 'you are beeing rate limited' }, e.status)
      }
      const res: SimpleErrorResponse = await e.getResponse().json<SimpleErrorResponse>().catch(() => (defaultResponse))
      console.log('res of ERROR', res)
      return c.json(res, e.status)
    }
    return c.json(defaultResponse, 500)
  }
}
