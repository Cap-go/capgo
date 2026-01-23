import type { Context } from 'hono'
import { cloudlog } from '../utils/logging.ts'
import { getEnv } from '../utils/utils.ts'
import { parseUploadMetadata } from './parse.ts'
import { ALLOWED_HEADERS, ALLOWED_METHODS, EXPOSED_HEADERS, MAX_UPLOAD_LENGTH_BYTES, TUS_VERSION } from './util.ts'

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
  // supabaseUrl is already the internal Docker URL (http://kong:8000)
  // No transformation needed since we're making requests from inside the container

  if (uploadId) {
    return `${supabaseUrl}/storage/v1/upload/resumable/${uploadId}`
  }
  return `${supabaseUrl}/storage/v1/upload/resumable`
}

/**
 * Transform metadata to include Supabase-required bucketName and objectName
 * Preserves client-provided metadata like filetype for MIME type support
 * Input:  filename {base64(path)},filetype {base64(mimetype)}
 * Output: bucketName {base64('capgo')},objectName {base64(path)},filename {base64(path)},filetype {base64(mimetype)}
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

/**
 * Rewrite Supabase Location header to Capgo API URL
 * Input:  http://kong:8000/storage/v1/upload/resumable/{uploadId}
 * Output: {external_url}/files/upload/attachments/{uploadId}
 *
 * Since we're inside Docker, c.req.url has internal URLs.
 * We need to determine the external URL that clients can access.
 */
function rewriteLocationHeader(c: Context, supabaseLocation: string): string {
  const requestId = c.get('requestId')

  // Extract uploadId from Supabase URL in a robust way (handle trailing slashes, query, fragment)
  let uploadId: string | undefined
  try {
    const url = new URL(supabaseLocation)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    uploadId = pathSegments[pathSegments.length - 1]
  }
  catch {
    // Fallback for non-absolute URLs: strip query/fragment and get last non-empty segment
    const pathWithoutQuery = supabaseLocation.split('?')[0].split('#')[0]
    const pathSegments = pathWithoutQuery.split('/').filter(Boolean)
    uploadId = pathSegments[pathSegments.length - 1]
  }

  if (!uploadId) {
    cloudlog({ requestId, message: 'rewriteLocationHeader - failed to extract uploadId', supabaseLocation })
    throw new Error('Failed to extract uploadId from Supabase Location header')
  }

  // Get SUPABASE_URL to detect environment
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  const isLocalDev = supabaseUrl.includes('kong:8000')

  // Try to get the external URL from X-Forwarded headers (set by production proxy)
  let forwardedHost = c.req.header('X-Forwarded-Host')
  const forwardedProto = c.req.header('X-Forwarded-Proto') || 'https'

  // For local development, Kong sends localhost without port
  // We need to add port 54321
  if (isLocalDev && forwardedHost && !forwardedHost.includes(':')) {
    if (forwardedHost === 'localhost' || forwardedHost === '127.0.0.1') {
      forwardedHost = `${forwardedHost}:54321`
    }
  }

  cloudlog({ requestId, message: 'rewriteLocationHeader debug', supabaseUrl, forwardedHost, forwardedProto, isLocalDev })

  let baseUrl: string
  if (forwardedHost) {
    // Use forwarded headers (with potentially adjusted port for local dev)
    baseUrl = `${forwardedProto}://${forwardedHost}`
  }
  else if (isLocalDev) {
    // Local development: Transform to localhost:54321
    baseUrl = 'http://localhost:54321'
  }
  else {
    // Production self-hosted: SUPABASE_URL should be the external URL
    // Warning: This may not work correctly if SUPABASE_URL is an internal URL
    cloudlog({
      requestId,
      message: 'rewriteLocationHeader - WARNING: Using SUPABASE_URL as fallback for external URL. This may not work if SUPABASE_URL is an internal URL. Consider setting X-Forwarded-Host header or EXTERNAL_URL env var.',
      supabaseUrl,
    })
    baseUrl = supabaseUrl
  }

  cloudlog({ requestId, message: 'rewriteLocationHeader result', baseUrl })

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
  headers.set('Tus-Extension', 'creation,creation-defer-length,creation-with-upload,expiration')
  return headers
}

/**
 * Handle TUS POST request - create a new upload
 */
export async function supabaseTusCreateHandler(c: Context): Promise<Response> {
  const requestId = c.get('requestId')
  const rawFileId = c.get('fileId')

  if (typeof rawFileId !== 'string' || rawFileId.length === 0) {
    cloudlog({
      requestId,
      message: 'supabaseTusCreateHandler missing or invalid fileId in context',
      fileId: rawFileId,
    })
    return new Response(JSON.stringify({ error: 'internal_error', message: 'Internal server error: missing fileId' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const fileId = rawFileId

  cloudlog({ requestId, message: 'supabaseTusCreateHandler', fileId })

  const supabaseUrl = buildSupabaseTusUrl(c)
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')

  // Build headers for Supabase
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${serviceRoleKey}`)
  headers.set('Tus-Resumable', TUS_VERSION)

  // Forward TUS headers
  const tusHeaders = ['Upload-Length', 'Upload-Defer-Length', 'Content-Type', 'Content-Length', 'X-Upsert']
  for (const header of tusHeaders) {
    const value = c.req.header(header)
    if (value)
      headers.set(header, value)
  }

  // Transform metadata to include bucket and object name (preserves filetype)
  const transformedMetadata = transformMetadataForSupabase(c, fileId)
  headers.set('Upload-Metadata', transformedMetadata)

  cloudlog({ requestId, message: 'supabaseTusCreateHandler forwarding to Supabase', supabaseUrl, transformedMetadata })

  // Forward the request to Supabase with timeout and error handling
  let response: Response
  try {
    response = await fetch(supabaseUrl, {
      method: 'POST',
      headers,
      body: c.req.raw.body,
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT),
    })
  }
  catch (error) {
    cloudlog({ requestId, message: 'supabaseTusCreateHandler fetch error', error: error instanceof Error ? error.message : String(error) })
    return new Response(JSON.stringify({ error: 'upstream_error', message: 'Failed to communicate with storage backend' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  cloudlog({ requestId, message: 'supabaseTusCreateHandler response', status: response.status })

  // Build response headers
  const responseHeaders = buildTusResponseHeaders()

  // Copy relevant headers from Supabase response
  const copyHeaders = ['Upload-Offset', 'Upload-Expires']
  for (const header of copyHeaders) {
    const value = response.headers.get(header)
    if (value)
      responseHeaders.set(header, value)
  }

  // Rewrite Location header
  const location = response.headers.get('Location')
  if (location) {
    const rewrittenLocation = rewriteLocationHeader(c, location)
    responseHeaders.set('Location', rewrittenLocation)
    cloudlog({ requestId, message: 'supabaseTusCreateHandler location rewritten', original: location, rewritten: rewrittenLocation })
  }

  // Forward Supabase error body (if any) to the client for 4xx/5xx responses
  let responseBody: BodyInit | null = null
  if (response.status >= 400) {
    try {
      const textBody = await response.text()
      if (textBody) {
        responseBody = textBody
        const supabaseContentType = response.headers.get('Content-Type')
        if (supabaseContentType)
          responseHeaders.set('Content-Type', supabaseContentType)
      }
    }
    catch {
      // If reading the body fails, fall back to empty body
    }
  }

  return new Response(responseBody, {
    status: response.status,
    headers: responseHeaders,
  })
}

/**
 * Handle TUS PATCH request - upload chunk
 */
export async function supabaseTusPatchHandler(c: Context): Promise<Response> {
  const requestId = c.get('requestId')
  const uploadId = c.req.param('id')

  cloudlog({ requestId, message: 'supabaseTusPatchHandler', uploadId })

  const supabaseUrl = buildSupabaseTusUrl(c, uploadId)
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${serviceRoleKey}`)
  headers.set('Tus-Resumable', TUS_VERSION)

  // Forward PATCH-specific headers
  const patchHeaders = ['Upload-Offset', 'Content-Type', 'Content-Length', 'Upload-Length']
  for (const header of patchHeaders) {
    const value = c.req.header(header)
    if (value)
      headers.set(header, value)
  }

  cloudlog({ requestId, message: 'supabaseTusPatchHandler forwarding to Supabase', supabaseUrl })

  // Forward the request to Supabase with timeout and error handling
  let response: Response
  try {
    response = await fetch(supabaseUrl, {
      method: 'PATCH',
      headers,
      body: c.req.raw.body,
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT),
    })
  }
  catch (error) {
    cloudlog({ requestId, message: 'supabaseTusPatchHandler fetch error', error: error instanceof Error ? error.message : String(error) })
    return new Response(JSON.stringify({ error: 'upstream_error', message: 'Failed to communicate with storage backend' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  cloudlog({ requestId, message: 'supabaseTusPatchHandler response', status: response.status })

  // Build response
  const responseHeaders = buildTusResponseHeaders()

  const copyHeaders = ['Upload-Offset', 'Upload-Expires']
  for (const header of copyHeaders) {
    const value = response.headers.get(header)
    if (value)
      responseHeaders.set(header, value)
  }

  // Forward error body from Supabase for better debugging, keep empty body on success
  let body: BodyInit | null = null
  if (!response.ok) {
    try {
      const text = await response.text()
      body = text || null
    }
    catch {
      body = null
    }
  }

  return new Response(body, {
    status: response.status,
    headers: responseHeaders,
  })
}

/**
 * Handle TUS HEAD request - check upload progress
 */
export async function supabaseTusHeadHandler(c: Context): Promise<Response> {
  const requestId = c.get('requestId')
  const uploadId = c.req.param('id')

  cloudlog({ requestId, message: 'supabaseTusHeadHandler', uploadId })

  const supabaseUrl = buildSupabaseTusUrl(c, uploadId)
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${serviceRoleKey}`)
  headers.set('Tus-Resumable', TUS_VERSION)

  cloudlog({ requestId, message: 'supabaseTusHeadHandler forwarding to Supabase', supabaseUrl })

  // Forward the request to Supabase with timeout and error handling
  let response: Response
  try {
    response = await fetch(supabaseUrl, {
      method: 'HEAD',
      headers,
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT),
    })
  }
  catch (error) {
    cloudlog({ requestId, message: 'supabaseTusHeadHandler fetch error', error: error instanceof Error ? error.message : String(error) })
    return new Response(JSON.stringify({ error: 'upstream_error', message: 'Failed to communicate with storage backend' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  cloudlog({ requestId, message: 'supabaseTusHeadHandler response', status: response.status })

  const responseHeaders = buildTusResponseHeaders()
  responseHeaders.set('Cache-Control', 'no-store')

  const copyHeaders = ['Upload-Offset', 'Upload-Length', 'Upload-Expires']
  for (const header of copyHeaders) {
    const value = response.headers.get(header)
    if (value)
      responseHeaders.set(header, value)
  }

  // For better debugging and error reporting, forward the Supabase error body
  // while keeping HEAD semantics (no body) for successful responses.
  let body: string | null = null
  if (!response.ok) {
    try {
      const text = await response.text()
      if (text)
        body = text
    }
    catch {
      // If reading the body fails, fall back to null body as before.
      body = null
    }
  }

  return new Response(body, {
    status: response.status,
    headers: responseHeaders,
  })
}
