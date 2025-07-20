import { app as download_link } from '../../supabase/functions/_backend/private/download_link.ts'
import { app as files } from '../../supabase/functions/_backend/private/files.ts'
import { app as upload_link } from '../../supabase/functions/_backend/private/upload_link.ts'
import { createAllCatch, createHono } from '../../supabase/functions/_backend/utils/hono.ts'
import { version } from '../../supabase/functions/_backend/utils/version.ts'

export { AttachmentUploadHandler, UploadHandler } from '../../supabase/functions/_backend/tus/uploadHandler.ts'

const functionName = 'files'
const app = createHono(functionName, version, process.env.SENTRY_DSN)

// Files API
app.route('/files', files)

// TODO: remove deprecated path when all users have been migrated
app.route('/private/download_link', download_link)
app.route('/private/upload_link', upload_link)
app.route('/private/files', files)
createAllCatch(app, functionName)

export default {
  fetch: app.fetch,
}
