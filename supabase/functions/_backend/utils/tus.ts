import { CreateMultipartUploadCommand, UploadPartCommand } from '@aws-sdk/client-s3'
import type { Context } from '@hono/hono'
import { initS3 } from './s3.ts'
import { getEnv } from './utils.ts'

const CHUNK_SIZE = 5 * 1024 * 1024 // 5 MB

function generateUniqueKey() {
  return crypto.randomUUID()
}

export async function createTusUpload(c: Context, uploadLength: number, metadata?: string) {
  const s3Client = initS3(c)
  const key = generateUniqueKey() // Implement this function

  const command = new CreateMultipartUploadCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: key,
    Metadata: metadata ? JSON.parse(metadata) : undefined,
  })

  const response = await s3Client.send(command)
  return response.UploadId
}

export async function appendToTusUpload(c: Context, uploadId: string, offset: number, chunk: Uint8Array) {
  const s3Client = initS3(c)
  const partNumber = Math.floor(offset / CHUNK_SIZE) + 1 // Implement CHUNK_SIZE

  const command = new UploadPartCommand({
    Bucket: getEnv(c, 'S3_BUCKET'),
    Key: uploadId,
    PartNumber: partNumber,
    UploadId: uploadId,
    Body: chunk,
  })

  const response = await s3Client.send(command)
  console.log('appendToTusUpload', response)
  return offset + chunk.length
}

// import { CompleteMultipartUploadCommand, CreateMultipartUploadCommand, UploadPartCommand } from '@aws-sdk/client-s3'
// async function fetchUploadedParts(c: Context, uploadId: string) {
//   console.log('fetchUploadedParts', uploadId)
//   return null // TODO: implement
// }

// export async function completeTusUpload(c: Context, uploadId: string) {
//   const s3Client = initS3(c)
//   // Fetch all parts information
//   const parts = await fetchUploadedParts(c, uploadId) // Implement this function

//   const command = new CompleteMultipartUploadCommand({
//     Bucket: getEnv(c, 'S3_BUCKET'),
//     Key: uploadId,
//     UploadId: uploadId,
//     MultipartUpload: { Parts: parts },
//   })

//   await s3Client.send(command)
// }
