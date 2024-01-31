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

function upload(c: Context, fileId: string, file: Uint8Array) {
  const client = initR2(c)
  // Upload a file:
  return new Promise((resolve, reject) => {
    client.putObject(bucket, fileId, Buffer.from(file), (err, res) => {
      if (err)
        return reject(err)
      resolve(res)
    })
  })
}

function getUploadUrl(c: Context, fileId: string, expirySeconds = 60) {
  const client = initR2(c)
  return client.presignedPutObject(bucket, fileId, expirySeconds)
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

function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initR2(c)
  return client.presignedGetObject(bucket, fileId, expirySeconds)
}

async function getSizeChecksum(c: Context,fileId: string) {
  const client = initR2(c)
  const { size, metaData } = await client.statObject(bucket, fileId)
  const checksum = metaData['x-amz-meta-crc32']
  return { size, checksum }
}

export const r2 = {
  upload,
  getSizeChecksum,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
