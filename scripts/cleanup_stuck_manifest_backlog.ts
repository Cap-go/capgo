/*
 * Audit and clear old manifest rows stuck behind soft-deleted bundles.
 *
 * Dry run:
 *   bun run admin:cleanup-stuck-manifest-backlog
 *
 * Apply:
 *   bun run admin:cleanup-stuck-manifest-backlog --apply
 *
 * Optional:
 *   bun run admin:cleanup-stuck-manifest-backlog --apply --db-url="$DATABASE_URL"
 *   bun run admin:cleanup-stuck-manifest-backlog --apply --env-file=./internal/cloudflare/.env.prod
 *   bun run admin:cleanup-stuck-manifest-backlog --apply --max-batches=1000 --pause-ms=250
 *   bun run admin:cleanup-stuck-manifest-backlog --apply --skip-vacuum
 */
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { Client } from 'pg'
import { DEFAULT_ENV_FILE, getArgValue, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

interface TableSizeRow {
  heap: string
  indexes: string
  total: string
}

interface VacuumStatsRow {
  last_autoanalyze: string | null
  last_autovacuum: string | null
  n_dead_tup: string
  n_live_tup: string
}

interface BucketRow {
  bucket: string
  manifest_rows: string
  versions: string
}

interface EligibleVersionRow {
  eligible_versions: string
}

const DEFAULT_MAX_BATCHES = 1000
const DEFAULT_PAUSE_MS = 250

function printHelp() {
  console.log(`Audit and clear old manifest rows stuck behind soft-deleted bundles.

Usage:
  bun run admin:cleanup-stuck-manifest-backlog [options]

Options:
  --apply             Delete old soft-deleted versions by calling public.delete_old_deleted_versions().
  --db-url=URL        Postgres connection string. Overrides env file values.
  --env-file=PATH     Env file to load. Default: ${DEFAULT_ENV_FILE}.
  --max-batches=N     Maximum cleanup batches to run. Default: ${DEFAULT_MAX_BATCHES}.
  --pause-ms=N        Delay between batches. Default: ${DEFAULT_PAUSE_MS}.
  --skip-vacuum       Do not run VACUUM (ANALYZE) public.manifest after apply.
  --help              Show this help.

Required env:
  DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, or PGDATABASE_URL
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

async function getTableSize(client: Client) {
  const result = await client.query<TableSizeRow>(`
    SELECT
      pg_size_pretty(pg_relation_size('public.manifest')) AS heap,
      pg_size_pretty(pg_indexes_size('public.manifest')) AS indexes,
      pg_size_pretty(pg_total_relation_size('public.manifest')) AS total
  `)
  return result.rows[0]
}

async function getVacuumStats(client: Client) {
  const result = await client.query<VacuumStatsRow>(`
    SELECT n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
    FROM pg_stat_user_tables
    WHERE schemaname = 'public' AND relname = 'manifest'
  `)
  return result.rows[0]
}

async function getManifestBuckets(client: Client) {
  const result = await client.query<BucketRow>(`
    SELECT
      CASE
        WHEN av.deleted = false THEN 'active'
        WHEN av.deleted_at < now() - interval '3 months' THEN 'past_hard_delete'
        ELSE 'soft_deleted_waiting'
      END AS bucket,
      count(*)::text AS manifest_rows,
      count(DISTINCT av.id)::text AS versions
    FROM public.manifest m
    JOIN public.app_versions av ON av.id = m.app_version_id
    GROUP BY 1
    ORDER BY count(*) DESC
  `)
  return result.rows
}

async function getEligibleVersionCount(client: Client) {
  const result = await client.query<EligibleVersionRow>(`
    SELECT count(*)::text AS eligible_versions
    FROM public.app_versions av
    WHERE av.deleted_at IS NOT NULL
      AND av.deleted_at < now() - interval '3 months'
      AND av.name NOT IN ('builtin', 'unknown')
      AND NOT EXISTS (
        SELECT 1
        FROM public.channels
        WHERE channels.version = av.id
      )
  `)
  return Number.parseInt(result.rows[0]?.eligible_versions ?? '0', 10)
}

function printAudit(title: string, size: TableSizeRow, stats: VacuumStatsRow | undefined, buckets: BucketRow[]) {
  console.log(`\n${title}`)
  console.table([size])
  if (stats)
    console.table([stats])
  console.table(buckets)
}

async function runCleanupLoop(client: Client, maxBatches: number, pauseMs: number) {
  let batches = 0
  let previousRemaining = await getEligibleVersionCount(client)
  console.log(`Eligible old deleted versions before cleanup: ${previousRemaining}`)

  while (previousRemaining > 0 && batches < maxBatches) {
    batches += 1
    await client.query('SELECT public.delete_old_deleted_versions()')

    const remaining = await getEligibleVersionCount(client)
    const deleted = Math.max(previousRemaining - remaining, 0)
    console.log(`Batch ${batches}: deleted about ${deleted} versions, ${remaining} eligible remain`)

    if (remaining >= previousRemaining) {
      console.log('No progress detected; stopping to avoid looping on a blocked cleanup.')
      break
    }

    previousRemaining = remaining
    if (pauseMs > 0)
      await sleep(pauseMs)
  }

  return {
    batches,
    remaining: previousRemaining,
  }
}

async function main() {
  const args = Bun.argv.slice(2)
  if (args.includes('--help')) {
    printHelp()
    return
  }

  const apply = args.includes('--apply')
  const skipVacuum = args.includes('--skip-vacuum')
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const env = { ...process.env, ...await loadEnv(envFile) }
  const databaseUrl = getDatabaseUrl(env, args)
  if (!databaseUrl)
    throw new Error('Missing database URL. Set DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, PGDATABASE_URL, or pass --db-url.')

  const maxBatches = parsePositiveInteger(getArgValue(args, '--max-batches'), '--max-batches', DEFAULT_MAX_BATCHES)
  const pauseMs = parseNonNegativeInteger(getArgValue(args, '--pause-ms'), '--pause-ms', DEFAULT_PAUSE_MS)
  const client = new Client({
    application_name: 'capgo_cleanup_stuck_manifest_backlog',
    connectionString: databaseUrl,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: true } : undefined,
  })

  await client.connect()
  try {
    await client.query('SELECT set_config($1, $2, false)', ['statement_timeout', '15min'])
    await client.query('SELECT set_config($1, $2, false)', ['lock_timeout', '10s'])

    printAudit(
      'Before cleanup',
      await getTableSize(client),
      await getVacuumStats(client),
      await getManifestBuckets(client),
    )

    if (!apply) {
      console.log('\nDry run only. Re-run with --apply to delete old soft-deleted versions and cascade stuck manifest rows.')
      return
    }

    const cleanup = await runCleanupLoop(client, maxBatches, pauseMs)
    if (cleanup.remaining > 0)
      console.log(`Stopped with ${cleanup.remaining} eligible versions still remaining. Increase --max-batches after checking database load.`)

    if (!skipVacuum) {
      console.log('\nRunning VACUUM (ANALYZE) public.manifest...')
      await client.query('VACUUM (ANALYZE) public.manifest')
    }

    printAudit(
      'After cleanup',
      await getTableSize(client),
      await getVacuumStats(client),
      await getManifestBuckets(client),
    )
  }
  finally {
    await client.end()
  }
}

await main()
