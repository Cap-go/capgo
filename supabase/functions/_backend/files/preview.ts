import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { getRuntimeKey } from 'hono/adapter'
import { Hono } from 'hono/tiny'
import { simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'
import { DEFAULT_RETRY_PARAMS, RetryBucket } from './retry.ts'

// MIME type mapping for common file extensions
const MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  mjs: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  otf: 'font/otf',
  map: 'application/json',
  txt: 'text/plain',
  xml: 'application/xml',
  webmanifest: 'application/manifest+json',
  wasm: 'application/wasm',
}

function getContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return MIME_TYPES[ext] || 'application/octet-stream'
}

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

  // Look up the file in manifest - try exact match first, then with common prefixes
  let manifestEntry: { s3_path: string, file_name: string } | null = null

  // Try exact match first
  const { data: exactMatch, error: exactError } = await supabaseAdmin(c)
    .from('manifest')
    .select('s3_path, file_name')
    .eq('app_version_id', versionId)
    .eq('file_name', filePath)
    .single()

  if (!exactError && exactMatch) {
    manifestEntry = exactMatch
  }
  else {
    // Try with common prefixes (www/, public/, dist/)
    const prefixesToTry = ['www/', 'public/', 'dist/', '']
    for (const prefix of prefixesToTry) {
      const tryPath = prefix + filePath
      if (tryPath === filePath)
        continue // Already tried exact match

      const { data: prefixMatch, error: prefixError } = await supabaseAdmin(c)
        .from('manifest')
        .select('s3_path, file_name')
        .eq('app_version_id', versionId)
        .eq('file_name', tryPath)
        .single()

      if (!prefixError && prefixMatch) {
        manifestEntry = prefixMatch
        cloudlog({ requestId: c.get('requestId'), message: 'found file with prefix', originalPath: filePath, foundPath: tryPath })
        break
      }
    }
  }

  if (!manifestEntry) {
    cloudlog({ requestId: c.get('requestId'), message: 'file not found in manifest', filePath, versionId })
    return simpleError('file_not_found', 'File not found in bundle', { filePath })
  }

  // Preview only works on Cloudflare Workers where the R2 bucket is available.
  // Supabase Edge Functions cannot serve HTML files properly due to platform limitations.
  if (getRuntimeKey() !== 'workerd') {
    cloudlog({ requestId: c.get('requestId'), message: 'preview not supported on Supabase Edge Functions' })
    return simpleError('preview_not_supported', 'Preview is not supported on Supabase Edge Functions. This feature requires Cloudflare Workers with R2 bucket access.')
  }

  const bucket = c.env.ATTACHMENT_BUCKET
  if (!bucket) {
    cloudlog({ requestId: c.get('requestId'), message: 'preview bucket is null' })
    return simpleError('bucket_not_configured', 'Storage bucket not configured')
  }

  try {
    const object = await new RetryBucket(bucket, DEFAULT_RETRY_PARAMS).get(manifestEntry.s3_path)
    if (!object) {
      cloudlog({ requestId: c.get('requestId'), message: 'file not found in R2', s3_path: manifestEntry.s3_path })
      return simpleError('file_not_found', 'File not found in storage', { filePath })
    }

    // Use our own MIME type detection - R2 rewrites text/html to text/plain without custom domains
    const contentType = getContentType(filePath)
    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('etag', object.httpEtag)
    headers.set('Cache-Control', 'private, max-age=3600')
    headers.set('X-Content-Type-Options', 'nosniff')

    cloudlog({ requestId: c.get('requestId'), message: 'serving preview file from R2', filePath, contentType })
    return new Response(object.body, { headers })
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'failed to serve preview file', error, s3_path: manifestEntry.s3_path })
    return simpleError('preview_failed', 'Failed to serve preview file')
  }
}
