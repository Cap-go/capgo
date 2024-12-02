import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts'

const folderToDelete = 'orgs'
if (!folderToDelete) {
  console.error('Please provide a folder path as argument')
  Deno.exit(1)
}

const s3client = new S3Client({
  endPoint: '***.r2.cloudflarestorage.com',
  useSSL: true,
  region: 'auto',
  accessKey: '***',
  secretKey: '***',
  bucket: 'backuptmp',
})

async function deleteFolder() {
  console.log(`Listing objects in folder: ${folderToDelete}`)
  let deletedCount = 0

  try {
    for await (const obj of s3client.listObjects({ prefix: folderToDelete })) {
      console.log(`Deleting: ${obj.key}`)
      await s3client.deleteObject(obj.key).catch((error) => {
        console.error(`Error deleting ${obj.key}:`, error)
      })
      deletedCount++
    }

    console.log(`Successfully deleted ${deletedCount} files from ${folderToDelete}`)
  }
  catch (error) {
    console.error('Error deleting files:', error)
    Deno.exit(1)
  }
}

await deleteFolder()
