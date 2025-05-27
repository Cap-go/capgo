import type { MiddlewareKeyVariables } from '../_backend/utils/hono.ts'
import { sentry } from '@hono/sentry'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { Hono } from 'hono/tiny'
import { app } from '../_backend/plugins/updates_lite.ts'
import { sendDiscordAlert } from '../_backend/utils/discord.ts'
import { backgroundTask } from '../_backend/utils/utils.ts'

const functionName = 'updates_lite'

const appGlobal = new Hono<MiddlewareKeyVariables>().basePath(`/${functionName}`)

const sentryDsn = Deno.env.get('SENTRY_DSN_SUPABASE')

if (sentryDsn) {
  appGlobal.use('*', sentry({
    dsn: sentryDsn,
  }))
}

appGlobal.use('*', logger())
appGlobal.use('*', requestId())

appGlobal.route('/', app)
appGlobal.all('*', (c) => {
  console.log('Not found', c.req.url)
  return c.json({ error: 'Not Found' }, 404)
})
appGlobal.onError(async (e, c) => {
  console.log('app onError', e)
  c.get('sentry')?.captureException(e)
  if (e instanceof HTTPException) {
    console.log('HTTPException found', e.status)
    if (e.status === 429) {
      return c.json({ error: 'you are beeing rate limited' }, e.status)
    }
    return c.json({ status: 'Internal Server Error', response: e.getResponse(), error: JSON.stringify(e), message: e.message }, e.status)
  }
  await backgroundTask(c as any, sendDiscordAlert(c as any, {
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
        ],
      },
    ],
  }))
  return c.json({ status: 'Internal Server Error', error: JSON.stringify(e), message: e.message }, 500)
})
Deno.serve(appGlobal.fetch)
