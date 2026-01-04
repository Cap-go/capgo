import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/*', useCors)

// GET /preview/:app_id/:version_id or GET /preview/:app_id/:version_id/*filepath
app.get('/:app_id/:version_id', middlewareAuth, handlePreview)
app.get('/:app_id/:version_id/*', middlewareAuth, handlePreview)

async function handlePreview(c: any) {
  const appId = c.req.param('app_id')
  const versionId = Number(c.req.param('version_id'))
  // Get the file path from the wildcard - default to index.html
  const rawFilePath = c.req.path.split(`/${appId}/${versionId}/`)[1] || 'index.html'
  const filePath = decodeURIComponent(rawFilePath)

  cloudlog({ requestId: c.get('requestId'), message: 'preview request', appId, versionId, filePath })

  const authorization = c.req.header('authorization')
  if (!authorization)
    return simpleError('cannot_find_authorization', 'Cannot find authorization')

  const { data: auth, error: authError } = await supabaseAdmin(c).auth.getUser(
    authorization?.split('Bearer ')[1],
  )
  if (authError || !auth?.user?.id)
    return simpleError('not_authorize', 'Not authorized')

  const userId = auth.user.id

  // Check user has read access to app
  if (!(await hasAppRight(c, appId, userId, 'read')))
    return simpleError('app_access_denied', 'You can\'t access this app', { app_id: appId })

  // Get app settings to check if preview is enabled
  const { data: appData, error: appError } = await supabaseAdmin(c)
    .from('apps')
    .select('allow_preview')
    .eq('app_id', appId)
    .single()

  if (appError || !appData) {
    return simpleError('app_not_found', 'App not found', { appId })
  }

  if (!appData.allow_preview) {
    return simpleError('preview_disabled', 'Preview is disabled for this app')
  }

  // Get bundle to check encryption and manifest
  const { data: bundle, error: bundleError } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id, session_key, manifest_count')
    .eq('app_id', appId)
    .eq('id', versionId)
    .single()

  if (bundleError || !bundle) {
    return simpleError('bundle_not_found', 'Bundle not found', { versionId })
  }

  // Check if bundle is encrypted
  if (bundle.session_key) {
    return simpleError('bundle_encrypted', 'Encrypted bundles cannot be previewed')
  }

  // Check if bundle has manifest
  if (!bundle.manifest_count || bundle.manifest_count === 0) {
    return simpleError('no_manifest', 'Bundle has no manifest and cannot be previewed')
  }

  // Look up the file in manifest
  const { data: manifestEntry, error: manifestError } = await supabaseAdmin(c)
    .from('manifest')
    .select('s3_path, file_name')
    .eq('app_version_id', versionId)
    .eq('file_name', filePath)
    .single()

  if (manifestError || !manifestEntry) {
    cloudlog({ requestId: c.get('requestId'), message: 'file not found in manifest', filePath, versionId })
    return simpleError('file_not_found', 'File not found in bundle', { filePath })
  }

  // Generate the download URL for this file
  const url = new URL(c.req.url)
  let basePath = 'files/read/attachments'
  if (url.host === 'supabase_edge_runtime_capgo:8081' || url.host === 'supabase_edge_runtime_capgo-app:8081') {
    url.host = 'localhost:54321'
    basePath = `functions/v1/files/read/attachments`
  }

  const fileUrl = `${url.protocol}//${url.host}/${basePath}/${manifestEntry.s3_path}`

  // Redirect to the file
  return c.redirect(fileUrl, 302)
}
