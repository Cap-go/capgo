import { CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl as getSignedUrlSDK } from '@aws-sdk/s3-request-presigner'
import ky from 'ky'
import type { CompletedPart } from '@aws-sdk/client-s3'
import type { Context } from '@hono/hono'
import { getEnv } from './utils.ts'
import type { Database } from '../utils/supabase.types.ts'

export function initS3(c: Context, uploadKey = false, clientSideOnly?: boolean) {
  const access_key_id = uploadKey ? getEnv(c, 'S3_ACCESS_KEY_ID_UPLOAD') : getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = uploadKey ? getEnv(c, 'S3_SECRET_ACCESS_KEY_UPLOAD') : getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = !clientSideOnly ? getEnv(c, 'S3_ENDPOINT') : getEnv(c, 'S3_ENDPOINT').replace('host.docker.internal', '0.0.0.0')
  const useSsl = getEnv(c, 'S3_SSL') !== 'false'

  const storageRegion = getEnv(c, 'S3_REGION')
  const params = {
    credentials: {
      accessKeyId: access_key_id,
      secretAccessKey: access_key_secret,
    },
    endpoint: `${useSsl ? 'https' : 'http'}://${storageEndpoint}`,
    region: storageRegion ?? 'us-east-1',
    forcePathStyle: true,
    signingEscapePath: true,
  }

  console.log({ requestId: c.get('requestId'), context: 'initS3', params })

  return new S3Client(params)
}

export async function getPath(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  if (!record.bucket_id && !record.r2_path) {
    console.log({ requestId: c.get('requestId'), context: 'no bucket_id or r2_path' })
    return null
  }
  if (!record.r2_path && (!record.app_id || !record.user_id || !record.id)) {
    console.log({ requestId: c.get('requestId'), context: 'no app_id or user_id or id' })
    return null
  }
  // TODO: delete bucket_id in september 2024
  const vPath = record.bucket_id ? `apps/${record.user_id}/${record.app_id}/versions/${record.bucket_id}` : record.r2_path
  const exist = vPath ? await checkIfExist(c, vPath) : false
  if (!exist) {
    console.log({ requestId: c.get('requestId'), context: 'not exist', vPath })
    return null
  }
  return vPath
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 1200) {
  const client = initS3(c, true, true)

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

export function createMultipartUpload(c: Context, key: string) {
  const client = initS3(c)
  const command = new CreateMultipartUploadCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: key,
  })

  return client.send(command)
}

export function compleateMultipartUpload(c: Context, key: string, uploadId: string, parts: CompletedPart[]) {
  const client = initS3(c)
  const command = new CompleteMultipartUploadCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  })

  return client.send(command)
}

export function multipartUploadPart(c: Context, key: string, uploadId: string, partNumber: number, contentLength: number, chunk: Uint8Array) {
  const client = initS3(c)

  const command = new UploadPartCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
    Body: chunk,
    ContentLength: contentLength,
  })

  return client.send(command)
}

async function checkIfExist(c: Context, fileId: string) {
  const client = initS3(c)
  try {
    // TODO: migrate to ky.head
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
  const client = initS3(c, false, true)
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
