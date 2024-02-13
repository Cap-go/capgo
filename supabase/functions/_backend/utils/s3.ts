import type { Context } from 'hono'
import { S3Client } from '@capgo/s3-lite-client'


import { getEnv } from './utils.ts'

function initS3(c: Context, clientSideOnly?: boolean) {
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = !clientSideOnly ? getEnv(c, 'S3_ENDPOINT') : getEnv(c, 'S3_ENDPOINT').replace('host.docker.internal', '0.0.0.0')
  const storageRegion = getEnv(c, 'S3_REGION')
  const bucket = getEnv(c, 'S3_BUCKET')
  const storagePort = Number.parseInt(getEnv(c, 'S3_PORT'))
  const storageUseSsl = getEnv(c, 'S3_SSL').toLocaleLowerCase() === 'true'
  const params = {
    endPoint: storageEndpoint,
    region: storageRegion ?? 'us-east-1',
    useSSL: storageUseSsl,
    port: storagePort && !Number.isNaN(storagePort) ? storagePort : undefined,
    accessKey: access_key_id,
    secretKey: access_key_secret,
    bucket,
  }
  console.log('initS3', params)
  return new S3Client(params)
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 60) {
  const client = initS3(c, true)

  return client.getPresignedUrl('PUT', fileId, { expirySeconds })
}

function deleteObject(c: Context, fileId: string) {
  const client = initS3(c)
  const bucket = getEnv(c, 'S3_BUCKET')
  return client.deleteObject(fileId)
}

function checkIfExist(c: Context, fileId: string) {
  const client = initS3(c)
  return client.exists(fileId)
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initS3(c, true)

  return client.getPresignedUrl('GET', fileId, { expirySeconds })
}

async function getSizeChecksum(c: Context, fileId: string) {
  const client = initS3(c)
  const { size, metadata } = await client.statObject(fileId)
  const checksum = metadata['x-amz-meta-crc32']
  return { size, checksum }
}

export const s3 = {
  getSizeChecksum,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
