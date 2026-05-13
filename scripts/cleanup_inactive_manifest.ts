/*
 * Audit and clean manifest rows whose stored object is not referenced by any active version.
 *
 * Dry run:
 *   bun run admin:cleanup-inactive-manifest
 *
 * Apply:
 *   bun run admin:cleanup-inactive-manifest --apply
 *
 * Optional:
 *   bun run admin:cleanup-inactive-manifest --apply --db-url="$DATABASE_URL"
 *   bun run admin:cleanup-inactive-manifest --apply --env-file=./internal/cloudflare/.env.prod
 *   bun run admin:cleanup-inactive-manifest --apply --batch-size=250 --max-batches=100 --pause-ms=250
 */
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Client } from 'pg'
import { asyncPool, DEFAULT_ENV_FILE, getArgValue, getRequiredEnv, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

interface CandidateSummaryRow {
  manifest_rows: string
  s3_paths: string
  versions: string
}

interface CandidatePathRow {
  first_manifest_id: string
  manifest_rows: string
  s3_path: string
  versions: string
}

interface DeletedManifestRow {
  app_version_id: string
  id: string
  s3_path: string
}

const DEFAULT_BATCH_SIZE = 250
const DEFAULT_MAX_BATCHES = 100
const DEFAULT_PAUSE_MS = 250
const DEFAULT_R2_CONCURRENCY = 10

function printHelp() {
  console.log(`Audit and clean inactive manifest rows.

The script only targets manifest rows attached to deleted app_versions when
their s3_path is not referenced by any active app_versions row.

Usage:
  bun run admin:cleanup-inactive-manifest [options]

Options:
  --apply             Delete matching manifest rows from Supabase and matching objects from R2.
  --db-url=URL        Postgres connection string. Overrides env file values.
  --env-file=PATH     Env file to load. Default: ${DEFAULT_ENV_FILE}.
  --batch-size=N      Number of distinct s3_path objects to process per batch. Default: ${DEFAULT_BATCH_SIZE}.
  --max-batches=N     Maximum cleanup batches to run. Default: ${DEFAULT_MAX_BATCHES}.
  --pause-ms=N        Delay between batches. Default: ${DEFAULT_PAUSE_MS}.
  --r2-concurrency=N  Parallel R2 deletes per batch. Default: ${DEFAULT_R2_CONCURRENCY}.
  --help              Show this help.

Required env:
  DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, or PGDATABASE_URL
  S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT

Optional env:
  S3_BUCKET, S3_REGION, S3_SSL
`)
}

function parseNonNegativeInteger(value: string | null, label: string, fallback: number) {
  if (value === null)
    return fallback

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${label} must be a non-negative integer`)

  return parsed
}

function getDatabaseUrl(env: Record<string, string | undefined>, args: string[]) {
  return getArgValue(args, '--db-url')
    ?? env.DATABASE_URL?.trim()
    ?? env.SUPABASE_DB_URL?.trim()
    ?? env.POSTGRES_URL?.trim()
    ?? env.PGDATABASE_URL?.trim()
    ?? null
}

function shouldUseSsl(databaseUrl: string) {
  const url = new URL(databaseUrl)
  const sslMode = url.searchParams.get('sslmode')
  if (sslMode === 'disable')
    return false
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    return false
  return true
}

function createR2Client(env: Record<string, string | undefined>) {
  const endpoint = getRequiredEnv(env, 'S3_ENDPOINT')
  const protocol = env.S3_SSL === 'false' ? 'http' : 'https'
  const normalizedEndpoint = endpoint.includes('://') ? endpoint : `${protocol}://${endpoint}`

  return {
    bucket: env.S3_BUCKET?.trim() || 'capgo',
    client: new S3Client({
      credentials: {
        accessKeyId: getRequiredEnv(env, 'S3_ACCESS_KEY_ID'),
        secretAccessKey: getRequiredEnv(env, 'S3_SECRET_ACCESS_KEY'),
      },
      endpoint: normalizedEndpoint,
      region: env.S3_REGION || 'auto',
    }),
  }
}

function toInt(value: string | number | null | undefined) {
  return Number.parseInt(String(value ?? '0'), 10)
}

function uniq(values: string[]) {
  return Array.from(new Set(values))
}

function describeError(error: unknown) {
  if (error instanceof Error)
    return error.message
  return String(error)
}

async function getCandidateSummary(client: Client) {
  const result = await client.query<CandidateSummaryRow>(`
    SELECT
      count(*)::text AS manifest_rows,
      count(DISTINCT m.app_version_id)::text AS versions,
      count(DISTINCT m.s3_path)::text AS s3_paths
    FROM public.manifest m
    JOIN public.app_versions av ON av.id = m.app_version_id
    WHERE av.deleted = true
      AND m.s3_path <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM public.manifest active_m
        JOIN public.app_versions active_av ON active_av.id = active_m.app_version_id
        WHERE active_av.deleted = false
          AND active_m.s3_path = m.s3_path
      )
  `)
  return result.rows[0]
}

async function fetchCandidatePaths(client: Client, batchSize: number) {
  const result = await client.query<CandidatePathRow>(`
    SELECT
      m.s3_path,
      count(*)::text AS manifest_rows,
      count(DISTINCT m.app_version_id)::text AS versions,
      min(m.id)::text AS first_manifest_id
    FROM public.manifest m
    JOIN public.app_versions av ON av.id = m.app_version_id
    WHERE av.deleted = true
      AND m.s3_path <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM public.manifest active_m
        JOIN public.app_versions active_av ON active_av.id = active_m.app_version_id
        WHERE active_av.deleted = false
          AND active_m.s3_path = m.s3_path
      )
    GROUP BY m.s3_path
    ORDER BY min(m.id)
    LIMIT $1
  `, [batchSize])
  return result.rows
}

async function getActiveReferencedPaths(client: Client, paths: string[]) {
  if (paths.length === 0)
    return new Set<string>()

  const result = await client.query<{ s3_path: string }>(`
    SELECT DISTINCT m.s3_path
    FROM public.manifest m
    JOIN public.app_versions av ON av.id = m.app_version_id
    WHERE av.deleted = false
      AND m.s3_path = ANY($1::text[])
  `, [paths])

  return new Set(result.rows.map(row => row.s3_path))
}

async function refreshManifestCounters(client: Client, versionIds: string[]) {
  const uniqueVersionIds = uniq(versionIds)
  if (uniqueVersionIds.length === 0)
    return []

  await client.query(`
    UPDATE public.app_versions av
    SET manifest_count = manifest_counts.manifest_count
    FROM (
      SELECT
        av_inner.id,
        count(m.id)::integer AS manifest_count
      FROM public.app_versions av_inner
      LEFT JOIN public.manifest m ON m.app_version_id = av_inner.id
      WHERE av_inner.id = ANY($1::bigint[])
      GROUP BY av_inner.id
    ) manifest_counts
    WHERE av.id = manifest_counts.id
  `, [uniqueVersionIds])

  const appResult = await client.query<{ app_id: string }>(`
    SELECT DISTINCT app_id
    FROM public.app_versions
    WHERE id = ANY($1::bigint[])
  `, [uniqueVersionIds])

  const appIds = appResult.rows.map(row => row.app_id)
  if (appIds.length === 0)
    return []

  await client.query(`
    UPDATE public.apps app
    SET
      manifest_bundle_count = (
        SELECT count(DISTINCT av.id)::bigint
        FROM public.app_versions av
        WHERE av.app_id = app.app_id
          AND EXISTS (
            SELECT 1
            FROM public.manifest m
            WHERE m.app_version_id = av.id
          )
      ),
      updated_at = now()
    WHERE app.app_id = ANY($1::varchar[])
  `, [appIds])

  return appIds
}

async function deleteManifestRows(client: Client, paths: string[]) {
  await client.query('BEGIN')
  try {
    const deleteResult = await client.query<DeletedManifestRow>(`
      DELETE FROM public.manifest m
      USING public.app_versions av
      WHERE av.id = m.app_version_id
        AND av.deleted = true
        AND m.s3_path = ANY($1::text[])
        AND NOT EXISTS (
          SELECT 1
          FROM public.manifest active_m
          JOIN public.app_versions active_av ON active_av.id = active_m.app_version_id
          WHERE active_av.deleted = false
            AND active_m.s3_path = m.s3_path
        )
      RETURNING m.id::text, m.app_version_id::text, m.s3_path
    `, [paths])

    const appIds = await refreshManifestCounters(
      client,
      deleteResult.rows.map(row => row.app_version_id),
    )

    await client.query('COMMIT')

    return {
      appIds,
      deletedRows: deleteResult.rows,
      paths: uniq(deleteResult.rows.map(row => row.s3_path)),
      versionIds: uniq(deleteResult.rows.map(row => row.app_version_id)),
    }
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function deleteR2Objects(s3: S3Client, bucket: string, paths: string[], concurrency: number) {
  const failed: Array<{ error: string, path: string }> = []
  let deleted = 0

  await asyncPool(concurrency, paths, async (path) => {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }))
      deleted += 1
    }
    catch (error) {
      failed.push({ error: describeError(error), path })
    }
  })

  return { deleted, failed }
}

function printSummary(label: string, summary: CandidateSummaryRow | undefined) {
  console.log(`\n${label}`)
  console.table([{
    manifest_rows: toInt(summary?.manifest_rows),
    s3_paths: toInt(summary?.s3_paths),
    versions: toInt(summary?.versions),
  }])
}

async function runApply(
  client: Client,
  s3: S3Client,
  bucket: string,
  batchSize: number,
  maxBatches: number,
  pauseMs: number,
  r2Concurrency: number,
) {
  let totalDbRows = 0
  let totalR2Deleted = 0
  let totalR2Failed = 0

  for (let batch = 1; batch <= maxBatches; batch += 1) {
    const candidatePaths = await fetchCandidatePaths(client, batchSize)
    if (candidatePaths.length === 0) {
      console.log(`No inactive manifest paths found after ${batch - 1} batch(es).`)
      break
    }

    const selectedPaths = candidatePaths.map(row => row.s3_path)
    const deleted = await deleteManifestRows(client, selectedPaths)
    if (deleted.deletedRows.length === 0) {
      console.log(`Batch ${batch}: no rows deleted, stopping to avoid looping on changing data.`)
      break
    }

    const activePaths = await getActiveReferencedPaths(client, deleted.paths)
    const r2Paths = deleted.paths.filter(path => !activePaths.has(path))
    const r2Result = await deleteR2Objects(s3, bucket, r2Paths, r2Concurrency)

    totalDbRows += deleted.deletedRows.length
    totalR2Deleted += r2Result.deleted
    totalR2Failed += r2Result.failed.length

    console.log(`Batch ${batch}: deleted ${deleted.deletedRows.length} Supabase manifest rows across ${deleted.versionIds.length} version(s), deleted ${r2Result.deleted}/${r2Paths.length} R2 object(s).`)
    if (activePaths.size > 0)
      console.log(`Batch ${batch}: skipped ${activePaths.size} R2 object(s) because active references appeared before R2 cleanup.`)
    if (r2Result.failed.length > 0)
      console.table(r2Result.failed.slice(0, 20))

    if (pauseMs > 0)
      await sleep(pauseMs)
  }

  return { totalDbRows, totalR2Deleted, totalR2Failed }
}

async function main() {
  const args = Bun.argv.slice(2)
  if (args.includes('--help')) {
    printHelp()
    return
  }

  const apply = args.includes('--apply')
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const env = { ...process.env, ...await loadEnv(envFile) }
  const databaseUrl = getDatabaseUrl(env, args)
  if (!databaseUrl)
    throw new Error('Missing database URL. Set DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, PGDATABASE_URL, or pass --db-url.')

  const batchSize = parsePositiveInteger(getArgValue(args, '--batch-size'), '--batch-size', DEFAULT_BATCH_SIZE)
  const maxBatches = parsePositiveInteger(getArgValue(args, '--max-batches'), '--max-batches', DEFAULT_MAX_BATCHES)
  const pauseMs = parseNonNegativeInteger(getArgValue(args, '--pause-ms'), '--pause-ms', DEFAULT_PAUSE_MS)
  const r2Concurrency = parsePositiveInteger(getArgValue(args, '--r2-concurrency'), '--r2-concurrency', DEFAULT_R2_CONCURRENCY)

  const client = new Client({
    application_name: 'capgo_cleanup_inactive_manifest',
    connectionString: databaseUrl,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: true } : undefined,
  })

  await client.connect()
  try {
    await client.query('SELECT set_config($1, $2, false)', ['statement_timeout', '15min'])
    await client.query('SELECT set_config($1, $2, false)', ['lock_timeout', '10s'])

    printSummary('Before cleanup', await getCandidateSummary(client))

    const sample = await fetchCandidatePaths(client, Math.min(batchSize, 20))
    if (sample.length > 0) {
      console.log('\nSample inactive manifest paths')
      console.table(sample.map(row => ({
        first_manifest_id: row.first_manifest_id,
        manifest_rows: toInt(row.manifest_rows),
        s3_path: row.s3_path,
        versions: toInt(row.versions),
      })))
    }

    if (!apply) {
      console.log('\nDry run only. Re-run with --apply to delete inactive manifest rows from Supabase and matching objects from R2.')
      return
    }

    const { bucket, client: s3 } = createR2Client(env)
    const result = await runApply(client, s3, bucket, batchSize, maxBatches, pauseMs, r2Concurrency)
    console.log(`\nCleanup result: deleted ${result.totalDbRows} Supabase manifest row(s), deleted ${result.totalR2Deleted} R2 object(s), ${result.totalR2Failed} R2 delete failure(s).`)

    printSummary('After cleanup', await getCandidateSummary(client))
  }
  finally {
    await client.end()
  }
}

await main()
