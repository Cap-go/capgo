/* eslint-disable @typescript-eslint/no-unused-vars */
import { Client } from 'minio'

const accountid = ''
const access_key_id = ''
const access_key_secret = ''
const bucket = 'capgo'
// upper is ignored during netlify generation phase
// import from here
const initR2 = () => new Client({
  endPoint: `https://${accountid}.r2.cloudflarestorage.com`,
  region: 'us-east-1',
  accessKey: access_key_id,
  secretKey: access_key_secret,
})

const upload = (fileId: string, file: Uint8Array) => {
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

const deleteObject = (fileId: string) => {
  const client = initR2()
  return client.removeObject(bucket, fileId)
}

const checkIfExist = (fileId: string) => {
  const client = initR2()
  return new Promise((resolve) => {
    client.getPartialObject(bucket, fileId, 0, 1, (err) => {
      resolve(!err)
    })
  })
}

const getSignedUrl = (fileId: string, expirySeconds: number) => {
  const client = initR2()
  return client.presignedUrl('GET', bucket, fileId, expirySeconds)
}
