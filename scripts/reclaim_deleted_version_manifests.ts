/**
 * Reclaim ALL soft-deleted app_versions that still have public.manifest rows.
 *
 * For each file:
 *   1) if R2 object exists → move to deleted-after-7-days/
 *   2) if missing → continue
 *   3) only then delete the DB row
 *
 * Shared delta files referenced by other versions stay in R2.
 *
 * Usage:
 *   bun scripts/reclaim_deleted_version_manifests.ts
 */
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import pg from 'pg'

const ENV_FILE = './internal/cloudflare/.env.prod'
const TRASH_PREFIX = 'deleted-after-7-days/'
const CONCURRENCY = 50
const VERSION_PAGE = 100
const DB_URL_ENV_KEYS = [
  'MAIN_SUPABASE_DB_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_DIRECT_URL',
  'DIRECT_URL',
]

function loadEnv(filePath: string) {
  return Bun.file(filePath).text().then((text) => {
    const env: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#'))
        continue
      const idx = trimmed.indexOf('=')
      if (idx <= 0)
        continue
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
    }
    return env
  })
}

function requireDbUrl(env: Record<string, string>) {
  for (const key of DB_URL_ENV_KEYS) {
    if (env[key])
      return env[key]
  }
  throw new Error(`Missing DB URL. Set one of: ${DB_URL_ENV_KEYS.join(', ')}`)
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let idx = 0
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (idx < items.length) {
      const current = items[idx++]
      await fn(current)
    }
  })
  await Promise.all(workers)
}

async function objectExists(s3: S3Client, bucket: string, key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  }
  catch (error: any) {
    const status = error?.$metadata?.httpStatusCode ?? error?.statusCode ?? error?.status
    const code = error?.name ?? error?.Code ?? error?.code
    if (status === 404 || code === 'NotFound' || code === 'NoSuchKey')
      return false
    throw error
  }
}

async function moveToTrash(s3: S3Client, bucket: string, key: string) {
  if (key.startsWith(TRASH_PREFIX))
    return

  const exists = await objectExists(s3, bucket, key)
  if (!exists)
    return

  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${key}`,
    Key: `${TRASH_PREFIX}${key}`,
  }))
  await s3.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }))
}

function shouldAllowSelfSignedPgCertificate(env: Record<string, string>, databaseUrl: string) {
  const rejectUnauthorized = env.PG_SSL_REJECT_UNAUTHORIZED?.trim()
  if (rejectUnauthorized === '0')
    return true
  if (rejectUnauthorized === '1')
    return false
  // Local/docker URLs keep default Node TLS verification off only when explicitly local.
  return databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
}

async function main() {
  const env = await loadEnv(ENV_FILE)
  const databaseUrl = requireDbUrl(env)
  const usesLocalDatabase = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
  const db = new pg.Client({
    connectionString: databaseUrl,
    ssl: usesLocalDatabase
      ? false
      : { rejectUnauthorized: !shouldAllowSelfSignedPgCertificate(env, databaseUrl) },
  })
  await db.connect()

  const s3 = new S3Client({
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    endpoint: `https://${env.S3_ENDPOINT}`,
    region: env.S3_REGION || 'auto',
    forcePathStyle: true,
  })
  const bucket = env.S3_BUCKET || 'capgo'

  console.log('Listing soft-deleted versions with leftover manifests...')
  const versionsRes = await db.query<{ id: number, app_id: string, manifest_count: number }>(`
    SELECT av.id, av.app_id, av.manifest_count
    FROM public.app_versions AS av
    WHERE av.deleted = true
      AND (
        av.manifest_count > 0
        OR EXISTS (
          SELECT 1 FROM public.manifest AS m WHERE m.app_version_id = av.id
        )
      )
      AND av.app_id NOT LIKE 'com.capdemo%'
    ORDER BY av.id
  `)
  const versions = versionsRes.rows
  console.log(`Found ${versions.length} versions`)

  let done = 0
  let totalTrashed = 0
  let totalDeleted = 0

  for (let i = 0; i < versions.length; i += VERSION_PAGE) {
    const page = versions.slice(i, i + VERSION_PAGE)
    for (const version of page) {
      const entriesRes = await db.query<{
        id: number
        file_hash: string
        file_name: string
        s3_path: string | null
      }>(
        `SELECT id, file_hash, file_name, s3_path
         FROM public.manifest
         WHERE app_version_id = $1
         ORDER BY id`,
        [version.id],
      )
      const entries = entriesRes.rows
      let trashed = 0
      let deletedRows = 0

      await mapPool(entries, CONCURRENCY, async (entry) => {
        if (entry.s3_path) {
          const ref = await db.query(
            `SELECT 1 AS ok
             FROM public.manifest
             WHERE file_hash = $1
               AND file_name = $2
               AND app_version_id <> $3
             LIMIT 1`,
            [entry.file_hash, entry.file_name, version.id],
          )

          if (ref.rows.length === 0) {
            await moveToTrash(s3, bucket, entry.s3_path)
            trashed += 1
          }
        }

        await db.query(`DELETE FROM public.manifest WHERE id = $1`, [entry.id])
        deletedRows += 1
      })

      const remaining = await db.query(
        `SELECT COUNT(*)::int AS count FROM public.manifest WHERE app_version_id = $1`,
        [version.id],
      )
      if (Number(remaining.rows[0]?.count ?? 0) > 0)
        throw new Error(`version ${version.id} still has manifest rows`)

      await db.query('BEGIN')
      try {
        await db.query(
          `UPDATE public.app_versions
           SET manifest_count = 0, manifest = NULL
           WHERE id = $1`,
          [version.id],
        )
        if (deletedRows > 0 || (version.manifest_count ?? 0) > 0) {
          await db.query(
            `UPDATE public.apps
             SET manifest_bundle_count = GREATEST(manifest_bundle_count - 1, 0),
                 updated_at = now()
             WHERE app_id = $1`,
            [version.app_id],
          )
        }
        await db.query('COMMIT')
      }
      catch (error) {
        await db.query('ROLLBACK')
        throw error
      }

      done += 1
      totalTrashed += trashed
      totalDeleted += deletedRows
      process.stdout.write(`\rCleaned ${done}/${versions.length} versions (rows=${totalDeleted}, r2=${totalTrashed})`)
    }
  }

  await db.end()
  process.stdout.write('\n')
  console.log('Done.')
  console.log(`Versions cleaned: ${done}`)
  console.log(`Manifest rows deleted: ${totalDeleted}`)
  console.log(`R2 objects moved to ${TRASH_PREFIX}: ${totalTrashed}`)
}

await main()
