/**
 * Script 2: Delete orphaned R2 paths - FAST parallel deletion
 *
 * Just reads paths from script 1 and deletes everything in parallel.
 * No collecting, no waiting - stream delete while listing.
 */

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

// Load environment from prod file
const envFile = await Bun.file('./internal/cloudflare/.env.prod').text()
const env: Record<string, string> = {}
for (const line of envFile.split('\n')) {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0)
      env[trimmed.substring(0, eqIndex)] = trimmed.substring(eqIndex + 1)
  }
}

const INPUT_FILE = './tmp/r2_cleanup/1_orphaned_paths.json'
const S3_BUCKET = env.S3_BUCKET || 'capgo'
const CONCURRENCY = 50 // High parallelism

// Ask user
process.stdout.write('\nDo you want to actually DELETE files? (yes/no): ')
let DRY_RUN = true
for await (const line of console) {
  const answer = line.trim().toLowerCase()
  if (answer === 'yes' || answer === 'y') {
    DRY_RUN = false
    break
  }
  if (answer === 'no' || answer === 'n')
    break
  process.stdout.write('Please answer yes or no: ')
}

const s3 = new S3Client({
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  endpoint: `https://${env.S3_ENDPOINT}`,
  region: env.S3_REGION || 'auto',
  forcePathStyle: true,
})

let totalDeleted = 0
let totalErrors = 0

// Stream delete a prefix: list and delete simultaneously
async function streamDelete(prefix: string): Promise<void> {
  let continuationToken: string | undefined
  let batch: string[] = []

  while (true) {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }))

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key)
          batch.push(obj.Key)
      }
    }

    // Delete immediately when we have 999
    while (batch.length >= 999) {
      const toDelete = batch.splice(0, 999)
      if (!DRY_RUN) {
        try {
          await s3.send(new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: { Objects: toDelete.map(k => ({ Key: k })), Quiet: true },
          }))
        }
        catch { totalErrors += toDelete.length }
      }
      totalDeleted += toDelete.length
    }

    if (!response.IsTruncated)
      break
    continuationToken = response.NextContinuationToken
  }

  // Delete remaining
  if (batch.length > 0) {
    if (!DRY_RUN) {
      try {
        await s3.send(new DeleteObjectsCommand({
          Bucket: S3_BUCKET,
          Delete: { Objects: batch.map(k => ({ Key: k })), Quiet: true },
        }))
      }
      catch { totalErrors += batch.length }
    }
    totalDeleted += batch.length
  }
}

// Delete single files directly - in parallel batches
async function deleteFiles(keys: string[]): Promise<void> {
  const batches: string[][] = []
  for (let i = 0; i < keys.length; i += 999) {
    batches.push(keys.slice(i, i + 999))
  }

  // Delete all batches in parallel (CONCURRENCY at a time)
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const batchGroup = batches.slice(i, i + CONCURRENCY)
    await Promise.all(batchGroup.map(async (batch) => {
      if (!DRY_RUN) {
        try {
          await s3.send(new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: { Objects: batch.map(k => ({ Key: k })), Quiet: true },
          }))
        }
        catch { totalErrors += batch.length }
      }
      totalDeleted += batch.length
    }))
  }
}

async function main() {
  console.log(`\n=== Delete Orphaned R2 Paths ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE DELETE'}`)
  console.log(`Concurrency: ${CONCURRENCY}\n`)

  const inputFile = Bun.file(INPUT_FILE)
  if (!await inputFile.exists()) {
    console.error(`Run script 1 first`)
    process.exit(1)
  }

  const data = await inputFile.json()
  const allPaths = data.orphanedPaths as { path: string, type: string }[]

  // Separate files from folders
  const files = allPaths.filter(p => p.path.endsWith('.zip')).map(p => p.path)
  const folders = allPaths.filter(p => !p.path.endsWith('.zip')).map(p => p.path)

  console.log(`Files to delete: ${files.length}`)
  console.log(`Folders to delete: ${folders.length}`)

  // Progress ticker
  const ticker = setInterval(() => {
    process.stdout.write(`\r  Deleted: ${totalDeleted} | Errors: ${totalErrors}`)
  }, 500)

  // Delete all files in parallel batches
  if (files.length > 0) {
    console.log(`\nDeleting ${files.length} files...`)
    await deleteFiles(files)
  }

  // Delete all folders in parallel (CONCURRENCY at a time)
  if (folders.length > 0) {
    console.log(`\nDeleting ${folders.length} folders in parallel...`)
    for (let i = 0; i < folders.length; i += CONCURRENCY) {
      const batch = folders.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(f => streamDelete(f)))
      process.stdout.write(`\r  Progress: ${Math.min(i + CONCURRENCY, folders.length)}/${folders.length} folders | ${totalDeleted} files deleted`)
    }
  }

  clearInterval(ticker)

  console.log(`\n\n=== Done ===`)
  console.log(`Total deleted: ${totalDeleted}`)
  console.log(`Errors: ${totalErrors}`)
  if (DRY_RUN)
    console.log(`\n(DRY RUN - nothing actually deleted)`)
}

await main()
