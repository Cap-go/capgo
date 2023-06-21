import { S3Client } from 'https://deno.land/x/s3_lite_client@0.5.0/mod.ts'
import { getEnv } from './utils.ts'

const accountid = getEnv('R2_ACCOUNT_ID')
const access_key_id = getEnv('R2_ACCESS_KEY_ID')
const access_key_secret = getEnv('R2_SECRET_ACCESS_KEY')
const bucket = 'capgo'

function initR2() {
  return new S3Client({
    endPoint: `${accountid}.r2.cloudflarestorage.com`,
    region: 'us-east-1',
    bucket,
    accessKey: access_key_id,
    secretKey: access_key_secret,
  })
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

export const r2 = {
  upload,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
