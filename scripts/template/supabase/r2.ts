// deno-lint-ignore-file no-unused-vars
import { S3Client } from 'https://deno.land/x/s3_lite_client@0.6.1/mod.ts'

const accountid = ''
const access_key_id = ''
const access_key_secret = ''
const bucket = 'capgo'
// upper is ignored during netlify generation phase
// import from here
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

async function getSizeChecksum(fileId: string) {
  const client = initR2()
  const { size, metadata } = await client.statObject(fileId)
  const checksum = metadata['x-amz-meta-crc32']
  return { size, checksum }
}
