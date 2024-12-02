import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts'

const s3client = new S3Client({
  endPoint: '***.r2.cloudflarestorage.com',
  useSSL: true,
  region: 'auto',
  accessKey: '***',
  secretKey: '***',
  bucket: 'capgo',
})

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

async function findIncompleteUploads() {
  console.log('Listing incomplete multipart uploads...')
  let count = 0
  let totalSize = 0

  try {
    for await (const upload of s3client.listIncompleteUploads()) {
      count++
      const size = upload.size || 0
      totalSize += size
      console.log(`Key: ${upload.key}`)
      console.log(`Upload ID: ${upload.uploadId}`)
      console.log(`Initiated: ${formatDate(upload.initiated)}`)
      console.log(`Size: ${size} bytes`)
      console.log('---')
    }

    console.log('\nSummary:')
    console.log(`Found ${count} incomplete uploads`)
    console.log(`Total size: ${totalSize} bytes`)
  }
  catch (error: unknown) {
    console.error('Error listing incomplete uploads:', error)
    Deno.exit(1)
  }
}

await findIncompleteUploads()
