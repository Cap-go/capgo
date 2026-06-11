import type { Context } from 'hono'
import type { Database } from '../utils/supabase.types.ts'
import { S3Client } from '@bradenmacdonald/s3-lite-client'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getManifestStorageCandidateKeys } from './manifest_encoding.ts'
import { getEnv } from './utils.ts'

function firstForwardedHeaderValue(value: string | undefined): string | undefined {
  if (!value)
    return undefined
  return value.split(',')[0]?.trim() || undefined
}

function resolveEndpointProtocol(c: Context): 'http' | 'https' {
  const forwardedProto = firstForwardedHeaderValue(c.req.header('X-Forwarded-Proto'))
  if (forwardedProto === 'http' || forwardedProto === 'https')
    return forwardedProto
  try {
    const requestProtocol = new URL(c.req.url).protocol.replace(':', '')
    if (requestProtocol === 'http' || requestProtocol === 'https')
      return requestProtocol
  }
  catch {
    // Ignore URL parsing failures and use the storage config fallback below.
  }
  return getEnv(c, 'S3_SSL') === 'true' ? 'https' : 'http'
}

function resolveStorageEndpoint(c: Context): string {
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const protocol = resolveEndpointProtocol(c)
  const rawEndpoint = storageEndpoint.includes('://')
    ? storageEndpoint
    : `${protocol}://${storageEndpoint}`

  try {
    const endpointUrl = new URL(rawEndpoint)
    const looksLikeLocalStorage = endpointUrl.pathname.startsWith('/storage/v1/s3')
      && ['localhost', '127.0.0.1', 'kong'].includes(endpointUrl.hostname)

    if (!looksLikeLocalStorage)
      return endpointUrl.toString()

    let forwardedHost = firstForwardedHeaderValue(c.req.header('X-Forwarded-Host'))
    const forwardedPort = firstForwardedHeaderValue(c.req.header('X-Forwarded-Port'))
    const hostHeader = c.req.header('Host')

    if (forwardedHost && !forwardedHost.includes(':') && forwardedPort) {
      forwardedHost = `${forwardedHost}:${forwardedPort}`
    }

    endpointUrl.protocol = `${protocol}:`
    endpointUrl.host = forwardedHost || hostHeader || endpointUrl.host
    return endpointUrl.toString()
  }
  catch {
    return rawEndpoint
  }
}

function initS3(c: Context) {
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageRegion = getEnv(c, 'S3_REGION') || 'us-east-1'
  const bucket = getEnv(c, 'S3_BUCKET')
  const client = new S3Client({
    endPoint: resolveStorageEndpoint(c),
    accessKey: access_key_id,
    pathStyle: true,
    secretKey: access_key_secret,
    region: storageRegion,
    bucket,
  })
  return client
}

const R2_TRASH_PREFIX = 'deleted-after-7-days/'

function getTrashPath(fileId: string) {
  return `${R2_TRASH_PREFIX}${fileId}`
}

export async function getPath(
  c: Context,
  record: Database['public']['Tables']['app_versions']['Row'],
) {
  if (!record.r2_path) {
    cloudlog({ requestId: c.get('requestId'), message: 'no r2_path' })
    return null
  }
  if (!record.r2_path && (!record.app_id || !record.user_id || !record.id)) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'no app_id or user_id or id',
    })
    return null
  }
  const exist = await checkIfExist(c, record.r2_path)
  if (!exist) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'not exist',
      vPath: record.r2_path,
    })
    return null
  }
  return record.r2_path
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 1200) {
  const client = initS3(c)
  const url = await client.getPresignedUrl('PUT', fileId, {
    expirySeconds,
    parameters: {
      'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
      'x-id': 'PutObject',
    },
  })
  return url
}

async function deleteObject(c: Context, fileId: string) {
  const client = initS3(c)
  const url = await client.getPresignedUrl('DELETE', fileId)
  const response = await fetch(url, {
    method: 'DELETE',
  })
  return response.status >= 200 && response.status < 300
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== 'object')
    return false

  const candidate = error as { code?: unknown, status?: unknown, statusCode?: unknown }
  return candidate.status === 404 || candidate.statusCode === 404 || candidate.code === 'NoSuchKey'
}

async function moveObjectToTrash(c: Context, fileId: string) {
  if (fileId.startsWith(R2_TRASH_PREFIX))
    return true

  const client = initS3(c)
  const trashPath = getTrashPath(fileId)
  try {
    await client.copyObject({ sourceKey: fileId }, trashPath)
    await client.deleteObject(fileId)
    cloudlog({ requestId: c.get('requestId'), message: 'moved R2 object to trash', fileId, trashPath })
    return true
  }
  catch (error) {
    if (isMissingObjectError(error)) {
      cloudlog({ requestId: c.get('requestId'), message: 'R2 object already missing before trash move', fileId, error: serializeStorageError(error) })
      return true
    }

    cloudlogErr({ requestId: c.get('requestId'), message: 'move R2 object to trash failed', fileId, trashPath, error: serializeStorageError(error) })
    return false
  }
}

async function deleteObjectsWithPrefix(c: Context, prefix: string): Promise<number> {
  const client = initS3(c)
  let deletedCount = 0

  for await (const object of client.listObjects({ prefix })) {
    try {
      await client.deleteObject(object.key)
      deletedCount += 1
    }
    catch (error) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'deleteObjectsWithPrefix item failed',
        prefix,
        key: object.key,
        error,
      })
    }
  }

  return deletedCount
}

async function checkIfExist(c: Context, fileId: string | null) {
  if (!fileId) {
    cloudlog({ requestId: c.get('requestId'), message: 'checkIfExist skipped empty fileId' })
    return false
  }

  const bucket = getEnv(c, 'S3_BUCKET')
  const endpoint = getEnv(c, 'S3_ENDPOINT')

  try {
    const client = initS3(c)
    const url = await client.getPresignedUrl('HEAD', fileId)
    const response = await fetch(url, {
      method: 'HEAD',
    })
    const contentLengthHeader = response.headers.get('content-length')
    const contentLength = Number.parseInt(contentLengthHeader || '0')
    const exists = response.status === 200 && contentLength > 0
    await response.body?.cancel()

    if (!exists) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'checkIfExist returned false',
        bucket,
        contentLength,
        contentLengthHeader,
        endpoint,
        fileId,
        status: response.status,
        statusText: response.statusText,
      })
    }

    return exists
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'checkIfExist failed',
      bucket,
      endpoint,
      error: serializeStorageError(error),
      fileId,
    })
    return false
  }
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initS3(c)
  const url = await client.getPresignedUrl('GET', fileId, {
    expirySeconds,
    parameters: {
      'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
      'x-id': 'PutObject',
    },
  })
  return url
}

function parseObjectSizeFromHeaders(contentRange: string | null, contentLength: string | null): number {
  if (contentRange && contentRange.includes('/')) {
    const total = Number.parseInt(contentRange.split('/').at(1) ?? '0', 10)
    if (Number.isFinite(total) && total > 0)
      return total
  }

  if (contentLength) {
    const len = Number.parseInt(contentLength, 10)
    if (Number.isFinite(len) && len > 0)
      return len
  }

  return 0
}

function serializeStorageError(error: unknown) {
  const serialized = serializeError(error)
  const status = error && typeof error === 'object'
    ? ((error as { status?: unknown, statusCode?: unknown, code?: unknown }).status
      ?? (error as { statusCode?: unknown }).statusCode
      ?? (error as { code?: unknown }).code)
    : undefined

  return {
    ...serialized,
    status,
  }
}

async function getSizeFromRangeFallback(
  c: Context,
  client: ReturnType<typeof initS3>,
  fileId: string,
  reason: 'head_error' | 'missing_head_size',
): Promise<number> {
  try {
    const url = await client.getPresignedUrl('GET', fileId, {
      parameters: { 'x-id': 'GetObject' },
    })
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-0', // minimal range; forces Content-Range with total length
        'Accept-Encoding': 'identity',
      },
    })

    const contentRange = res.headers.get('content-range') || res.headers.get('Content-Range')
    const contentLength = res.headers.get('content-length') || res.headers.get('Content-Length')
    if (!res.ok) {
      await res.body?.cancel()
      cloudlog({
        requestId: c.get('requestId'),
        message: 'getSize range fallback returned non-success response',
        fileId,
        reason,
        status: res.status,
        statusText: res.statusText,
        contentRange,
        contentLength,
        size: 0,
      })
      return 0
    }

    const size = res.status === 206 && contentRange
      ? parseObjectSizeFromHeaders(contentRange, null)
      : res.status === 200
        ? parseObjectSizeFromHeaders(null, contentLength)
        : 0
    await res.body?.cancel()

    cloudlog({
      requestId: c.get('requestId'),
      message: 'getSize range fallback result',
      fileId,
      reason,
      status: res.status,
      statusText: res.statusText,
      contentRange,
      contentLength,
      size,
    })
    return size
  }
  catch (fallbackError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'getSize range fallback failed',
      fileId,
      reason,
      error: serializeStorageError(fallbackError),
      bucket: getEnv(c, 'S3_BUCKET'),
      endpoint: getEnv(c, 'S3_ENDPOINT'),
    })
    return 0
  }
}

async function getSizeForKey(c: Context, client: ReturnType<typeof initS3>, fileId: string) {
  let size = 0
  let headError: unknown
  let usedFallback = false
  try {
    // Ask Cloudflare/R2 for the raw object (no brotli/gzip) so Content-Length is preserved.
    const file = await client.statObject(fileId, {
      headers: { 'Accept-Encoding': 'identity' },
    })
    size = Number.isFinite(file.size) ? file.size : 0
    cloudlog({
      requestId: c.get('requestId'),
      message: 'getSize head result',
      fileId,
      headSize: size,
      headRawSize: file.size,
      bucket: getEnv(c, 'S3_BUCKET'),
      endpoint: getEnv(c, 'S3_ENDPOINT'),
    })
  }
  catch (error) {
    headError = error
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'getSize head failed',
      fileId,
      error: serializeStorageError(error),
      bucket: getEnv(c, 'S3_BUCKET'),
      endpoint: getEnv(c, 'S3_ENDPOINT'),
    })
  }

  if (!size) {
    usedFallback = true
    size = await getSizeFromRangeFallback(c, client, fileId, headError ? 'head_error' : 'missing_head_size')
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'getSize final',
    fileId,
    bucket: getEnv(c, 'S3_BUCKET'),
    endpoint: getEnv(c, 'S3_ENDPOINT'),
    finalSize: size,
    usedFallback,
  })
  return size
}

async function getSize(c: Context, fileId: string) {
  const client = initS3(c)
  const candidateKeys = getManifestStorageCandidateKeys(fileId)

  for (const candidateKey of candidateKeys) {
    const size = await getSizeForKey(c, client, candidateKey)
    if (size > 0) {
      if (candidateKey !== fileId) {
        cloudlog({
          requestId: c.get('requestId'),
          message: 'getSize recovered from manifest storage candidate',
          fileId,
          candidateKey,
          candidateKeys,
          size,
        })
      }
      return size
    }
  }

  if (candidateKeys.length > 1) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'getSize failed all manifest storage candidates',
      fileId,
      candidateKeys,
      bucket: getEnv(c, 'S3_BUCKET'),
      endpoint: getEnv(c, 'S3_ENDPOINT'),
    })
  }

  return 0
}

async function getObject(c: Context, fileId: string): Promise<Response | null> {
  const client = initS3(c)
  try {
    const url = await client.getPresignedUrl('GET', fileId, {
      expirySeconds: 60,
    })
    const response = await fetch(url)
    if (!response.ok) {
      cloudlog({ requestId: c.get('requestId'), message: 'getObject failed', fileId, status: response.status })
      return null
    }
    return response
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'getObject error', fileId, error })
    return null
  }
}

export const s3 = {
  getSize,
  deleteObject,
  moveObjectToTrash,
  deleteObjectsWithPrefix,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
  getObject,
}
