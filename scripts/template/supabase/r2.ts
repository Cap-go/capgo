// deno-lint-ignore-file no-unused-vars
import { S3Client } from 'https://deno.land/x/s3_lite_client@0.6.1/mod.ts'

const accountid = ''
const access_key_id = ''
const access_key_secret = ''
const storageEndpoint = ''
const storageRegion = ''
const storageUseSsl = false
const storagePort = 9000
const bucket = 'capgo'
// upper is ignored during netlify generation phase
// import from here
function initR2() {
  const params = {
    endPoint: accountid ? `${accountid}.r2.cloudflarestorage.com` : storageEndpoint,
    region: storageRegion ?? 'us-east-1',
    useSSL: accountid ? true : storageUseSsl,
    port: storagePort ? (!Number.isNaN(storagePort) ? storagePort : undefined) : undefined,
    bucket,
    accessKey: access_key_id,
    secretKey: access_key_secret,
  }

  return new S3Client(params)
}

function upload(fileId: string, file: Uint8Array) {
  const client = initR2()
  return client.putObject(fileId, file)
}

function getUploadUrl(fileId: string, expirySeconds = 60) {
  const client = initR2()
  return client.getPresignedUrl('PUT', fileId, { expirySeconds })
}

function deleteObject(fileId: string) {
  const client = initR2()
  return client.deleteObject(fileId)
}

function checkIfExist(fileId: string) {
  const client = initR2()
  return client.exists(fileId)
}

function getSignedUrl(fileId: string, expirySeconds: number) {
  const client = initR2()
  return client.getPresignedUrl('GET', fileId, { expirySeconds })
}
// get the size from r2
async function getSizeChecksum(fileId: string) {
  const client = initR2()
  const { size, metadata } = await client.statObject(fileId)
  const checksum = metadata['x-amz-meta-crc32']
  return { size, checksum }
}
