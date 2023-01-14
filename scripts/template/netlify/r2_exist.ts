/* eslint-disable @typescript-eslint/no-unused-vars */
import { Client } from 'minio'

const accountid = ''
const access_key_id = ''
const access_key_secret = ''
const initR2 = () => new Client({
  endPoint: `https://${accountid}.r2.cloudflarestorage.com`,
  region: 'us-east-1',
  accessKey: access_key_id,
  secretKey: access_key_secret,
})
// upper is ignored during netlify generation phase
// import from here
const checkIfExist = (fileId: string) => {
  const client = initR2()
  return new Promise((resolve) => {
    client.getPartialObject('capgo', fileId, 0, 1, (err) => {
      resolve(!err)
    })
  })
}
