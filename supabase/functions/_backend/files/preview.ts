import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { getRuntimeKey } from 'hono/adapter'
import { getCookie, setCookie } from 'hono/cookie'
import { Hono } from 'hono/tiny'
import { simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { supabaseClient } from '../utils/supabase.ts'
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

// Cookie name for storing the auth token
const TOKEN_COOKIE_NAME = 'capgo_preview_token'

// Parse subdomain format: {app_id_with_dots_as_underscores}-{version_id}.preview[.env].capgo.app
// Example: ee__forgr__capacitor_go-222063.preview.capgo.app
function parsePreviewSubdomain(hostname: string): { appId: string, versionId: number } | null {
  // Match pattern: {something}.preview[.optional-env].capgo.app or usecapgo.com
  const match = hostname.match(/^([^.]+)\.preview(?:\.[^.]+)?\.(?:capgo\.app|usecapgo\.com)$/)
  if (!match)
    return null

  const subdomain = match[1]
  // Split by last hyphen to get app_id and version_id
  // app_id has dots replaced with double underscores
  const lastHyphen = subdomain.lastIndexOf('-')
  if (lastHyphen === -1)
    return null

  const appIdEncoded = subdomain.substring(0, lastHyphen)
  const versionIdStr = subdomain.substring(lastHyphen + 1)

  // Decode app_id: replace __ with .
  const appId = appIdEncoded.replace(/__/g, '.')
  const versionId = Number.parseInt(versionIdStr, 10)

  if (!appId || Number.isNaN(versionId))
    return null

  return { appId, versionId }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/*', useCors)

// Handle all requests from subdomain - files are served from root
app.get('/*', handlePreviewSubdomain)

async function handlePreviewSubdomain(c: Context<MiddlewareKeyVariables>) {
  const hostname = c.req.header('host') || ''
  const parsed = parsePreviewSubdomain(hostname)

  if (!parsed) {
    cloudlog({ requestId: c.get('requestId'), message: 'invalid preview subdomain', hostname })
    return simpleError('invalid_subdomain', 'Invalid preview subdomain format. Expected: {app_id}-{version_id}.preview.capgo.app')
  }

  const { appId, versionId } = parsed

  // Get the file path from the request path - default to index.html
  let filePath = c.req.path.slice(1) || 'index.html' // Remove leading slash
  filePath = decodeURIComponent(filePath)
  // Remove query string if present
  if (filePath.includes('?'))
    filePath = filePath.split('?')[0]

  cloudlog({ requestId: c.get('requestId'), message: 'preview subdomain request', hostname, appId, versionId, filePath })

  // Accept token from: query param (first request), cookie (subsequent requests), or Authorization header
  const authorization = c.req.header('authorization')
  const tokenFromQuery = c.req.query('token')
  const tokenFromCookie = getCookie(c, TOKEN_COOKIE_NAME)
  const token = authorization?.split('Bearer ')[1] || tokenFromQuery || tokenFromCookie

  if (!token)
    return simpleError('cannot_find_authorization', 'Cannot find authorization. Pass token as query param on first request.')

  // Use authenticated client - RLS will enforce access based on JWT
  const supabase = supabaseClient(c, `Bearer ${token}`)

  // Get app settings to check if preview is enabled
  const { data: appData, error: appError } = await supabase
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
  const { data: bundle, error: bundleError } = await supabase
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
  const { data: exactMatch, error: exactError } = await supabase
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

      const { data: prefixMatch, error: prefixError } = await supabase
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

    cloudlog({ requestId: c.get('requestId'), message: 'serving preview file from R2 (subdomain)', filePath, contentType })

    // If token came from query param, set it in a cookie for subsequent requests
    // This allows assets to load without needing the token in every URL
    if (tokenFromQuery && !tokenFromCookie) {
      // Set cookie with same-site strict for security, httpOnly to prevent JS access
      // Path=/ so it works for all paths in this subdomain
      setCookie(c, TOKEN_COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 3600, // 1 hour, matches cache control
      })
    }

    return new Response(object.body, { headers })
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'failed to serve preview file', error, s3_path: manifestEntry.s3_path })
    return simpleError('preview_failed', 'Failed to serve preview file')
  }
}

// Export helper for generating preview URLs
export function generatePreviewUrl(appId: string, versionId: number, env: 'prod' | 'preprod' | 'dev' = 'prod'): string {
  // Encode app_id: replace . with __
  const encodedAppId = appId.replace(/\./g, '__')
  const subdomain = `${encodedAppId}-${versionId}`

  const envPrefix = env === 'prod' ? '' : `.${env}`
  return `https://${subdomain}.preview${envPrefix}.capgo.app`
}
