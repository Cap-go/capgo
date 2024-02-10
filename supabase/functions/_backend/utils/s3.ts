import type { Context } from 'hono'
import { Client } from 'minio'

import { getEnv } from './utils.ts'

function initS3(c: Context, clientSideOnly?: boolean) {
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = !clientSideOnly ? getEnv(c, 'S3_ENDPOINT') : getEnv(c, 'S3_ENDPOINT').replace('host.docker.internal', '0.0.0.0')
  const storageRegion = getEnv(c, 'S3_REGION')
  const storagePort = Number.parseInt(getEnv(c, 'S3_PORT'))
  const storageUseSsl = getEnv(c, 'S3_SSL').toLocaleLowerCase() === 'true'
  const params = {
    endPoint: storageEndpoint,
    region: storageRegion ?? 'us-east-1',
    useSSL: storageUseSsl,
    port: storagePort && !Number.isNaN(storagePort) ? storagePort : undefined,
    accessKey: access_key_id,
    secretKey: access_key_secret,
  }
  console.log('initS3', params)
  return new Client(params)
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 60) {
  const client = initS3(c, true)

  const bucket = getEnv(c, 'S3_BUCKET')
  return client.presignedPutObject(bucket, fileId, expirySeconds)
}

function deleteObject(c: Context, fileId: string) {
  const client = initS3(c)
  const bucket = getEnv(c, 'S3_BUCKET')
  return client.removeObject(bucket, fileId)
}

function checkIfExist(c: Context, fileId: string) {
  const client = initS3(c)
  const bucket = getEnv(c, 'S3_BUCKET')
  return new Promise((resolve) => {
    client.getPartialObject(bucket, fileId, 0, 1, (err) => {
      resolve(!err)
    })
  })
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initS3(c, true)

  const bucket = getEnv(c, 'S3_BUCKET')
  return client.presignedGetObject(bucket, fileId, expirySeconds)
}

async function getSizeChecksum(c: Context, fileId: string) {
  const client = initS3(c)
  const bucket = getEnv(c, 'S3_BUCKET')
  const { size, metaData } = await client.statObject(bucket, fileId)
  const checksum = metaData['x-amz-meta-crc32']
  return { size, checksum }
}

export const s3 = {
  getSizeChecksum,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
