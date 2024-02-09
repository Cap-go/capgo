import type { Context } from 'hono'
import { Client as S3Client } from './s3/index.ts'

import { getEnv } from './utils.ts'

function initS3(c: Context) {
  const bucket = getEnv(c, 'S3_BUCKET')
  const access_key_id = getEnv(c, 'S3_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'S3_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const storageRegion = getEnv(c, 'S3_REGION')
  const storagePort = Number.parseInt(getEnv(c, 'S3_PORT'))
  const storageUseSsl = getEnv(c, 'S3_SSL').toLocaleLowerCase() === 'true'
  const params = {
    endPoint: storageEndpoint,
    region: storageRegion ?? 'us-east-1',
    useSSL: storageUseSsl,
    port: storagePort && !Number.isNaN(storagePort) ? storagePort : undefined,
    bucket,
    accessKey: access_key_id,
    secretKey: access_key_secret,
  }
  console.log('initS3', params)
  return new S3Client(params)
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 60) {
  const client = initS3(c)

  if (client.host.includes('host.docker.internal'))
    client.host = client.host.replace('host.docker.internal', '0.0.0.0')

  const url = new URL(await client.getPresignedUrl('PUT', fileId, { expirySeconds }))

  return url.toString()
}

function deleteObject(c: Context, fileId: string) {
  const client = initS3(c)
  return client.deleteObject(fileId)
}

function checkIfExist(c: Context, fileId: string) {
  const client = initS3(c)
  return client.exists(fileId)
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initS3(c)

  if (client.host.includes('host.docker.internal'))
    client.host = client.host.replace('host.docker.internal', '0.0.0.0')

  const url = new URL(await client.getPresignedUrl('GET', fileId, { expirySeconds }))

  return url.toString()
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
