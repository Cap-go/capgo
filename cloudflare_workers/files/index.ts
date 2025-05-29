import type { MiddlewareKeyVariables } from 'supabase/functions/_backend/utils/hono.ts'
import { requestId } from '@hono/hono/request-id'
import { sentry } from '@hono/sentry'
import { logger } from 'hono/logger'
import { Hono } from 'hono/tiny'
import { version } from '../../package.json'
import { app as download_link } from '../../supabase/functions/_backend/private/download_link.ts'
import { app as files } from '../../supabase/functions/_backend/private/files.ts'
import { app as upload_link } from '../../supabase/functions/_backend/private/upload_link.ts'
import { onError } from 'supabase/functions/_backend/utils/on_error.ts'

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
app.onError(onError('Worker Files'))

export default {
  fetch: app.fetch,
}
