import { Buffer } from 'node:buffer'
import { Client } from 'minio'
import { getEnv } from './getEnv'

const bucket = 'capgo'
// upper is ignored during netlify generation phase
// import from here

function initR2() {
  const accountid = getEnv('R2_ACCOUNT_ID')
  const access_key_id = getEnv('R2_ACCESS_KEY_ID')
  const access_key_secret = getEnv('R2_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv('S3_ENDPOINT')
  const storageRegion = getEnv('S3_REGION')
  const storagePort = Number.parseInt(getEnv('S3_PORT'))
  const storageUseSsl = getEnv('S3_SSL').toLocaleLowerCase() === 'true'
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

function upload(fileId: string, file: Uint8Array) {
  const client = initR2()
  // Upload a file:
  return new Promise((resolve, reject) => {
    client.putObject(bucket, fileId, Buffer.from(file), (err, res) => {
      if (err)
        return reject(err)
      resolve(res)
    })
  })
}

function getUploadUrl(fileId: string, expirySeconds = 60) {
  const client = initR2()
  return client.presignedPutObject(bucket, fileId, expirySeconds)
}

function deleteObject(fileId: string) {
  const client = initR2()
  return client.removeObject(bucket, fileId)
}

function checkIfExist(fileId: string) {
  const client = initR2()
  return new Promise((resolve) => {
    client.getPartialObject(bucket, fileId, 0, 1, (err) => {
      resolve(!err)
    })
  })
}

function getSignedUrl(fileId: string, expirySeconds: number) {
  const client = initR2()
  return client.presignedGetObject(bucket, fileId, expirySeconds)
}

async function getSizeChecksum(fileId: string) {
  const client = initR2()
  const { size, metaData } = await client.statObject(bucket, fileId)
  const checksum = metaData['x-amz-meta-crc32']
  return { size, checksum }
}
