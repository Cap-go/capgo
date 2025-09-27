import type { Context } from 'hono'
import type { Database } from '../utils/supabase.types.ts'
import { S3Client } from '@bradenmacdonald/s3-lite-client'
import { cloudlog } from './loggin.ts'
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

function resolveStorageApi(c: Context, rawEndpoint: string, useSSL: boolean) {
  if (!rawEndpoint) {
    return null
  }

  const endpoint
    = rawEndpoint.startsWith('http://') || rawEndpoint.startsWith('https://')
      ? rawEndpoint
      : `${useSSL ? 'https://' : 'http://'}${rawEndpoint}`

  let publicBase: URL
  try {
    publicBase = new URL(endpoint)
  }
  catch (error) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'resolveStorageApi_invalid_endpoint',
      rawEndpoint,
      error,
    })
    return null
  }

  let basePath = publicBase.pathname.replace(/\/+$/g, '')
  if (basePath.endsWith('/s3')) {
    basePath = basePath.slice(0, -3).replace(/\/+$/g, '')
  }
  if (basePath && !basePath.startsWith('/')) {
    basePath = `/${basePath}`
  }
  publicBase.pathname = basePath

  const requestBase = new URL(publicBase.toString())
  if (
    requestBase.hostname === '127.0.0.1' || requestBase.hostname === 'localhost'
  ) {
    requestBase.hostname = 'supabase_kong_capgo-app'
    requestBase.port = '8000'
  }

  return { publicBase, requestBase, basePath }
}

function normalizeSignedUrl(
  publicBase: URL,
  basePath: string,
  signedPath: string,
) {
  if (!signedPath) {
    return signedPath
  }

  if (/^https?:\/\//i.test(signedPath)) {
    try {
      const absoluteUrl = new URL(signedPath)
      if (absoluteUrl.hostname === 'supabase_kong_capgo-app') {
        absoluteUrl.hostname = publicBase.hostname
        absoluteUrl.port = publicBase.port
        return absoluteUrl.toString()
      }
    }
    catch {
      return signedPath
    }
    return signedPath
  }

  const trimmedBase = (basePath || '').replace(/\/+$/g, '')
  const effectiveBase = trimmedBase || '/storage/v1'
  const relativePath = signedPath.startsWith('/')
    ? signedPath
    : `/${signedPath}`
  const normalizedPath = relativePath.startsWith(effectiveBase)
    ? relativePath
    : `${effectiveBase}${relativePath}`.replace(/\/{3,}/g, '/')
  return `${publicBase.protocol}//${publicBase.host}${normalizedPath}`
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

// TODO: revert when supabase fix this issue
// https://github.com/supabase/storage/issues/771
// async function getUploadUrl(c: Context, fileId: string, expirySeconds = 1200) {
//   const client = initS3(c)
//   const url = await client.getPresignedUrl('PUT', fileId, {
//     expirySeconds,
//     parameters: {
//       'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
//       'x-id': 'PutObject',
//     },
//   })
//   return url
// }

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 1200) {
  const bucket = getEnv(c, 'S3_BUCKET')
  const serviceKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')
    || getEnv(c, 'SERVICE_ROLE_KEY') || getEnv(c, 'SERVICE_KEY')
  const rawEndpoint = getEnv(c, 'S3_ENDPOINT')
  const useSSL = getEnv(c, 'S3_SSL') === 'true'

  if (!bucket || !serviceKey || !rawEndpoint) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'getUploadUrl_missing_config',
      bucket,
      rawEndpoint,
      hasServiceKey: Boolean(serviceKey),
    })
    return null
  }

  const resolved = resolveStorageApi(c, rawEndpoint, useSSL)
  if (!resolved) {
    return null
  }

  const { publicBase, requestBase, basePath } = resolved
  const encodedKey = fileId.split('/').map(segment =>
    encodeURIComponent(segment),
  ).join('/')
  const requestUrl = new URL(requestBase.toString())
  const basePathForRequest = basePath || ''
  requestUrl.pathname
    = `${basePathForRequest}/object/upload/sign/${bucket}/${encodedKey}`.replace(
      /\/{3,}/g,
      '/',
    )

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'x-upsert': 'true',
    },
    body: JSON.stringify({ expiresIn: expirySeconds }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    cloudlog({
      requestId: c.get('requestId'),
      message: 'getUploadUrl_failed',
      status: response.status,
      errorBody,
    })
    return null
  }

  const result = await response.json() as { url?: string }
  if (!result?.url) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'getUploadUrl_no_url',
      result,
    })
    return null
  }

  if (/^https?:\/\//i.test(result.url)) {
    return result.url
  }

  return normalizeSignedUrl(publicBase, basePath, result.url)
}

async function deleteObject(c: Context, fileId: string) {
  const client = initS3(c)
  await client.deleteObject(fileId)
  return true
}

async function checkIfExist(c: Context, fileId: string | null) {
  if (!fileId) {
    return false
  }
  const client = initS3(c)

  try {
    const file = await client.statObject(fileId)
    return file.size > 0
  }
  catch {
    // cloudlog({ requestId: c.get('requestId'), message: 'checkIfExist', fileId, error  })
    return false
  }
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const bucket = getEnv(c, 'S3_BUCKET')
  const serviceKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')
    || getEnv(c, 'SERVICE_ROLE_KEY') || getEnv(c, 'SERVICE_KEY')
  const rawEndpoint = getEnv(c, 'S3_ENDPOINT')
  const useSSL = getEnv(c, 'S3_SSL') === 'true'

  if (bucket && serviceKey && rawEndpoint) {
    const resolved = resolveStorageApi(c, rawEndpoint, useSSL)
    if (resolved) {
      const { publicBase, requestBase, basePath } = resolved
      const encodedKey = fileId.split('/').map(segment =>
        encodeURIComponent(segment),
      ).join('/')
      const requestUrl = new URL(requestBase.toString())
      const basePathForRequest = basePath || ''
      requestUrl.pathname
        = `${basePathForRequest}/object/sign/${bucket}/${encodedKey}`.replace(
          /\/{3,}/g,
          '/',
        )

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ expiresIn: expirySeconds }),
      })

      if (response.ok) {
        const result = await response.json() as {
          signedUrl?: string
          signedURL?: string
          url?: string
        }
        const signedPath = result?.signedUrl ?? result?.signedURL
          ?? result?.url
        if (signedPath) {
          return normalizeSignedUrl(publicBase, basePath, signedPath)
        }
      }
      else {
        const errorBody = await response.text()
        cloudlog({
          requestId: c.get('requestId'),
          message: 'getSignedUrl_failed',
          status: response.status,
          errorBody,
        })
      }
    }
  }

  // TODO: remove this fallback when supabase fix this issue
  // Fallback to direct S3 presign if storage signing is unavailable
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
    const file = await client.statObject(fileId)
    cloudlog({
      requestId: c.get('requestId'),
      message: 'getSize',
      file,
      fileId,
      bucket: getEnv(c, 'S3_BUCKET'),
      endpoint: getEnv(c, 'S3_ENDPOINT'),
    })
    return file.size ?? 0
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'getSize', error })
    return 0
  }
}

export const s3 = {
  getSize,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
