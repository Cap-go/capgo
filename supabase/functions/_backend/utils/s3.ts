import type { Context } from '@hono/hono'
import type { Database } from '../utils/supabase.types.ts'
import awsLite from '@aws-lite/client'
import { supabaseAdmin } from './supabase.ts'
import { getEnv } from './utils.ts'

async function initS3(c: Context) {
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const storageRegion = getEnv(c, 'S3_REGION')
  const useSSL = getEnv(c, 'S3_SSL') === 'true'
  const client = await awsLite({
    region: storageRegion ?? 'us-east-1',
    accessKeyId: access_key_id,
    secretAccessKey: access_key_secret,
    url: `${useSSL ? 'https' : 'http'}://${storageEndpoint}`,
    plugins: [import('@aws-lite/s3')],
  })
  // console.log({ requestId: c.get('requestId'), context: 'initS3', client })
  return client.S3
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

async function getUploadUrl(c: Context, fileId: string, _expirySeconds = 1200) {
  const bucket = getEnv(c, 'S3_BUCKET')
  const { data, error } = await supabaseAdmin(c).storage.from(bucket).createSignedUploadUrl(fileId)
  if (error)
    throw error
  return data.signedUrl.replace('http://kong:8000', 'http://localhost:54321')
}

async function deleteObject(c: Context, fileId: string) {
  const client = await initS3(c)
  await client.DeleteObject({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: fileId,
  })
  return true
}

async function checkIfExist(c: Context, fileId: string | null) {
  if (!fileId) {
    return false
  }
  const client = await initS3(c)

  try {
    await client.HeadObject({
      Bucket: getEnv(c, 'S3_BUCKET'),
      Key: fileId,
    })
    return true
  }
  catch {
    // console.log({ requestId: c.get('requestId'), context: 'checkIfExist', fileId, error })
    return false
  }
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  return getUploadUrl(c, fileId, expirySeconds)
}

async function getSize(c: Context, fileId: string) {
  const client = await initS3(c)
  try {
    const stat = await client.HeadObject({
      Bucket: getEnv(c, 'S3_BUCKET'),
      Key: fileId,
    })
    console.log({ requestId: c.get('requestId'), context: 'getSize', stat, fileId, bucket: getEnv(c, 'S3_BUCKET'), endpoint: getEnv(c, 'S3_ENDPOINT') })
    return stat.ContentLength ?? 0
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
