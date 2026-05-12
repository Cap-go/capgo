/*
 * Audit and optionally repair manifest.file_name rows that were stored with
 * URL-encoded path segments by older CLI delta uploads.
 *
 * Dry run:
 *   bun scripts/audit_manifest_filename_encoding.ts
 *
 * Apply only rows proven safe by the original bundle zip:
 *   bun scripts/audit_manifest_filename_encoding.ts --apply
 *
 * Safety model:
 * - manifest.s3_path is never changed.
 * - A row is eligible only when the original bundle zip contains the decoded
 *   filename and does not contain the encoded filename.
 * - Encrypted/missing/unreadable zip bundles are skipped.
 */
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import AdmZip from 'adm-zip'
import { dirname } from 'node:path'
import { Client } from 'pg'
import { DEFAULT_ENV_FILE, getArgValue, getRequiredEnv, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

const DEFAULT_LIMIT = 1000
const DEFAULT_OUTPUT = './tmp/manifest_filename_encoding_audit.json'
const DB_URL_ENV_KEYS = [
  'MAIN_SUPABASE_DB_URL',
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_DIRECT_URL',
]

interface ManifestRow {
  id: number
  app_version_id: number
  app_id: string
  version_name: string
  deleted: boolean | null
  file_name: string
  s3_path: string
  r2_path: string | null
  session_key: string | null
}

interface AuditResult {
  id: number
  app_version_id: number
  app_id: string
  version_name: string
  current_file_name: string
  next_file_name: string | null
  s3_path: string
  r2_path: string | null
  status: 'eligible' | 'skipped' | 'updated' | 'update_failed'
  reason: string
}

function printHelp() {
  console.log(`Audit URL-encoded manifest file_name rows.

Usage:
  bun scripts/audit_manifest_filename_encoding.ts [options]

Options:
  --apply            Write eligible file_name updates. Defaults to dry-run.
  --limit=N          Max candidate rows to inspect. Default: ${DEFAULT_LIMIT}.
  --from-id=N        Resume from manifest.id greater than N.
  --output=PATH      JSON report path. Default: ${DEFAULT_OUTPUT}.
  --env-file=PATH    Env file to load. Default: ${DEFAULT_ENV_FILE}.
  --help             Show this help.

Required env:
  One of ${DB_URL_ENV_KEYS.join(', ')}
  S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT
Optional env:
  S3_REGION, S3_BUCKET
`)
}

function getDatabaseUrl(env: Record<string, string | undefined>) {
  for (const key of DB_URL_ENV_KEYS) {
    const value = env[key]?.trim()
    if (value)
      return value
  }
  throw new Error(`Missing Postgres URL. Set one of: ${DB_URL_ENV_KEYS.join(', ')}`)
}

function encodePathSegments(path: string) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function decodePathSegments(path: string) {
  try {
    return decodeURIComponent(path)
  }
  catch {
    return null
  }
}

function stripBrotliSuffix(path: string) {
  return path.endsWith('.br') ? path.slice(0, -3) : path
}

function isSafeRelativePath(path: string) {
  return path.length > 0
    && !path.startsWith('/')
    && !path.includes('\0')
    && path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..')
}

function extractEncodedManifestPath(s3Path: string) {
  const deltaMarker = '/delta/'
  const deltaIndex = s3Path.indexOf(deltaMarker)
  if (deltaIndex < 0)
    return null

  const afterDelta = s3Path.slice(deltaIndex + deltaMarker.length)
  const segments = afterDelta.split('/')
  const hashSegmentIndex = segments[0]?.includes('_') ? 0 : 1
  const hashSegment = segments[hashSegmentIndex]
  if (!hashSegment)
    return null

  const separatorIndex = hashSegment.indexOf('_')
  if (separatorIndex < 0)
    return null

  const firstPathSegment = hashSegment.slice(separatorIndex + 1)
  if (!firstPathSegment)
    return null

  return [firstPathSegment, ...segments.slice(hashSegmentIndex + 1)].join('/')
}

function createS3Client(env: Record<string, string | undefined>) {
  return new S3Client({
    credentials: {
      accessKeyId: getRequiredEnv(env, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv(env, 'S3_SECRET_ACCESS_KEY'),
    },
    endpoint: `https://${getRequiredEnv(env, 'S3_ENDPOINT')}`,
    region: env.S3_REGION || 'auto',
    forcePathStyle: true,
  })
}

async function objectExists(s3: S3Client, bucket: string, key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  }
  catch {
    return false
  }
}

async function getZipEntries(s3: S3Client, bucket: string, key: string) {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const bytes = await (object.Body as any)?.transformToByteArray?.()
  if (!bytes)
    throw new Error('Cannot read zip body')

  const zip = new AdmZip(Buffer.from(bytes))
  return new Set(zip.getEntries().filter(entry => !entry.isDirectory).map(entry => entry.entryName))
}

async function fetchRows(client: Client, fromId: number, limit: number) {
  const result = await client.query<ManifestRow>(`
    SELECT
      m.id,
      m.app_version_id,
      av.app_id,
      av.name AS version_name,
      av.deleted,
      m.file_name,
      m.s3_path,
      av.r2_path,
      av.session_key
    FROM public.manifest m
    INNER JOIN public.app_versions av ON av.id = m.app_version_id
    WHERE m.id > $1
      AND m.file_name LIKE '%\\%%' ESCAPE '\\'
    ORDER BY m.id ASC
    LIMIT $2
  `, [fromId, limit])

  return result.rows
}

async function main() {
  const args = Bun.argv.slice(2)
  if (args.includes('--help')) {
    printHelp()
    return
  }

  const apply = args.includes('--apply')
  const limit = parsePositiveInteger(getArgValue(args, '--limit'), '--limit', DEFAULT_LIMIT)
  const fromIdArg = getArgValue(args, '--from-id')
  const fromId = fromIdArg === null ? 0 : parsePositiveInteger(fromIdArg, '--from-id', 1)
  const outputPath = getArgValue(args, '--output') ?? DEFAULT_OUTPUT
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const env = { ...process.env, ...await loadEnv(envFile) }
  const bucket = env.S3_BUCKET || 'capgo'
  const s3 = createS3Client(env)
  const pg = new Client({ connectionString: getDatabaseUrl(env) })
  const zipEntryCache = new Map<string, Set<string> | null>()
  const results: AuditResult[] = []

  await pg.connect()
  try {
    const rows = await fetchRows(pg, fromId, limit)
    for (const row of rows) {
      const decoded = decodePathSegments(row.file_name)
      const baseResult = {
        id: row.id,
        app_version_id: row.app_version_id,
        app_id: row.app_id,
        version_name: row.version_name,
        current_file_name: row.file_name,
        next_file_name: decoded,
        s3_path: row.s3_path,
        r2_path: row.r2_path,
      }

      if (!decoded || decoded === row.file_name) {
        results.push({ ...baseResult, next_file_name: null, status: 'skipped', reason: 'not_valid_encoded_path' })
        continue
      }

      if (!isSafeRelativePath(decoded) || encodePathSegments(decoded) !== row.file_name) {
        results.push({ ...baseResult, status: 'skipped', reason: 'not_canonical_safe_path_encoding' })
        continue
      }

      const encodedFromS3 = extractEncodedManifestPath(row.s3_path)
      if (encodedFromS3 !== row.file_name) {
        results.push({ ...baseResult, status: 'skipped', reason: 's3_path_does_not_match_encoded_file_name' })
        continue
      }

      if (!row.r2_path) {
        results.push({ ...baseResult, status: 'skipped', reason: 'no_full_zip_to_verify' })
        continue
      }

      if (row.session_key) {
        results.push({ ...baseResult, status: 'skipped', reason: 'encrypted_zip_cannot_be_verified' })
        continue
      }

      if (!await objectExists(s3, bucket, row.s3_path)) {
        results.push({ ...baseResult, status: 'skipped', reason: 'manifest_object_missing_in_r2' })
        continue
      }

      let zipEntries = zipEntryCache.get(row.r2_path)
      if (zipEntries === undefined) {
        try {
          zipEntries = await getZipEntries(s3, bucket, row.r2_path)
        }
        catch {
          zipEntries = null
        }
        zipEntryCache.set(row.r2_path, zipEntries)
      }

      if (!zipEntries) {
        results.push({ ...baseResult, status: 'skipped', reason: 'full_zip_unreadable' })
        continue
      }

      const decodedZipPath = stripBrotliSuffix(decoded)
      const encodedZipPath = stripBrotliSuffix(row.file_name)
      if (!zipEntries.has(decodedZipPath)) {
        results.push({ ...baseResult, status: 'skipped', reason: 'decoded_file_not_in_full_zip' })
        continue
      }

      if (zipEntries.has(encodedZipPath)) {
        results.push({ ...baseResult, status: 'skipped', reason: 'encoded_file_also_in_full_zip' })
        continue
      }

      if (!apply) {
        results.push({ ...baseResult, status: 'eligible', reason: 'verified_by_full_zip' })
        continue
      }

      const update = await pg.query(
        `
          UPDATE public.manifest
          SET file_name = $1
          WHERE id = $2
            AND file_name = $3
        `,
        [decoded, row.id, row.file_name],
      )
      results.push({
        ...baseResult,
        status: update.rowCount === 1 ? 'updated' : 'update_failed',
        reason: update.rowCount === 1 ? 'verified_by_full_zip' : 'row_changed_before_update',
      })
    }
  }
  finally {
    await pg.end()
  }

  const summary = results.reduce<Record<string, number>>((acc, row) => {
    const key = `${row.status}:${row.reason}`
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const lastInspectedId = results.at(-1)?.id ?? fromId
  await Bun.mkdir(dirname(outputPath), { recursive: true })
  await Bun.write(outputPath, JSON.stringify({ apply, limit, fromId, lastInspectedId, summary, results }, null, 2))
  console.log(`Inspected ${results.length} rows`)
  console.log(`Last inspected manifest.id: ${lastInspectedId}`)
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Report: ${outputPath}`)
  if (!apply)
    console.log('Dry run only. Re-run with --apply to update eligible rows.')
}

await main()
