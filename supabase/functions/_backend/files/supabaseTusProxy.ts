import type { Context } from 'hono'
import { cloudlog } from '../utils/logging.ts'
import { getEnv } from '../utils/utils.ts'
import { parseUploadMetadata } from './parse.ts'
import { ALLOWED_HEADERS, ALLOWED_METHODS, EXPOSED_HEADERS, MAX_UPLOAD_LENGTH_BYTES, TUS_EXTENSIONS, TUS_VERSION } from './util.ts'

const BUCKET_NAME = 'capgo'
const SUPABASE_TIMEOUT = 1000 * 60 * 5 // 5 minutes for large uploads

/**
 * UTF-8 safe base64 encoding
 * Uses TextEncoder to handle Unicode characters properly
 */
function utf8ToBase64(str: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/**
 * Build the Supabase Storage TUS endpoint URL
 * Note: From inside the Docker container, Supabase is at kong:8000, not localhost:54321
 */
function buildSupabaseTusUrl(c: Context, uploadId?: string): string {
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  if (uploadId) {
    return `${supabaseUrl}/storage/v1/upload/resumable/${uploadId}`
  }
  return `${supabaseUrl}/storage/v1/upload/resumable`
}

/**
 * Transform metadata to include Supabase-required bucketName and objectName
 * Preserves client-provided metadata like filetype for MIME type support
 */
function transformMetadataForSupabase(c: Context, objectName: string): string {
  const bucketNameB64 = utf8ToBase64(BUCKET_NAME)
  const objectNameB64 = utf8ToBase64(objectName)
  const filenameB64 = utf8ToBase64(objectName)

  let metadata = `bucketName ${bucketNameB64},objectName ${objectNameB64},filename ${filenameB64}`

  // Preserve filetype from original metadata if present
  const originalMetadata = parseUploadMetadata(c, c.req.raw.headers)
  if (originalMetadata.filetype) {
    const filetypeB64 = utf8ToBase64(originalMetadata.filetype)
    metadata += `,filetype ${filetypeB64}`
  }

  return metadata
}

function summarizePathLike(value: string | null | undefined) {
  if (!value) {
    return {
      present: false,
      isAbsoluteUrl: false,
      segmentCount: 0,
      hasQueryString: false,
      hasHash: false,
    }
  }

  let path = value
  let isAbsoluteUrl = false
  let hasQueryString = false
  let hasHash = false

  try {
    const parsed = new URL(value)
    path = parsed.pathname
    isAbsoluteUrl = true
    hasQueryString = parsed.search.length > 0
    hasHash = parsed.hash.length > 0
  }
  catch {
    const queryStart = value.indexOf('?')
    const hashStart = value.indexOf('#')
    hasQueryString = queryStart >= 0
    hasHash = hashStart >= 0

    const end = [queryStart, hashStart]
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0]
    path = end == null ? value : value.slice(0, end)
  }

  return {
    present: true,
    isAbsoluteUrl,
    segmentCount: path.split('/').filter(Boolean).length,
    hasQueryString,
    hasHash,
  }
}

function summarizeIdentifier(value: unknown) {
  if (typeof value !== 'string') {
    return {
      present: value != null,
      type: typeof value,
      segmentCount: 0,
      containsSlash: false,
    }
  }

  return {
    present: value.length > 0,
    type: 'string',
    segmentCount: value.split('/').filter(Boolean).length,
    containsSlash: value.includes('/'),
  }
}

function summarizeTusEndpoint(url: string, uploadId?: string) {
  return {
    ...summarizePathLike(url),
    hasUploadId: uploadId != null,
  }
}

function summarizeTusMetadata(metadata: string) {
  const keys = metadata
    .split(',')
    .map(part => part.trim().split(/\s+/, 1)[0])
    .filter(Boolean)

  return {
    present: metadata.length > 0,
    keyCount: keys.length,
    hasBucketName: keys.includes('bucketName'),
    hasObjectName: keys.includes('objectName'),
    hasFilename: keys.includes('filename'),
    hasFiletype: keys.includes('filetype'),
  }
}

function summarizeError(error: unknown) {
  return {
    type: error instanceof Error ? error.name : typeof error,
  }
}

/**
 * Rewrite Supabase Location header to Capgo API URL
 */
function rewriteLocationHeader(c: Context, supabaseLocation: string): string {
  const requestId = c.get('requestId')

  // Extract uploadId from Supabase URL in a robust way
  let uploadId: string | undefined
  try {
    const url = new URL(supabaseLocation)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    uploadId = pathSegments[pathSegments.length - 1]
  }
  catch {
    const pathWithoutQuery = supabaseLocation.split('?')[0].split('#')[0]
    const pathSegments = pathWithoutQuery.split('/').filter(Boolean)
    uploadId = pathSegments[pathSegments.length - 1]
  }

  if (!uploadId) {
    cloudlog({
      requestId,
      message: 'rewriteLocationHeader - failed to extract uploadId',
      location: summarizePathLike(supabaseLocation),
    })
    throw new Error('Failed to extract uploadId from Supabase Location header')
  }

  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  const isLocalDev = supabaseUrl.includes('kong:8000')

  let forwardedHost = c.req.header('X-Forwarded-Host')
  const forwardedPort = c.req.header('X-Forwarded-Port')
  const forwardedProtoRaw = c.req.header('X-Forwarded-Proto')
  const forwardedProto = forwardedProtoRaw?.split(',')[0]?.trim() || (isLocalDev ? 'http' : 'https')
  const hostHeader = c.req.header('Host')

  if (isLocalDev && forwardedHost && !forwardedHost.includes(':')) {
    // X-Forwarded-Host sometimes omits the port. Prefer X-Forwarded-Port, then Host header.
    const portToUse = forwardedPort
      || (hostHeader && hostHeader.includes(':') ? hostHeader.split(':').pop() : undefined)
      || '54321'
    forwardedHost = `${forwardedHost}:${portToUse}`
  }

  cloudlog({
    requestId,
    message: 'rewriteLocationHeader debug',
    supabaseEndpoint: summarizeTusEndpoint(supabaseUrl),
    hasForwardedHost: forwardedHost != null,
    hasForwardedPort: forwardedPort != null,
    hasForwardedProto: forwardedProtoRaw != null,
    forwardedProtoIsHttps: forwardedProto === 'https',
    hasHostHeader: hostHeader != null,
    isLocalDev,
  })

  let baseUrl: string
  if (forwardedHost) {
    baseUrl = `${forwardedProto}://${forwardedHost}`
  }
  else if (isLocalDev) {
    // Best-effort fallback; callers should generally send Host / X-Forwarded-* so we preserve the correct worktree port.
    baseUrl = `http://${hostHeader || 'localhost:54321'}`
  }
  else {
    cloudlog({
      requestId,
      message: 'rewriteLocationHeader - WARNING: Using SUPABASE_URL as fallback. Consider setting X-Forwarded-Host.',
      supabaseEndpoint: summarizeTusEndpoint(supabaseUrl),
    })
    baseUrl = supabaseUrl
  }

  let baseUrlSource: 'forwarded-host' | 'local-host' | 'supabase-url'
  if (forwardedHost) {
    baseUrlSource = 'forwarded-host'
  }
  else if (isLocalDev) {
    baseUrlSource = 'local-host'
  }
  else {
    baseUrlSource = 'supabase-url'
  }

  cloudlog({
    requestId,
    message: 'rewriteLocationHeader result',
    baseUrl: summarizePathLike(baseUrl),
    baseUrlSource,
  })
  return `${baseUrl}/functions/v1/files/upload/attachments/${uploadId}`
}

/**
 * Build common TUS response headers
 */
function buildTusResponseHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS)
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS)
  headers.set('Access-Control-Expose-Headers', EXPOSED_HEADERS)
  headers.set('Tus-Resumable', TUS_VERSION)
  headers.set('Tus-Version', TUS_VERSION)
  headers.set('Tus-Max-Size', MAX_UPLOAD_LENGTH_BYTES.toString())
  headers.set('Tus-Extension', TUS_EXTENSIONS)
  return headers
}

/**
 * Build authorization headers for Supabase requests
 */
function buildSupabaseAuthHeaders(c: Context): Headers {
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${serviceRoleKey}`)
  headers.set('Tus-Resumable', TUS_VERSION)
  return headers
}

/**
 * Forward specific headers from client request to Supabase
 */
function forwardHeaders(c: Context, headers: Headers, headerNames: string[]): void {
  for (const header of headerNames) {
    const value = c.req.header(header)
    if (value)
      headers.set(header, value)
  }
}

/**
 * Copy specific headers from Supabase response to client response
 */
function copyResponseHeaders(from: Headers, to: Headers, headerNames: string[]): void {
  for (const header of headerNames) {
    const value = from.get(header)
    if (value)
      to.set(header, value)
  }
}

/**
 * Make a proxied request to Supabase with timeout and error handling
 */
async function proxyToSupabase(
  requestId: string,
  handlerName: string,
  url: string,
  options: RequestInit,
): Promise<Response | { error: true, response: Response }> {
  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT),
    })
  }
  catch (error) {
    cloudlog({ requestId, message: `${handlerName} fetch error`, error: summarizeError(error) })
    return {
      error: true,
      response: new Response(JSON.stringify({ error: 'upstream_error', message: 'Failed to communicate with storage backend' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    }
  }
}

/**
 * Read error body from Supabase response for forwarding
 */
async function readErrorBody(response: Response): Promise<string | null> {
  if (response.ok)
    return null
  try {
    const text = await response.text()
    return text || null
  }
  catch {
    return null
  }
}

/**
 * Handle TUS POST request - create a new upload
 */
export async function supabaseTusCreateHandler(c: Context): Promise<Response> {
  const requestId = c.get('requestId')
  const rawFileId = c.get('fileId')

  if (typeof rawFileId !== 'string' || rawFileId.length === 0) {
    cloudlog({ requestId, message: 'supabaseTusCreateHandler missing or invalid fileId', fileId: summarizeIdentifier(rawFileId) })
    return new Response(JSON.stringify({ error: 'internal_error', message: 'Internal server error: missing fileId' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  cloudlog({ requestId, message: 'supabaseTusCreateHandler', fileId: summarizeIdentifier(rawFileId) })

  const supabaseUrl = buildSupabaseTusUrl(c)
  const headers = buildSupabaseAuthHeaders(c)
  forwardHeaders(c, headers, ['Upload-Length', 'Upload-Defer-Length', 'Content-Type', 'Content-Length', 'X-Upsert'])

  const transformedMetadata = transformMetadataForSupabase(c, rawFileId)
  headers.set('Upload-Metadata', transformedMetadata)

  cloudlog({
    requestId,
    message: 'supabaseTusCreateHandler forwarding',
    supabaseEndpoint: summarizeTusEndpoint(supabaseUrl),
    metadata: summarizeTusMetadata(transformedMetadata),
  })

  const result = await proxyToSupabase(requestId, 'supabaseTusCreateHandler', supabaseUrl, {
    method: 'POST',
    headers,
    body: c.req.raw.body,
  })

  if ('error' in result)
    return result.response

  const response = result
  cloudlog({ requestId, message: 'supabaseTusCreateHandler response', status: response.status })

  const responseHeaders = buildTusResponseHeaders()
  copyResponseHeaders(response.headers, responseHeaders, ['Upload-Offset', 'Upload-Expires'])

  const location = response.headers.get('Location')
  if (location) {
    const rewrittenLocation = rewriteLocationHeader(c, location)
    responseHeaders.set('Location', rewrittenLocation)
    cloudlog({
      requestId,
      message: 'supabaseTusCreateHandler location rewritten',
      original: summarizePathLike(location),
      rewritten: summarizePathLike(rewrittenLocation),
    })
  }

  let responseBody: BodyInit | null = null
  if (response.status >= 400) {
    responseBody = await readErrorBody(response)
    if (responseBody) {
      const contentType = response.headers.get('Content-Type')
      if (contentType)
        responseHeaders.set('Content-Type', contentType)
    }
  }

  return new Response(responseBody, { status: response.status, headers: responseHeaders })
}

/**
 * Handle TUS PATCH request - upload chunk
 */
export async function supabaseTusPatchHandler(c: Context): Promise<Response> {
  const requestId = c.get('requestId')
  const uploadId = c.req.param('id')

  cloudlog({ requestId, message: 'supabaseTusPatchHandler', uploadId: summarizeIdentifier(uploadId) })

  const supabaseUrl = buildSupabaseTusUrl(c, uploadId)
  const headers = buildSupabaseAuthHeaders(c)
  forwardHeaders(c, headers, ['Upload-Offset', 'Content-Type', 'Content-Length', 'Upload-Length'])

  cloudlog({ requestId, message: 'supabaseTusPatchHandler forwarding', supabaseEndpoint: summarizeTusEndpoint(supabaseUrl, uploadId) })

  const result = await proxyToSupabase(requestId, 'supabaseTusPatchHandler', supabaseUrl, {
    method: 'PATCH',
    headers,
    body: c.req.raw.body,
  })

  if ('error' in result)
    return result.response

  const response = result
  cloudlog({ requestId, message: 'supabaseTusPatchHandler response', status: response.status })

  const responseHeaders = buildTusResponseHeaders()
  copyResponseHeaders(response.headers, responseHeaders, ['Upload-Offset', 'Upload-Expires'])

  const body = await readErrorBody(response)
  return new Response(body, { status: response.status, headers: responseHeaders })
}

/**
 * Handle TUS HEAD request - check upload progress
 */
export async function supabaseTusHeadHandler(c: Context): Promise<Response> {
  const requestId = c.get('requestId')
  const uploadId = c.req.param('id')

  cloudlog({ requestId, message: 'supabaseTusHeadHandler', uploadId: summarizeIdentifier(uploadId) })

  const supabaseUrl = buildSupabaseTusUrl(c, uploadId)
  const headers = buildSupabaseAuthHeaders(c)

  cloudlog({ requestId, message: 'supabaseTusHeadHandler forwarding', supabaseEndpoint: summarizeTusEndpoint(supabaseUrl, uploadId) })

  const result = await proxyToSupabase(requestId, 'supabaseTusHeadHandler', supabaseUrl, {
    method: 'HEAD',
    headers,
  })

  if ('error' in result)
    return result.response

  const response = result
  cloudlog({ requestId, message: 'supabaseTusHeadHandler response', status: response.status })

  const responseHeaders = buildTusResponseHeaders()
  responseHeaders.set('Cache-Control', 'no-store')
  copyResponseHeaders(response.headers, responseHeaders, ['Upload-Offset', 'Upload-Length', 'Upload-Expires'])

  const body = await readErrorBody(response)
  return new Response(body, { status: response.status, headers: responseHeaders })
}
