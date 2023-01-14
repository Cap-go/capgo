import { Client } from 'minio'

const accountid = ''
const access_key_id = ''
const access_key_secret = ''
const fileId = ''
const client = new Client({
  endPoint: `https://${accountid}.r2.cloudflarestorage.com`,
  region: 'us-east-1',
  accessKey: access_key_id,
  secretKey: access_key_secret,
})
// upper is ignored during netlify generation phase
// import from here
client.removeObject('capgo', fileId)
