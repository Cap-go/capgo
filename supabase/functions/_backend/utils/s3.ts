import type { Context } from 'hono'
import type { Database } from '../utils/supabase.types.ts'
import { S3Client } from '@bradenmacdonald/s3-lite-client'
import { cloudlog } from './logging.ts'
import { getEnv } from './utils.ts'

function initS3(c: Context) {
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const storageRegion = getEnv(c, 'S3_REGION') || 'us-east-1'
  const useSSL = getEnv(c, 'S3_SSL') === 'true'
  const bucket = getEnv(c, 'S3_BUCKET')
  const endPoint = useSSL
    ? `https://${storageEndpoint}`
    : `http://${storageEndpoint}`
  const client = new S3Client({
    endPoint,
    accessKey: access_key_id,
    pathStyle: true,
    secretKey: access_key_secret,
    region: storageRegion,
    bucket,
  })
  return client
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

async function checkIfExist(c: Context, fileId: string | null) {
  if (!fileId) {
    return false
  }
  try {
    const client = initS3(c)
    const url = await client.getPresignedUrl('HEAD', fileId)
    const response = await fetch(url, {
      method: 'HEAD',
    })
    const contentLength = Number.parseInt(response.headers.get('content-length') || '0')
    return response.status === 200 && contentLength > 0
  }
  catch {
    // cloudlog({ requestId: c.get('requestId'), message: 'checkIfExist', fileId, error  })
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

async function getSize(c: Context, fileId: string) {
  const client = initS3(c)
  try {
    // Ask Cloudflare/R2 for the raw object (no brotli/gzip) so Content-Length is preserved.
    const file = await client.statObject(fileId, {
      headers: { 'Accept-Encoding': 'identity' },
    })

    let size = Number.isFinite(file.size) ? file.size : 0
    cloudlog({ requestId: c.get('requestId'), message: 'getSize head result', fileId, headSize: size, headRawSize: file.size })

    // Fallback: some proxied HEAD responses still omit Content-Length (size becomes NaN)
    if (!size) {
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

        cloudlog({
          requestId: c.get('requestId'),
          message: 'getSize fallback headers',
          fileId,
          status: res.status,
          contentRange,
          contentLength,
        })

        if (contentRange && contentRange.includes('/')) {
          const total = Number.parseInt(contentRange.split('/').at(1) ?? '0', 10)
          if (Number.isFinite(total) && total > 0)
            size = total
        }

        if (!size && contentLength) {
          const len = Number.parseInt(contentLength, 10)
          if (Number.isFinite(len) && len > 0)
            size = len
        }

        cloudlog({ requestId: c.get('requestId'), message: 'getSize fallback parsed', fileId, sizeAfterFallback: size })
      }
      catch (fallbackError) {
        cloudlog({ requestId: c.get('requestId'), message: 'getSize fallback failed', fileId, fallbackError })
      }
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'getSize',
      file,
      fileId,
      bucket: getEnv(c, 'S3_BUCKET'),
      endpoint: getEnv(c, 'S3_ENDPOINT'),
      finalSize: size,
    })
    return size
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'getSize', error })
    return 0
  }
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
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
  getObject,
}
