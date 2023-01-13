import { S3Client } from 'https://deno.land/x/s3_lite_client@0.3.0/mod.ts'

const accountid = Deno.env.get('R2_ACCOUNT_ID')
const access_key_id = Deno.env.get('R2_ACCESS_KEY_ID')
const access_key_secret = Deno.env.get('R2_SECRET_ACCESS_KEY')

const initR2 = () => new S3Client({
  endPoint: `https://${accountid}.r2.cloudflarestorage.com`,
  region: 'us-east-1',
  bucket: 'capgo',
  accessKey: access_key_id,
  secretKey: access_key_secret,
})

const upload = (fileId: string, file: Blob) => {
  const s3client = initR2()
  // Upload a file:
  return s3client.putObject(fileId, file.stream())
}

const deleteObject = (fileId: string) => {
  const s3client = initR2()
  return s3client.deleteObject(fileId)
}

const checkIfExist = (fileId: string) => {
  const s3client = initR2()

  // Upload a file:
  return s3client.exists(fileId)
}

const getSignedUrl = (fileId: string, expirySeconds: number) => {
  const s3client = initR2()
  return s3client.getPresignedUrl('GET', fileId, {
    expirySeconds,
  })
}

export const r2 = {
  upload,
  deleteObject,
  checkIfExist,
  getSignedUrl,
}
