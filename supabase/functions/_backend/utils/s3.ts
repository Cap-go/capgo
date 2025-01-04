import type { Context } from '@hono/hono'
import type { Database } from '../utils/supabase.types.ts'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl as getSignedUrlSDK } from '@aws-sdk/s3-request-presigner'
import ky from 'ky'
import { getEnv } from './utils.ts'

export function initS3(c: Context) {
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const useSsl = getEnv(c, 'S3_SSL') !== 'false'

  const storageRegion = getEnv(c, 'S3_REGION')
  const params = {
    credentials: {
      accessKeyId: access_key_id,
      secretAccessKey: access_key_secret,
    },
    endpoint: `${useSsl ? 'https' : 'http'}://${storageEndpoint}`,
    region: storageRegion ?? 'us-east-1',
    // not apply in supabase local
    forcePathStyle: storageEndpoint !== '127.0.0.1:54321/storage/v1/s3',
    signingEscapePath: storageEndpoint !== '127.0.0.1:54321/storage/v1/s3',
  }

  console.log({ requestId: c.get('requestId'), context: 'initS3', params })

  return new S3Client(params)
}

export async function getPath(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  if (!record.r2_path) {
    console.log({ requestId: c.get('requestId'), context: 'no r2_path' })
    return null
  }
  if (!record.r2_path && (!record.app_id || !record.user_id || !record.id)) {
    console.log({ requestId: c.get('requestId'), context: 'no app_id or user_id or id' })
    return null
  }
  const exist = await checkIfExist(c, record.r2_path)
  if (!exist) {
    console.log({ requestId: c.get('requestId'), context: 'not exist', vPath: record.r2_path })
    return null
  }
  return record.r2_path
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 1200) {
  const client = initS3(c)

  const command = new PutObjectCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: fileId,
  })
  const url = await getSignedUrlSDK(client, command, { expiresIn: expirySeconds })
  return url
}

async function deleteObject(c: Context, fileId: string) {
  const client = initS3(c)
  const command = new DeleteObjectCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: fileId,
  })
  await client.send(command)
  return true
}

async function checkIfExist(c: Context, fileId: string | null) {
  if (!fileId) {
    return false
  }
  const client = initS3(c)
  try {
    const command = new HeadObjectCommand({
      Bucket: getEnv(c, 'S3_BUCKET'),
      Key: fileId,
    })
    await client.send(command)
    return true
  }
  catch (error) {
    console.log({ requestId: c.get('requestId'), context: 'checkIfExist', fileId, error })
    return false
  }
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initS3(c)
  const command = new GetObjectCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: fileId,
  })
  const url = await getSignedUrlSDK(client, command, { expiresIn: expirySeconds })
  return url
}

async function getSize(c: Context, fileId: string) {
  const client = initS3(c)
  const command = new HeadObjectCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: fileId,
  })
  try {
    const url = await getSignedUrlSDK(client, command)
    const response = await ky.head(url)
    const contentLength = response.headers.get('content-length')
    const size = contentLength ? Number.parseInt(contentLength, 10) : 0
    return size
  }
  catch (error) {
    console.log({ requestId: c.get('requestId'), context: 'getSize', error })
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
