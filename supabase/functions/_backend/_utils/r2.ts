// @transform node import 'minio' to deno 'npm:minio'
import { Client } from 'minio'
// @transform node import 'hono' to deno 'npm:hono'
import type { Context } from 'hono'
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
    port: storagePort ? (!Number.isNaN(storagePort) ? storagePort : undefined) : undefined,
    accessKey: access_key_id,
    secretKey: access_key_secret,
  }

  return new Client(params)
}


async function getUploadUrl(c: Context, fileId: string, expirySeconds = 60) {
  const client = initR2(c)

  const url = new URL(await client.presignedPutObject(bucket, fileId, expirySeconds))
  if (url.hostname === 'host.docker.internal')
    url.hostname = '0.0.0.0'

  return url.toString()
}

function deleteObject(c: Context, fileId: string) {
  const client = initR2(c)
  return client.removeObject(bucket, fileId)
}

function checkIfExist(c: Context, fileId: string) {
  const client = initR2(c)
  return new Promise((resolve) => {
    client.getPartialObject(bucket, fileId, 0, 1, (err) => {
      resolve(!err)
    })
  })
}

async function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initR2(c)

  const url = new URL(await client.presignedGetObject(bucket, fileId, expirySeconds))
  if (url.hostname === 'host.docker.internal')
    url.hostname = '0.0.0.0'

  return url.toString()
}

async function getSizeChecksum(c: Context,fileId: string) {
  const client = initR2(c)
  const { size, metaData } = await client.statObject(bucket, fileId)
  const checksum = metaData['x-amz-meta-crc32']
  return { size, checksum }
}

export const r2 = {
  getSizeChecksum,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
