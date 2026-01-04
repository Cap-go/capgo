import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { s3 } from '../utils/s3.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/*', useCors)

// GET /preview/:app_id/:version_id or GET /preview/:app_id/:version_id/*filepath
// Note: We don't use middlewareAuth here because iframes can't send headers
// Instead, we accept the token from either Authorization header or query param
app.get('/:app_id/:version_id', handlePreview)
app.get('/:app_id/:version_id/*', handlePreview)

async function handlePreview(c: Context<MiddlewareKeyVariables>) {
  const appId = c.req.param('app_id')
  const versionId = Number(c.req.param('version_id'))
  // Get the file path from the wildcard - default to index.html
  const rawFilePath = c.req.path.split(`/${appId}/${versionId}/`)[1] || 'index.html'
  const filePath = decodeURIComponent(rawFilePath)

  cloudlog({ requestId: c.get('requestId'), message: 'preview request', appId, versionId, filePath })

  // Accept token from Authorization header OR query param (for iframe support)
  const authorization = c.req.header('authorization')
  const tokenFromQuery = c.req.query('token')
  const token = authorization?.split('Bearer ')[1] || tokenFromQuery

  if (!token)
    return simpleError('cannot_find_authorization', 'Cannot find authorization. Pass token as query param or Authorization header.')

  const { data: auth, error: authError } = await supabaseAdmin(c).auth.getUser(token)
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

  // Generate a time-limited signed URL for this file (expires in 1 hour)
  // This is more secure than redirecting to the unauthenticated files endpoint
  const PREVIEW_URL_EXPIRY_SECONDS = 3600
  try {
    const signedUrl = await s3.getSignedUrl(c, manifestEntry.s3_path, PREVIEW_URL_EXPIRY_SECONDS)
    cloudlog({ requestId: c.get('requestId'), message: 'generated signed preview URL', filePath })
    return c.redirect(signedUrl, 302)
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'failed to generate signed URL', error, s3_path: manifestEntry.s3_path })
    return simpleError('signed_url_failed', 'Failed to generate preview URL')
  }
}
