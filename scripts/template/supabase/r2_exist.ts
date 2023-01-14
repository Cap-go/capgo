/* eslint-disable @typescript-eslint/no-unused-vars */
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

// upper is ignored during netlify generation phase
// import from here
const checkIfExist = (fileId: string) => {
  const client = initR2()
  return client.exists(fileId)
}
