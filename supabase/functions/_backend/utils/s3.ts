import type { Context } from 'hono'
import ky from 'ky'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl as getSignedUrlSDK } from '@aws-sdk/s3-request-presigner'

import { getEnv } from './utils.ts'

function initS3(c: Context, clientSideOnly?: boolean) {
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
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

  console.log('initS3', params)

  return new S3Client(params)
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 60) {
  const client = initS3(c, true)

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
    return false
  }
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initS3(c, true)
  const command = new GetObjectCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: fileId,
  })
  const url = await getSignedUrlSDK(client, command, { expiresIn: expirySeconds })
  return url
}

async function getSizeChecksum(c: Context, fileId: string) {
  const client = initS3(c)
  const command = new HeadObjectCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: fileId,
  })
  const url = await getSignedUrlSDK(client, command)
  const response = await ky.head(url)
  const contentLength = response.headers.get('content-length')
  const checksum = response.headers.get('x-amz-meta-crc32')
  const size = contentLength ? Number.parseInt(contentLength, 10) : 0
  return { size, checksum }
}

export const s3 = {
  getSizeChecksum,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
