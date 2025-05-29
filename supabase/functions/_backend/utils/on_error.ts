import { HTTPException } from 'hono/http-exception'
import { sendDiscordAlert } from './discord'
import { backgroundTask } from './utils'

export function onError(functionName: string) {
  return async (e: any, c: any) => {
    console.log('app onError', e)
    c.get('sentry')?.captureException(e)
    await backgroundTask(c, sendDiscordAlert(c, {
      content: `Function: ${functionName}`,
      embeds: [
        {
          title: `Failed to process ${functionName}`,
          description: `Function: ${functionName}`,
          fields: [
            {
              name: 'Error',
              value: JSON.stringify(e),
            },
            {
              name: 'Request',
              value: JSON.stringify(c.req.raw),
            },
          ],
        },
      ],
    }))
    if (e instanceof HTTPException) {
      console.log('HTTPException found', e.status)
      if (e.status === 429) {
        return c.json({ error: 'you are beeing rate limited' }, e.status)
      }
      return c.json({ status: 'Internal Server Error', response: e.getResponse(), error: JSON.stringify(e), message: e.message }, e.status)
    }
    return c.json({ status: 'Internal Server Error', error: JSON.stringify(e), message: e.message }, 500)
  }
}
