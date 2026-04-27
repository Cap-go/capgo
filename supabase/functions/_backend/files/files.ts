import type { Context, Next } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { getRuntimeKey } from 'hono/adapter'
import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono/tiny'
import { app as download_link } from '../private/download_link.ts'
import { app as upload_link } from '../private/upload_link.ts'
import { app as ok } from '../public/ok.ts'
import { sendDiscordAlert } from '../utils/discord.ts'
import { quickError, simpleError } from '../utils/hono.ts'
import { middlewareKey } from '../utils/hono_middleware.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { closeClient, getAppByIdPg, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { getAppByAppIdPg, getUserIdFromApikey } from '../utils/pg_files.ts'
import { checkPermissionPg } from '../utils/rbac.ts'
import { createStatsBandwidth } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'
import { app as files_config } from './files_config.ts'
import { parseUploadMetadata } from './parse.ts'
import { DEFAULT_RETRY_PARAMS, RetryBucket } from './retry.ts'
import { supabaseTusCreateHandler, supabaseTusHeadHandler, supabaseTusPatchHandler } from './supabaseTusProxy.ts'
import { ALLOWED_HEADERS, ALLOWED_METHODS, buildFileHttpMetadata, EXPOSED_HEADERS, isRetryableDurableObjectResetError, MAX_UPLOAD_LENGTH_BYTES, toBase64, TUS_EXTENSIONS, TUS_VERSION, withNoTransformCacheControl, X_CHECKSUM_SHA256, X_UPLOAD_HANDLER_RETRYABLE } from './util.ts'

const DO_CALL_TIMEOUT = 1000 * 60 * 30 // 30 minutes
const DO_FETCH_RETRY_ATTEMPTS = 3
const DO_FETCH_RETRY_DELAY_MS = 250

const ATTACHMENT_PREFIX = 'attachments'
const ATTACHMENT_PLAN_LIMIT: Array<'mau' | 'bandwidth' | 'storage'> = ['mau', 'bandwidth', 'storage']
const TUS_UPLOAD_CONTENT_TYPE = 'application/offset+octet-stream'

type AppScopedAttachmentPath
  = | { kind: 'scoped', app_id: string, owner_org: string }
    | { kind: 'invalid_scoped' }

export const app = new Hono<MiddlewareKeyVariables>()

function isRetryableDurableObjectFetchError(error: unknown): boolean {
  return isRetryableDurableObjectResetError(error)
}

function readIntHeader(request: Request, headerName: string): number | null {
  const rawValue = request.headers.get(headerName)
  if (rawValue == null) {
    return null
  }

  const parsedValue = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsedValue) ? parsedValue : Number.NaN
}

function isZeroLengthTusUploadBody(request: Request): boolean {
  return request.method !== 'HEAD'
    && request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === TUS_UPLOAD_CONTENT_TYPE
    && readIntHeader(request, 'content-length') === 0
}

function requestHasNonEmptyUploadBody(request: Request): boolean {
  if (request.body == null) {
    return false
  }

  if (request.headers.has('transfer-encoding')) {
    return true
  }

  const contentLength = readIntHeader(request, 'content-length')
  if (contentLength == null) {
    return true
  }

  return Number.isNaN(contentLength) || contentLength > 0
}

function getForwardedUploadBody(request: Request): ReadableStream<Uint8Array> | ArrayBuffer | null {
  if (request.method === 'HEAD') {
    return null
  }

  if (isZeroLengthTusUploadBody(request)) {
    return new ArrayBuffer(0)
  }

  return requestHasNonEmptyUploadBody(request)
    ? request.body as ReadableStream<Uint8Array>
    : null
}

function canReplayUploadRequest(request: Request): boolean {
  return request.method === 'HEAD' || !requestHasNonEmptyUploadBody(request)
}

function buildDurableObjectRequest(request: Request): Request {
  const requestInit: RequestInit & { duplex?: 'half' } = {
    headers: request.headers,
    method: request.method,
    signal: AbortSignal.timeout(DO_CALL_TIMEOUT),
  }

  const uploadBody = getForwardedUploadBody(request)
  if (uploadBody != null) {
    requestInit.body = uploadBody
    requestInit.duplex = 'half'
  }

  return new Request(request.url, requestInit)
}

function isRetryableDurableObjectResponse(response: Response): boolean {
  return response.headers.get(X_UPLOAD_HANDLER_RETRYABLE) === '1'
}

async function recoverUploadOffsetFromDurableObject(
  c: Context,
  handler: DurableObjectStub,
  request: Request,
  fallbackResponse: Response,
): Promise<Response> {
  if (request.method !== 'PATCH') {
    return fallbackResponse
  }

  try {
    const headers = new Headers(request.headers)
    headers.delete('content-length')

    const headResponse = await handler.fetch(new Request(request.url, {
      method: 'HEAD',
      headers,
      signal: AbortSignal.timeout(DO_CALL_TIMEOUT),
    }))

    const uploadOffset = headResponse.headers.get('Upload-Offset')
    if (!headResponse.ok || uploadOffset == null) {
      return fallbackResponse
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'upload handler - recovered upload offset after durable object reset',
      fileId: c.get('fileId'),
      uploadOffset,
    })

    return new Response(null, {
      status: 409,
      headers: new Headers(headResponse.headers),
    })
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'upload handler - failed to recover upload offset after durable object reset',
      error,
      fileId: c.get('fileId'),
    })
    return fallbackResponse
  }
}

function retryableUploadUnavailableResponse(): Response {
  return new Response(JSON.stringify({
    error: 'upload_retryable',
    message: 'Upload worker moved during this request. Retry the upload request.',
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': '1',
      'Tus-Resumable': TUS_VERSION,
    },
  })
}

async function fetchUploadHandlerWithRetry(
  c: Context,
  handler: DurableObjectStub,
  request: Request,
): Promise<Response> {
  const canRetryRequest = canReplayUploadRequest(request)
  const maxAttempts = canRetryRequest ? DO_FETCH_RETRY_ATTEMPTS : 1
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await handler.fetch(buildDurableObjectRequest(request))

      const shouldRetryResponse = canRetryRequest
        && attempt < maxAttempts
        && isRetryableDurableObjectResponse(response)

      if (shouldRetryResponse) {
        cloudlogErr({
          requestId: c.get('requestId'),
          message: 'upload handler - durable object returned retryable response, retrying',
          attempt,
          fileId: c.get('fileId'),
          status: response.status,
        })
        await new Promise(resolve => setTimeout(resolve, DO_FETCH_RETRY_DELAY_MS * attempt))
        continue
      }

      if (!canRetryRequest && isRetryableDurableObjectResponse(response)) {
        return await recoverUploadOffsetFromDurableObject(c, handler, request, response)
      }

      if (attempt > 1) {
        cloudlog({
          requestId: c.get('requestId'),
          message: 'upload handler - durable object retry succeeded',
          attempt,
          fileId: c.get('fileId'),
        })
      }

      return response
    }
    catch (error) {
      lastError = error
      const isRetryableDurableObjectError = isRetryableDurableObjectFetchError(error)
      const shouldRetry = canRetryRequest
        && attempt < maxAttempts
        && isRetryableDurableObjectError

      cloudlogErr({
        requestId: c.get('requestId'),
        message: shouldRetry
          ? 'upload handler - durable object fetch failed, retrying'
          : 'upload handler - durable object fetch failed',
        error,
        attempt,
        fileId: c.get('fileId'),
        retryable: shouldRetry,
      })

      if (!shouldRetry) {
        if (!canRetryRequest && isRetryableDurableObjectError) {
          cloudlog({
            requestId: c.get('requestId'),
            message: 'upload handler - durable object fetch failed for streaming request, returning retryable response',
            attempt,
            fileId: c.get('fileId'),
          })
          return retryableUploadUnavailableResponse()
        }
        throw error
      }

      await new Promise(resolve => setTimeout(resolve, DO_FETCH_RETRY_DELAY_MS * attempt))
    }
  }

  throw lastError ?? new Error('Durable Object upload fetch failed')
}

function ensureNoTransformResponse(response: Response): Response {
  const cacheControl = withNoTransformCacheControl(response.headers.get('cache-control'))
  if (cacheControl === response.headers.get('cache-control')) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('cache-control', cacheControl)
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function withAttachmentResponseHeaders(response: Response, fileId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('cache-control', withNoTransformCacheControl(headers.get('cache-control')))
  headers.set('content-disposition', `attachment; filename="${fileId}"`)

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function getTransferredBytesFromResponse(response: Response): number | null {
  const contentRange = response.headers.get('content-range')
  if (contentRange) {
    const match = contentRange.match(/^bytes (\d+)-(\d+)\/(?:\d+|\*)$/i)
    if (match) {
      const startIndex = Number.parseInt(match[1], 10)
      const endIndex = Number.parseInt(match[2], 10)
      if (Number.isFinite(startIndex) && Number.isFinite(endIndex) && endIndex >= startIndex) {
        return endIndex - startIndex + 1
      }
    }
  }

  const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10)
  if (Number.isFinite(contentLength) && contentLength > 0) {
    return contentLength
  }

  return null
}

async function saveBandwidthUsage(c: Context, fileSize: number | null | undefined) {
  cloudlog({ requestId: c.get('requestId'), message: 'saveBandwidthUsage', fileSize })
  if (!fileSize || fileSize <= 0)
    return Promise.resolve()

  cloudlog({ requestId: c.get('requestId'), message: 'getHandler files track bandwidth', fileSize })
  const r2Path = new URL(c.req.url).pathname.split(`/files/read/${ATTACHMENT_PREFIX}/`)[1]
  const app_id = r2Path?.split('/')[3]
  const device_id = c.req.query('device_id')
  if (app_id && device_id) {
    await createStatsBandwidth(c, device_id, app_id, fileSize ?? 0)
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files cannot track bandwidth no app_id or device_id', r2Path, app_id, device_id })
  }
}

function parseAppScopedAttachmentPath(fileId: unknown): AppScopedAttachmentPath | null {
  if (typeof fileId !== 'string') {
    return null
  }

  const [orgs, owner_org, apps, app_id, ...suffix] = fileId.split('/')
  if (orgs !== 'orgs') {
    return null
  }

  if (!owner_org || apps !== 'apps' || !app_id || suffix.length === 0 || suffix.some(part => part.length === 0)) {
    return { kind: 'invalid_scoped' }
  }

  return { kind: 'scoped', app_id, owner_org }
}

async function assertReadableAppScopedAttachment(c: Context, fileId: unknown): Promise<void> {
  const scopedPath = parseAppScopedAttachmentPath(fileId)
  if (scopedPath?.kind === 'invalid_scoped') {
    quickError(404, 'not_found', 'Not found')
  }
  if (!scopedPath) {
    return
  }

  // Attachment reads must use the primary to avoid replica lag serving deleted-app files.
  const pgClient = getPgClient(c, false)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    const app = await getAppByAppIdPg(c, scopedPath.app_id, drizzleClient)
    if (!app || app.owner_org !== scopedPath.owner_org) {
      quickError(404, 'not_found', 'Not found')
    }
  }
  finally {
    await closeClient(c, pgClient)
  }
}

async function getSupabaseStorageResponse(c: Context, fileId: string): Promise<Response> {
  const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin(c).storage.from('capgo').createSignedUrl(fileId, 60)

  if (signedUrlError || !signedUrlData?.signedUrl) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'getHandler files signed URL creation failed',
      fileId,
      error: signedUrlError,
    })
    if (signedUrlError?.status === 404) {
      return c.json({ error: 'not_found', message: 'Not found' }, 404)
    }
    throw quickError(503, 'upstream_unavailable', 'File storage temporarily unavailable', { fileId }, signedUrlError, { alert: false })
  }

  const requestHeaders = new Headers()
  const rangeHeader = c.req.header('range')
  const method = c.req.raw.method === 'HEAD' ? 'HEAD' : 'GET'
  if (method === 'GET' && rangeHeader) {
    requestHeaders.set('range', rangeHeader)
  }

  let response: Response
  try {
    const fetchInit: RequestInit = { method }
    if (rangeHeader) {
      fetchInit.headers = requestHeaders
    }
    response = await fetch(signedUrlData.signedUrl, fetchInit)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getHandler files signed URL fetch failed', fileId, error })
    throw quickError(503, 'upstream_unavailable', 'File storage temporarily unavailable', { fileId }, error, { alert: false })
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '')
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'getHandler files signed URL response failed',
      fileId,
      status: response.status,
      responseBody,
    })
    if (response.status === 404 || responseBody.toLowerCase().includes('not found')) {
      return c.json({ error: 'not_found', message: 'Not found' }, 404)
    }
    throw quickError(503, 'upstream_unavailable', 'File storage temporarily unavailable', { fileId, status: response.status }, responseBody, { alert: false })
  }

  if (method !== 'HEAD') {
    await saveBandwidthUsage(c, getTransferredBytesFromResponse(response))
  }
  return withAttachmentResponseHeaders(response, fileId)
}

async function getHandler(c: Context): Promise<Response> {
  const fileId = c.get('fileId')
  await assertReadableAppScopedAttachment(c, fileId)
  cloudlog({ requestId: c.get('requestId'), message: 'getHandler files', fileId })
  if (getRuntimeKey() !== 'workerd') {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files using supabase storage' })
    return getSupabaseStorageResponse(c, fileId)
  }

  const bucket: R2Bucket = c.env.ATTACHMENT_BUCKET

  if (bucket == null) {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files bucket is null' })
    return c.json({ error: 'not_found', message: 'Not found' }, 404)
  }

  // Support for deno cache or CF cache do not remove this
  // @ts-expect-error-next-line
  const cache = getRuntimeKey() === 'workerd' ? caches.default : caches
  const cacheUrl = new URL(c.req.url)
  cacheUrl.searchParams.set('range', c.req.header('range') || '')
  const cacheKey = new Request(cacheUrl, c.req)
  let response = await cache.match(cacheKey)
  if (response != null) {
    response = ensureNoTransformResponse(response)
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files cache hit' })
    // Best-effort restore: if file is cached but missing in R2, write it back.
    await backgroundTask(c, async () => {
      try {
        const head = await new RetryBucket(bucket, DEFAULT_RETRY_PARAMS).head(fileId)
        if (head != null)
          return
        const cached = response.clone()
        const data = await cached.arrayBuffer()
        const contentType = cached.headers.get('content-type') || undefined
        const httpMetadata = buildFileHttpMetadata(contentType, cached.headers.get('cache-control'))
        await bucket.put(fileId, data, { httpMetadata })
        cloudlog({ requestId: c.get('requestId'), message: 'Restored cached file to R2', fileId })
        await sendDiscordAlert(c, {
          content: `🛠️ Restored cached file to R2\nFile: ${fileId}\nRequest ID: ${c.get('requestId') ?? 'unknown'}`,
        })
      }
      catch (err) {
        cloudlog({ requestId: c.get('requestId'), message: 'Failed to restore cached file to R2', fileId, error: String(err) })
      }
    })
    return response
  }

  const rangeHeaderFromRequest = c.req.header('range')
  if (rangeHeaderFromRequest) {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files range request', range: rangeHeaderFromRequest })
    try {
      const objectInfo = await new RetryBucket(bucket, DEFAULT_RETRY_PARAMS).head(fileId)
      if (objectInfo != null) {
        const fileSize = objectInfo.size
        const rangeMatch = rangeHeaderFromRequest.match(/bytes=(\d+)-(\d*)/)
        if (rangeMatch) {
          const rangeStart = Number.parseInt(rangeMatch[1])
          if (rangeStart >= fileSize) {
            const emptyHeaders = new Headers()
            emptyHeaders.set('Content-Range', `bytes */${fileSize}`)
            return new Response(new Uint8Array(0), { status: 206, headers: emptyHeaders })
          }
        }
      }
    }
    catch (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'getHandler files head failed', fileId, error })
    }
  }

  let object: R2ObjectBody | null = null
  try {
    object = await new RetryBucket(bucket, DEFAULT_RETRY_PARAMS).get(fileId, {
      range: c.req.raw.headers,
    })
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getHandler files get failed', fileId, error })
    throw quickError(503, 'upstream_unavailable', 'File storage temporarily unavailable', { fileId }, error, { alert: false })
  }
  if (object == null) {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files object is null' })
    return c.json({ error: 'not_found', message: 'Not found' }, 404)
  }
  const bytesTransferred = calculateBytesTransferred(object.size, object.range)
  await saveBandwidthUsage(c, bytesTransferred)
  const headers = objectHeaders(object)
  if (object.range != null && c.req.header('range')) {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files range request', range: rangeHeader(object.size, object.range) })
    headers.set('content-range', rangeHeader(object.size, object.range))
    response = new Response(object.body, { headers, status: 206 })
    return response
  }
  headers.set('Content-Disposition', `attachment; filename="${object.key}"`)
  response = new Response(object.body, { headers })
  await backgroundTask(c, () => {
    cloudlog({ requestId: c.get('requestId'), message: 'getHandler files cache saved', fileId })
    cache.put(cacheKey, response.clone())
  })
  return response
}

function objectHeaders(object: R2Object): Headers {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  // Prevent CDN transformations (auto-minify, email obfuscation, etc.) that modify
  // bytes in transit, breaking checksum verification on devices.
  headers.set('cache-control', withNoTransformCacheControl(headers.get('cache-control')))
  headers.set('etag', object.httpEtag)

  // the sha256 checksum was provided to R2 in the upload
  if (object.checksums.sha256 != null) {
    headers.set(X_CHECKSUM_SHA256, toBase64(object.checksums.sha256))
  }

  // it was a multipart upload, so we were forced to write a sha256 checksum as a custom header
  if (object.customMetadata?.[X_CHECKSUM_SHA256] != null) {
    headers.set(X_CHECKSUM_SHA256, object.customMetadata[X_CHECKSUM_SHA256])
  }
  return headers
}

function rangeHeader(objLen: number, r2Range: R2Range): string {
  let startIndexInclusive = 0
  let endIndexInclusive = objLen - 1
  if ('offset' in r2Range && r2Range.offset != null) {
    startIndexInclusive = r2Range.offset
  }
  if ('length' in r2Range && r2Range.length != null) {
    endIndexInclusive = startIndexInclusive + r2Range.length - 1
  }
  if ('suffix' in r2Range) {
    startIndexInclusive = objLen - r2Range.suffix
  }
  return `bytes ${startIndexInclusive}-${endIndexInclusive}/${objLen}`
}

function calculateBytesTransferred(objLen: number, r2Range: R2Range | undefined): number {
  if (!r2Range)
    return objLen
  let startIndexInclusive = 0
  let endIndexInclusive = objLen - 1
  if ('offset' in r2Range && r2Range.offset != null) {
    startIndexInclusive = r2Range.offset
  }
  if ('length' in r2Range && r2Range.length != null) {
    endIndexInclusive = startIndexInclusive + r2Range.length - 1
  }
  if ('suffix' in r2Range) {
    startIndexInclusive = objLen - r2Range.suffix
  }
  return endIndexInclusive - startIndexInclusive + 1
}

function optionsHandler(c: Context) {
  cloudlog({ requestId: c.get('requestId'), message: 'optionsHandler files optionsHandler' })
  return c.newResponse(null, 204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Expose-Headers': EXPOSED_HEADERS,
    'Tus-Resumable': TUS_VERSION,
    'Tus-Version': TUS_VERSION,
    'Tus-Max-Size': MAX_UPLOAD_LENGTH_BYTES.toString(),
    'Tus-Extension': TUS_EXTENSIONS,
  })
}

// TUS protocol requests (POST/PATCH/HEAD) that get forwarded to a durable object
async function uploadHandler(c: Context) {
  const requestId = c.get('fileId') as string
  // make requestId safe
  const normalizedRequestId = decodeURIComponent(requestId)
  const durableObjNs: DurableObjectNamespace = c.env.ATTACHMENT_UPLOAD_HANDLER

  if (durableObjNs == null) {
    cloudlog({ requestId: c.get('requestId'), message: 'files durableObjNs is null' })
    throw simpleError('invalid_bucket_configuration', 'Invalid bucket configuration')
  }

  const handler = durableObjNs.get(durableObjNs.idFromName(normalizedRequestId))
  cloudlog({ requestId: c.get('requestId'), message: 'upload handler - forwarding to DO', method: c.req.raw.method, url: c.req.url })

  // Pass requestId to DO via header so it can use it in logs
  const headers = new Headers(c.req.raw.headers)
  headers.set('X-Request-Id', c.get('requestId') || 'unknown')

  const method = c.req.raw.method
  const requestInit: RequestInit & { duplex?: 'half' } = {
    // HEAD must not forward a request body and must preserve the verb (Hono/tiny maps HEAD to GET).
    method,
    headers,
  }
  const uploadBody = getForwardedUploadBody(c.req.raw)
  if (uploadBody != null) {
    requestInit.body = uploadBody
    requestInit.duplex = 'half'
  }
  const request = new Request(c.req.url, requestInit)
  return await fetchUploadHandlerWithRetry(c, handler, request)
}

async function setKeyFromMetadata(c: Context, next: Next) {
  const uploadMetadata = parseUploadMetadata(c, c.req.raw.headers)
  cloudlog({
    requestId: c.get('requestId'),
    message: 'setKeyFromMetadata - raw metadata',
    metadata: uploadMetadata,
  })

  const fileId = uploadMetadata.filename
  if (fileId == null) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'setKeyFromMetadata - fileId is null',
      uploadMetadataLength: c.req.header('Upload-Metadata')?.length ?? 0,
    })
    return c.json({ error: 'not_found', message: 'Not found' }, 404)
  }

  cloudlog({ requestId: c.get('requestId'), message: 'setKeyFromMetadata - raw fileId', fileId })

  // Decode base64 if necessary
  // Check if it looks like base64 (no slashes, only valid base64 chars)
  let decodedFileId = fileId
  const looksLikeBase64 = !fileId.includes('/') && /^[A-Z0-9+/]+=*$/i.test(fileId)

  if (looksLikeBase64) {
    try {
      decodedFileId = atob(fileId)
      cloudlog({ requestId: c.get('requestId'), message: 'setKeyFromMetadata - decoded from base64', decodedFileId })
    }
    catch (decodeError) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'setKeyFromMetadata - base64 decode failed, using raw',
        fileId,
        error: decodeError instanceof Error ? decodeError.message : String(decodeError),
      })
    }
  }
  else {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'setKeyFromMetadata - fileId already decoded (contains slashes)',
      fileId,
    })
  }

  const normalizedFileId = decodeURIComponent(decodedFileId)
  cloudlog({ requestId: c.get('requestId'), message: 'setKeyFromMetadata - final normalized fileId', normalizedFileId })
  c.set('fileId', normalizedFileId)
  await next()
}

async function setKeyFromIdParam(c: Context, next: Next) {
  const fileId = c.req.param('id')
  cloudlog({
    requestId: c.get('requestId'),
    message: 'setKeyFromIdParam - raw param',
    fileId,
    url: c.req.url,
    method: c.req.method,
  })
  if (fileId == null) {
    cloudlog({ requestId: c.get('requestId'), message: 'setKeyFromIdParam - fileId is null' })
    return c.json({ error: 'not_found', message: 'Not found' }, 404)
  }

  const normalizedFileId = decodeURIComponent(fileId)

  // Check if this is a Supabase TUS upload ID (base64 encoded)
  // TUS upload IDs from Supabase are base64-encoded paths like: capgo/orgs/xxx/apps/yyy/file.zip/uuid
  let extractedFileId = normalizedFileId
  try {
    const decoded = atob(normalizedFileId)
    // If decoded starts with bucket name and contains orgs/, it's a TUS upload ID
    if (decoded.startsWith('capgo/') && decoded.includes('/orgs/')) {
      const parts = decoded.split('/')
      // Expected format:
      // [0]: 'capgo'
      // [1]: 'orgs'
      // [2]: orgId
      // [3]: 'apps'
      // [4]: appId
      // [5..n-2]: file path segments
      // [n-1]: UUID
      if (
        parts.length >= 6
        && parts[0] === 'capgo'
        && parts[1] === 'orgs'
        && parts[3] === 'apps'
      ) {
        cloudlog({
          requestId: c.get('requestId'),
          message: 'setKeyFromIdParam - detected Supabase TUS upload ID',
          decoded,
          parts,
        })
        // Extract file path: remove bucket prefix (capgo/) and UUID suffix
        // Resulting path starts with "orgs/..."
        const pathParts = parts.slice(1, parts.length - 1)
        if (pathParts.length > 0) {
          extractedFileId = pathParts.join('/')
          cloudlog({
            requestId: c.get('requestId'),
            message: 'setKeyFromIdParam - extracted fileId from TUS ID',
            extractedFileId,
            originalParts: parts,
            pathParts,
          })
        }
        else {
          cloudlog({
            requestId: c.get('requestId'),
            message: 'setKeyFromIdParam - TUS ID decoded but pathParts is empty, using normalizedFileId as fileId',
            decoded,
            parts,
          })
        }
      }
      else {
        cloudlog({
          requestId: c.get('requestId'),
          message: 'setKeyFromIdParam - decoded TUS ID has unexpected structure, using normalizedFileId as fileId',
          decoded,
          parts,
        })
      }
    }
  }
  catch {
    // Not a base64 string, use as-is
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'setKeyFromIdParam - final fileId',
    originalFileId: fileId,
    extractedFileId,
  })
  c.set('fileId', extractedFileId)
  await next()
}

async function checkWriteAppAccess(c: Context, next: Next) {
  const requestId = c.get('fileId') as string
  cloudlog({
    requestId: c.get('requestId'),
    message: 'checkWriteAppAccess - start',
    fileId: requestId,
  })

  const scopedPath = parseAppScopedAttachmentPath(requestId)

  if (!scopedPath || scopedPath.kind !== 'scoped') {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - invalid path structure',
      fileId: requestId,
      expected: 'orgs/*/apps/*/*',
    })
    throw new HTTPException(400, {
      res: c.json({
        error: 'invalid_file_path',
        message: 'Invalid file path structure. Expected: orgs/{owner_org}/apps/{app_id}/...',
        moreInfo: { fileId: requestId, requestId: c.get('requestId') },
      }),
    })
  }

  const { owner_org, app_id } = scopedPath

  cloudlog({
    requestId: c.get('requestId'),
    message: 'checkWriteAppAccess - parsed path',
    app_id,
    owner_org,
  })

  const capgkey = c.get('capgkey') as string
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']

  cloudlog({
    requestId: c.get('requestId'),
    message: 'checkWriteAppAccess - checking api key',
    capgkey: capgkey ? `${capgkey.substring(0, 10)}...` : 'missing',
    capgkeyLength: capgkey?.length ?? 0,
    hasCapgkey: !!capgkey,
    userId: apikey.user_id,
  })

  // Use Postgres instead of Supabase SDK
  const pgClient = getPgClient(c, false) // authz + plan gating must read primary
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    // Get user_id from apikey using Postgres
    const userId = await getUserIdFromApikey(c, capgkey, drizzleClient)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - get_user_id result',
      userId,
      userIdIsNull: userId === null,
    })

    if (userId === null) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkWriteAppAccess - user lookup failed',
        userId,
        app_id,
        capgkeyPrefix: capgkey ? capgkey.substring(0, 15) : 'missing',
      })
      throw new HTTPException(400, {
        res: c.json({
          error: 'user_not_found',
          message: 'User not found for the provided API key',
          moreInfo: { app_id, hasApiKey: !!capgkey, apiKeyLength: capgkey?.length ?? 0, requestId: c.get('requestId') },
        }),
      })
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - checking app permissions via checkPermissionPg',
      userId,
      app_id,
    })

    // Use the new RBAC permission check
    const hasPermission = await checkPermissionPg(c, 'app.upload_bundle', { appId: app_id }, drizzleClient, userId, capgkey)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - checkPermissionPg result',
      hasPermission,
    })

    if (!hasPermission) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkWriteAppAccess - insufficient permissions',
        userId,
        app_id,
      })
      throw new HTTPException(403, {
        res: c.json({
          error: 'insufficient_permissions',
          message: 'You don\'t have permission to access this app',
          moreInfo: { app_id, requestId: c.get('requestId') },
        }),
      })
    }

    // Get app using Postgres
    const app = await getAppByAppIdPg(c, app_id, drizzleClient)

    if (!app) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkWriteAppAccess - app not found',
        app_id,
      })
      throw new HTTPException(404, {
        res: c.json({
          error: 'app_not_found',
          message: 'App not found',
          moreInfo: { app_id, requestId: c.get('requestId') },
        }),
      })
    }

    if (app.owner_org !== owner_org) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkWriteAppAccess - owner org mismatch',
        filePathOwnerOrg: owner_org,
        actualOwnerOrg: app.owner_org,
        app_id,
      })
      throw new HTTPException(403, {
        res: c.json({
          error: 'owner_org_mismatch',
          message: 'The owner organization in the file path does not match the app\'s owner organization',
          moreInfo: {
            app_id,
            filePathOwnerOrg: owner_org,
            actualOwnerOrg: app.owner_org,
            requestId: c.get('requestId'),
          },
        }),
      })
    }

    const appPlan = await getAppByIdPg(c, app_id, drizzleClient, ATTACHMENT_PLAN_LIMIT)
    if (!appPlan) {
      throw quickError(503, 'upstream_unavailable', 'App plan state temporarily unavailable', { app_id })
    }

    if (!appPlan.plan_valid) {
      // Keep the explicit JSON 429 payload here: onError rewrites thrown 429s to
      // too_many_requests, and the edge cache contract depends on on_premise_app.
      return c.json({
        error: 'on_premise_app',
        message: 'On-premise app detected',
      }, 429)
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkWriteAppAccess - access granted',
      app_id,
      owner_org,
    })
  }
  finally {
    // Always close the connection
    await closeClient(c, pgClient)
  }

  await next()
}

app.options(`/upload/${ATTACHMENT_PREFIX}`, optionsHandler)
app.post(`/upload/${ATTACHMENT_PREFIX}`, middlewareKey(['all', 'write', 'upload'], true), setKeyFromMetadata, checkWriteAppAccess, (c) => {
  if (getRuntimeKey() !== 'workerd') {
    return supabaseTusCreateHandler(c)
  }
  return uploadHandler(c)
})

app.options(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, optionsHandler)
// Combined GET/HEAD handler for TUS uploads - Hono tiny routes HEAD to GET
app.get(
  `/upload/${ATTACHMENT_PREFIX}/:id{.+}`,
  middlewareKey(['all', 'write', 'upload'], true),
  setKeyFromIdParam,
  checkWriteAppAccess,
  (c) => {
    const isTusRequest = c.req.header('Tus-Resumable') != null
    // In Hono/tiny, HEAD is routed to the GET handler. Use the raw request method.
    const isHead = c.req.raw.method === 'HEAD'

    if (isHead && isTusRequest) {
      if (getRuntimeKey() !== 'workerd') {
        cloudlog({ requestId: c.get('requestId'), message: 'Routing HEAD TUS request to supabaseTusHeadHandler' })
        return supabaseTusHeadHandler(c)
      }

      cloudlog({ requestId: c.get('requestId'), message: 'Routing HEAD TUS request to uploadHandler (DO)' })
      return uploadHandler(c)
    }

    return getHandler(c)
  },
)
app.get(`/read/${ATTACHMENT_PREFIX}/:id{.+}`, setKeyFromIdParam, getHandler)
app.patch(`/upload/${ATTACHMENT_PREFIX}/:id{.+}`, middlewareKey(['all', 'write', 'upload'], true), setKeyFromIdParam, checkWriteAppAccess, (c) => {
  if (getRuntimeKey() !== 'workerd') {
    return supabaseTusPatchHandler(c)
  }
  return uploadHandler(c)
})

app.route('/config', files_config)
app.route('/download_link', download_link)
app.route('/upload_link', upload_link)
app.route('/ok', ok)

export const filesTestUtils = {
  fetchUploadHandlerWithRetry,
  isRetryableDurableObjectFetchError,
  retryableUploadUnavailableResponse,
}
