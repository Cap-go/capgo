import { env } from 'node:process'
import { app as files } from '../../supabase/functions/_backend/files/files.ts'
import { app as preview } from '../../supabase/functions/_backend/files/preview.ts'
import { app as download_link } from '../../supabase/functions/_backend/private/download_link.ts'
import { app as upload_link } from '../../supabase/functions/_backend/private/upload_link.ts'
import { app as ok } from '../../supabase/functions/_backend/public/ok.ts'
import { createAllCatch, createHono } from '../../supabase/functions/_backend/utils/hono.ts'
import { version } from '../../supabase/functions/_backend/utils/version.ts'

export { AttachmentUploadHandler, UploadHandler } from '../../supabase/functions/_backend/files/uploadHandler.ts'

const functionName = 'files'
const app = createHono(functionName, version, env.SENTRY_DSN)

// Check if request is from a preview subdomain (*.preview[.env].capgo.app)
function isPreviewSubdomain(hostname: string): boolean {
  return /^[^.]+\.preview(?:\.[^.]+)?\.(?:capgo\.app|usecapgo\.com)$/.test(hostname)
}

// Middleware to route preview subdomain requests
app.use('/*', async (c, next) => {
  const hostname = c.req.header('host') || ''
  if (isPreviewSubdomain(hostname)) {
    // Route all requests from preview subdomains to the subdomain handler
    return preview.fetch(c.req.raw, c.env, c.executionCtx)
  }
  return next()
})

// Files API
app.route('/files', files)
app.route('/ok', ok)

// TODO: remove deprecated path when all users have been migrated
app.route('/private/download_link', download_link)
app.route('/private/upload_link', upload_link)
app.route('/private/files', files)
createAllCatch(app, functionName)

export default {
  fetch: app.fetch,
}
