import { Buffer } from 'node:buffer'
import { Client } from 'minio'

const accountid = ''
const access_key_id = ''
const access_key_secret = ''
const bucket = 'capgo'
const storageEndpoint = ''
const storageRegion = ''
const storageUseSsl = false
const storagePort = 9000
// upper is ignored during netlify generation phase
// import from here

function initR2() {
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
