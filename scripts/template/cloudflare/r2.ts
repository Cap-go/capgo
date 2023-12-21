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
    endpoint: accountid ? `${accountid}.r2.cloudflarestorage.com` : `http://${storageEndpoint}${storagePort ? `:${storagePort}`: ''}`,
    region: storageRegion ?? 'us-east-1',
    credentials: {
      accessKeyId: access_key_id,
      secretAccessKey: access_key_secret,
    },
    useSSL: accountid ? true : storageUseSsl,
    port: storagePort ? (!Number.isNaN(storagePort) ? storagePort : undefined) : undefined,
    s3ForcePathStyle: true
  }
  return new S3Client(params)
}

function upload(fileId: string, file: Uint8Array) {
  const client = initR2()
  return client.send(new PutObjectCommand({ Bucket: bucket, Key: fileId, Body: file }))
}

function getUploadUrl(fileId: string, expirySeconds = 60) {
  const client = initR2()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: fileId
  })
  return s3GetSignedUrl(client, command, { expiresIn: expirySeconds })
}

function deleteObject(fileId: string) {
  const client = initR2()
  return client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileId }))
  // return client.removeObject(bucket, fileId)
}

function checkIfExist(fileId: string) {
  const client = initR2()
  
  return new Promise((resolve) => {
    const command = new HeadObjectCommand({ Bucket: bucket, Key: fileId });
    client.send(command)
      .then(() => resolve(true))
      .catch(() => resolve(false))
  })
}

function getSignedUrl(fileId: string, expirySeconds: number) {
  const client = initR2()
  const command = new GetObjectCommand({ 
    Bucket: bucket,
    Key: fileId
  })
  return s3GetSignedUrl(client, command, { expiresIn: expirySeconds })
}

async function getSizeChecksum(fileId: string) {
  const client = initR2()
  const { ContentLength: size, Metadata: metaData } = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: fileId }))
  const checksum = metaData ? metaData['x-amz-meta-crc32'] : ''
  return { size, checksum }
}
