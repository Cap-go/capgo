import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Buffer } from 'node:buffer'
import { getRuntimeKey } from 'hono/adapter'
import { CacheHelper } from '../utils/cache.ts'
import { simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'
import { DEFAULT_RETRY_PARAMS, RetryBucket } from './retry.ts'

// Cache settings
const PREVIEW_AUTH_CACHE_PATH = '/.preview-auth'
const PREVIEW_AUTH_CACHE_TTL_SECONDS = 60

interface PreviewAuthCache {
  actualAppId: string
  allowPreview: boolean
}

interface BundleInfoCache {
  hasManifest: boolean
  isEncrypted: boolean
}

// Check if request is from a preview subdomain (*.preview[.env].capgo.app)
export function isPreviewSubdomain(hostname: string): boolean {
  return /^[^.]+\.preview(?:\.[^.]+)?\.(?:capgo\.app|usecapgo\.com)$/.test(hostname)
}

// Cache helpers for app preview authorization
function buildPreviewAuthRequest(c: Context, appId: string) {
  const helper = new CacheHelper(c)
  if (!helper.available)
    return null
  return {
    helper,
    request: helper.buildRequest(PREVIEW_AUTH_CACHE_PATH, { app_id: appId.toLowerCase() }),
  }
}

async function getPreviewAuth(c: Context, appId: string): Promise<PreviewAuthCache | null> {
  const cacheEntry = buildPreviewAuthRequest(c, appId)
  if (!cacheEntry)
    return null
  return cacheEntry.helper.matchJson<PreviewAuthCache>(cacheEntry.request)
}

function setPreviewAuth(c: Context, appId: string, data: PreviewAuthCache) {
  return backgroundTask(c, async () => {
    const cacheEntry = buildPreviewAuthRequest(c, appId)
    if (!cacheEntry)
      return
    await cacheEntry.helper.putJson(cacheEntry.request, data, PREVIEW_AUTH_CACHE_TTL_SECONDS)
  })
}

// Cache helpers for bundle info
const BUNDLE_INFO_CACHE_PATH = '/.preview-bundle'

function buildBundleInfoRequest(c: Context, versionId: number) {
  const helper = new CacheHelper(c)
  if (!helper.available)
    return null
  return {
    helper,
    request: helper.buildRequest(BUNDLE_INFO_CACHE_PATH, { version_id: String(versionId) }),
  }
}

async function getBundleInfo(c: Context, versionId: number): Promise<BundleInfoCache | null> {
  const cacheEntry = buildBundleInfoRequest(c, versionId)
  if (!cacheEntry)
    return null
  return cacheEntry.helper.matchJson<BundleInfoCache>(cacheEntry.request)
}

function setBundleInfo(c: Context, versionId: number, data: BundleInfoCache) {
  return backgroundTask(c, async () => {
    const cacheEntry = buildBundleInfoRequest(c, versionId)
    if (!cacheEntry)
      return
    await cacheEntry.helper.putJson(cacheEntry.request, data, PREVIEW_AUTH_CACHE_TTL_SECONDS)
  })
}

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

  // Decode app_id: replace __ with . (frontend lowercases and encodes . as __)
  const appId = appIdEncoded.replace(/__/g, '.')
  const versionId = Number.parseInt(versionIdStr, 10)

  if (!appId || Number.isNaN(versionId))
    return null

  return { appId, versionId }
}

// Export the handler directly for use in the main app
// This preserves the context (requestId, env bindings, etc.) from the parent app
export async function handlePreviewRequest(c: Context<MiddlewareKeyVariables>): Promise<Response> {
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

  // Check cache for app preview authorization first
  let actualAppId: string
  const cachedAuth = await getPreviewAuth(c, appId)

  if (cachedAuth) {
    if (!cachedAuth.allowPreview) {
      return simpleError('preview_disabled', 'Preview is disabled for this app')
    }
    actualAppId = cachedAuth.actualAppId
  }
  else {
    // Use admin client - preview is public when allow_preview is enabled
    const supabase = supabaseAdmin(c)

    // Get app settings to check if preview is enabled (case-insensitive since frontend lowercases)
    const { data: appData, error: appError } = await supabase
      .from('apps')
      .select('app_id, allow_preview')
      .ilike('app_id', appId)
      .single()

    if (appError || !appData) {
      return simpleError('app_not_found', 'App not found', { appId })
    }

    // Cache the app auth result
    setPreviewAuth(c, appId, {
      actualAppId: appData.app_id,
      allowPreview: appData.allow_preview ?? false,
    })

    if (!appData.allow_preview) {
      return simpleError('preview_disabled', 'Preview is disabled for this app')
    }

    actualAppId = appData.app_id
  }

  // Check cache for bundle info
  let bundleInfo = await getBundleInfo(c, versionId)

  if (!bundleInfo) {
    const supabase = supabaseAdmin(c)

    // Get bundle to check encryption and manifest
    const { data: bundle, error: bundleError } = await supabase
      .from('app_versions')
      .select('id, session_key, manifest_count')
      .eq('app_id', actualAppId)
      .eq('id', versionId)
      .single()

    if (bundleError || !bundle) {
      return simpleError('bundle_not_found', 'Bundle not found', { versionId })
    }

    bundleInfo = {
      hasManifest: (bundle.manifest_count ?? 0) > 0,
      isEncrypted: !!bundle.session_key,
    }

    // Cache the bundle info
    setBundleInfo(c, versionId, bundleInfo)
  }

  // Check if bundle is encrypted
  if (bundleInfo.isEncrypted) {
    return simpleError('bundle_encrypted', 'Encrypted bundles cannot be previewed')
  }

  // Check if bundle has manifest
  if (!bundleInfo.hasManifest) {
    return simpleError('no_manifest', 'Bundle has no manifest and cannot be previewed')
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

  // Look up file in manifest using a single query with OR conditions for all possible paths
  // This handles deep paths like /folder1/folder2/folder3/.../file.js
  // Also check for .br (brotli) compressed variants since bundles may store compressed files
  const supabase = supabaseAdmin(c)
  const basePaths = [
    filePath,
    `www/${filePath}`,
    `public/${filePath}`,
    `dist/${filePath}`,
  ]
  // Add .br variants for all paths (brotli compressed files)
  const possiblePaths = [
    ...basePaths,
    ...basePaths.map(p => `${p}.br`),
  ]

  const { data: manifestEntries, error: manifestError } = await supabase
    .from('manifest')
    .select('s3_path, file_name')
    .eq('app_version_id', versionId)
    .in('file_name', possiblePaths)
    .limit(1)

  if (manifestError || !manifestEntries || manifestEntries.length === 0) {
    cloudlog({ requestId: c.get('requestId'), message: 'file not found in manifest', filePath, versionId, possiblePaths })
    return simpleError('file_not_found', 'File not found in bundle', { filePath })
  }

  const manifestEntry = manifestEntries[0]
  const isBrotli = manifestEntry.file_name.endsWith('.br')
  // For MIME type detection, use the original filename without .br extension
  const actualFileName = isBrotli ? manifestEntry.file_name.slice(0, -3) : manifestEntry.file_name

  if (manifestEntry.file_name !== filePath) {
    cloudlog({ requestId: c.get('requestId'), message: 'found file with prefix', originalPath: filePath, foundPath: manifestEntry.file_name, isBrotli })
  }

  try {
    const object = await new RetryBucket(bucket, DEFAULT_RETRY_PARAMS).get(manifestEntry.s3_path)
    if (!object) {
      cloudlog({ requestId: c.get('requestId'), message: 'file not found in R2', s3_path: manifestEntry.s3_path })
      return simpleError('file_not_found', 'File not found in storage', { filePath })
    }

    // Use our own MIME type detection - R2 rewrites text/html to text/plain without custom domains
    const contentType = getContentType(actualFileName)
    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('etag', object.httpEtag)
    headers.set('Cache-Control', 'public, max-age=31536000, immutable') // Assets are immutable, cache forever
    headers.set('X-Content-Type-Options', 'nosniff')

    cloudlog({ requestId: c.get('requestId'), message: 'serving preview file from R2 (subdomain)', filePath: manifestEntry.file_name, contentType, isBrotli })

    // If the file is brotli compressed, decompress it before serving
    // CLI compresses with node:zlib createBrotliCompress(), we decompress with brotliDecompressSync
    // Cloudflare Workers strip Content-Encoding: br header so we must decompress server-side
    if (isBrotli && object.body) {
      const { brotliDecompressSync } = await import('node:zlib')
      const compressedData = await object.arrayBuffer()
      const decompressed = brotliDecompressSync(Buffer.from(compressedData))
      return new Response(decompressed, { headers })
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
