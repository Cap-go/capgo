import type { MiddlewareKeyVariables } from 'supabase/functions/_backend/utils/hono.ts'
import { requestId } from '@hono/hono/request-id'
import { sentry } from '@hono/sentry'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { Hono } from 'hono/tiny'
import { version } from '../../package.json'
import { app as download_link } from '../../supabase/functions/_backend/private/download_link.ts'
import { app as files } from '../../supabase/functions/_backend/private/files.ts'
import { app as upload_link } from '../../supabase/functions/_backend/private/upload_link.ts'

export { AttachmentUploadHandler, UploadHandler } from '../../supabase/functions/_backend/tus/uploadHandler.ts'

const app = new Hono<MiddlewareKeyVariables>()

app.use('*', sentry({
  release: version,
}))
app.use('*', logger())
app.use('*', (requestId as any)())

// Files API
app.route('/files', files)

// TODO: remove deprecated path when all users have been migrated
app.route('/private/download_link', download_link)
app.route('/private/upload_link', upload_link)
app.route('/private/files', files)
app.all('*', (c) => {
  console.log('Not found', c.req.url)
  return c.json({ error: 'Not Found' }, 404)
})
app.onError((e, c) => {
  console.log('app onError', e)
  c.get('sentry')?.captureException(e)
  if (e instanceof HTTPException) {
    console.log('HTTPException found', e.status)
    if (e.status === 429) {
      return c.json({ error: 'you are beeing rate limited' }, e.status)
    }
    return c.json({ status: 'Internal Server Error', response: e.getResponse(), error: JSON.stringify(e), message: e.message }, e.status)
  }
  return c.json({ status: 'Internal Server Error', error: JSON.stringify(e), message: e.message }, 500)
})

export default {
  fetch: app.fetch,
}
