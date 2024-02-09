import type { Context } from 'hono'
import { Client as S3Client } from './s3/index.ts'

import { getEnv } from './utils.ts'

// import presign s3

const bucket = 'capgo'

function initR2(c: Context) {
  const accountid = getEnv(c, 'R2_ACCOUNT_ID')
  const access_key_id = getEnv(c, 'R2_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'R2_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const storageRegion = getEnv(c, 'S3_REGION')
  const storagePort = Number.parseInt(getEnv(c, 'S3_PORT'))
  const storageUseSsl = getEnv(c, 'S3_SSL').toLocaleLowerCase() === 'true'
  const params = {
    endPoint: accountid ? `${accountid}.r2.cloudflarestorage.com` : storageEndpoint,
    region: storageRegion ?? 'us-east-1',
    useSSL: accountid ? true : storageUseSsl,
    port: storagePort && !Number.isNaN(storagePort) ? storagePort : undefined,
    bucket,
    accessKey: access_key_id,
    secretKey: access_key_secret,
  }
  console.log('initR2', params)
  return new S3Client(params)
}

async function getUploadUrl(c: Context, fileId: string, expirySeconds = 60) {
  const client = initR2(c)

  if (client.host.includes('host.docker.internal'))
    client.host = client.host.replace('host.docker.internal', '0.0.0.0')

  const url = new URL(await client.getPresignedUrl('PUT', fileId, { expirySeconds }))

  return url.toString()
}

function deleteObject(c: Context, fileId: string) {
  const client = initR2(c)
  return client.deleteObject(fileId)
}

function checkIfExist(c: Context, fileId: string) {
  const client = initR2(c)
  return client.exists(fileId)
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initR2(c)

  if (client.host.includes('host.docker.internal'))
    client.host = client.host.replace('host.docker.internal', '0.0.0.0')

  const url = new URL(await client.getPresignedUrl('GET', fileId, { expirySeconds }))

  return url.toString()
}

async function getSizeChecksum(c: Context, fileId: string) {
  const client = initR2(c)
  const { size, metadata } = await client.statObject(fileId)
  const checksum = metadata['x-amz-meta-crc32']
  return { size, checksum }
}

export const r2 = {
  getSizeChecksum,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
