/**
 * Recheck only previously-missing objects to track recovery progress.
 *
 * Usage: bun scripts/audit_recheck.ts
 */
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'

const ENV_FILE = './internal/cloudflare/.env.prod'
const AUDIT_DIR = './tmp/r2_audit'
const MISSING_VERSIONS = `${AUDIT_DIR}/missing_versions.json`
const MISSING_MANIFESTS = `${AUDIT_DIR}/missing_manifests.json`
const OUTPUT = `${AUDIT_DIR}/recheck_summary.json`

const CONCURRENCY = 500

function loadEnv(filePath: string) {
  const text = Bun.file(filePath).text()
  return text.then((content) => {
    const env: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx <= 0) continue
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
    }
    return env
  })
}

function isMissingError(err: any) {
  const status = err?.$metadata?.httpStatusCode
  const name = err?.name
  return status === 404 || name === 'NotFound' || name === 'NoSuchKey'
}

async function asyncPool<T>(limit: number, items: T[], iterator: (item: T) => Promise<void>) {
  const executing: Promise<void>[] = []

  for (const item of items) {
    const p = iterator(item)
    let e: Promise<void>
    e = p.then(() => {
      const idx = executing.indexOf(e)
      if (idx >= 0) executing.splice(idx, 1)
    })
    executing.push(e)

    if (executing.length >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
}

async function main() {
  const env = await loadEnv(ENV_FILE)
  const bucket = env.S3_BUCKET || 'capgo'
  const s3 = new S3Client({
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    endpoint: `https://${env.S3_ENDPOINT}`,
    region: env.S3_REGION || 'auto',
    forcePathStyle: true,
  })

  const missingVersions = await Bun.file(MISSING_VERSIONS).json().catch(() => []) as Array<{ id: string, r2_path: string }>
  const missingManifests = await Bun.file(MISSING_MANIFESTS).json().catch(() => []) as Array<{ id: string, s3_path: string }>

  const versionKeys = missingVersions.map(v => v.r2_path).filter(Boolean)
  const manifestKeys = missingManifests.map(m => m.s3_path).filter(Boolean)

  console.log(`Missing version zips to recheck: ${versionKeys.length}`)
  console.log(`Missing manifest files to recheck: ${manifestKeys.length}`)

  const recoveredVersions: string[] = []
  const stillMissingVersions: string[] = []
  const recoveredManifests: string[] = []
  const stillMissingManifests: string[] = []

  let checked = 0
  const total = versionKeys.length + manifestKeys.length

  await asyncPool(CONCURRENCY, versionKeys, async (key) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      recoveredVersions.push(key)
    }
    catch (err) {
      if (isMissingError(err)) {
        stillMissingVersions.push(key)
      }
      else {
        throw err
      }
    }
    checked += 1
    process.stdout.write(`\rChecked ${checked}/${total}`)
  })

  await asyncPool(CONCURRENCY, manifestKeys, async (key) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      recoveredManifests.push(key)
    }
    catch (err) {
      if (isMissingError(err)) {
        stillMissingManifests.push(key)
      }
      else {
        throw err
      }
    }
    checked += 1
    process.stdout.write(`\rChecked ${checked}/${total}`)
  })

  process.stdout.write('\n')

  const summary = {
    generatedAt: new Date().toISOString(),
    bucket,
    input: {
      missingVersions: versionKeys.length,
      missingManifests: manifestKeys.length,
    },
    recovered: {
      versions: recoveredVersions.length,
      manifests: recoveredManifests.length,
    },
    stillMissing: {
      versions: stillMissingVersions.length,
      manifests: stillMissingManifests.length,
    },
  }

  await Bun.write(OUTPUT, JSON.stringify({
    summary,
    recovered: {
      versions: recoveredVersions,
      manifests: recoveredManifests,
    },
    stillMissing: {
      versions: stillMissingVersions,
      manifests: stillMissingManifests,
    },
  }, null, 2))

  console.log('=== Recheck Summary ===')
  console.log(`Recovered versions: ${summary.recovered.versions}`)
  console.log(`Recovered manifests: ${summary.recovered.manifests}`)
  console.log(`Still missing versions: ${summary.stillMissing.versions}`)
  console.log(`Still missing manifests: ${summary.stillMissing.manifests}`)
  console.log(`Output: ${OUTPUT}`)
}

await main()
