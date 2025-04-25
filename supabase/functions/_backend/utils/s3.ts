import type { Context } from '@hono/hono'
import type { Database } from '../utils/supabase.types.ts'
import { S3Client } from '@bradenmacdonald/s3-lite-client'
import { getEnv } from './utils.ts'

async function initS3(c: Context) {
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const storageRegion = getEnv(c, 'S3_REGION') || 'us-east-1'
  const useSSL = getEnv(c, 'S3_SSL') === 'true'
  const bucket = getEnv(c, 'S3_BUCKET')
  const endPoint = useSSL ? `https://${storageEndpoint}` : `http://${storageEndpoint}`
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

export async function getPath(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  if (!record.r2_path) {
    console.log({ requestId: c.get('requestId'), message: 'no r2_path' })
    return null
  }
  if (!record.r2_path && (!record.app_id || !record.user_id || !record.id)) {
    console.log({ requestId: c.get('requestId'), message: 'no app_id or user_id or id' })
    return null
  }
  const exist = await checkIfExist(c, record.r2_path)
  if (!exist) {
    console.log({ requestId: c.get('requestId'), message: 'not exist', vPath: record.r2_path })
    return null
  }
  return record.r2_path
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 1200) {
  const client = await initS3(c)
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
  const client = await initS3(c)
  await client.deleteObject(fileId)
  return true
}

async function checkIfExist(c: Context, fileId: string | null) {
  if (!fileId) {
    return false
  }
  const client = await initS3(c)

  try {
    const file = await client.statObject(fileId)
    return file.size > 0
  }
  catch {
    // console.log({ requestId: c.get('requestId'), message: 'checkIfExist', fileId, error })
    return false
  }
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  // return getUploadUrl(c, fileId, expirySeconds)
  const client = await initS3(c)
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
  const client = await initS3(c)
  try {
    const file = await client.statObject(fileId)
    console.log({ requestId: c.get('requestId'), message: 'getSize', file, fileId, bucket: getEnv(c, 'S3_BUCKET'), endpoint: getEnv(c, 'S3_ENDPOINT') })
    return file.size ?? 0
  }
  catch (error) {
    console.log({ requestId: c.get('requestId'), message: 'getSize', error })
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
