import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts'

const folderToList = 'orgs'
if (!folderToList) {
  console.error('Please provide a folder path as argument')
  Deno.exit(1)
}

const s3client = new S3Client({
  endPoint: '****.r2.cloudflarestorage.com',
  useSSL: true,
  region: 'auto',
  accessKey: '****',
  secretKey: '****',
  bucket: 'backuptmp',
})

function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

async function listFolderSizes() {
  console.log(`Listing objects in folder: ${folderToList}`)
  let totalSize = 0
  let fileCount = 0

  try {
    for await (const obj of s3client.listObjects({ prefix: folderToList })) {
      const size = obj.size || 0
      totalSize += size
      fileCount++
      console.log(`${obj.key}: ${formatBytes(size)}`)
    }

    console.log('\nSummary:')
    console.log(`Total files: ${fileCount}`)
    console.log(`Total size: ${formatBytes(totalSize)}`)
  }
  catch (error: unknown) {
    console.error('Error listing files:', error)
    Deno.exit(1)
  }
}

await listFolderSizes()
