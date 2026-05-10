/*
 * Backfill paid product activity snapshots stored in public.global_stats.
 *
 * Dry run every stored global_stats row:
 *   bun run admin:backfill-paid-product-activity
 *
 * Apply every stored global_stats row:
 *   bun run admin:backfill-paid-product-activity --apply
 *
 * Apply a date range:
 *   bun run admin:backfill-paid-product-activity --apply --from=2026-02-01 --to=2026-04-30
 */
import process from 'node:process'
import { Client as PgClient } from 'pg'
import { DEFAULT_ENV_FILE, getArgValue, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

const DEFAULT_BATCH_SIZE = 30
const DATE_ID_REGEX = /^\d{4}-\d{2}-\d{2}$/
const DATABASE_URL_ENV_KEYS = [
  'MAIN_SUPABASE_DB_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_DIRECT_URL',
  'DIRECT_URL',
] as const

interface BackfillRow {
  date_id: string
  current_builder_active_paying_clients_60d: number
  current_live_updates_active_paying_clients_60d: number
  next_builder_active_paying_clients_60d: number
  next_live_updates_active_paying_clients_60d: number
}

function printHelp() {
  console.log(`Backfill paid product activity metrics in public.global_stats.

Usage:
  bun run admin:backfill-paid-product-activity [options]

Options:
  --apply              Write updates to global_stats. Without this, dry-run only.
  --from=YYYY-MM-DD    Start date_id, inclusive.
  --to=YYYY-MM-DD      End date_id, inclusive.
  --all                Explicitly process every stored global_stats row. This is the default.
  --batch-size=N       Number of date rows to calculate per SQL batch. Default: ${DEFAULT_BATCH_SIZE}.
  --env-file=PATH      Env file to load. Default: ${DEFAULT_ENV_FILE}.
  --help               Show this help.
`)
}

function assertDateId(value: string, label: string) {
  if (!DATE_ID_REGEX.test(value))
    throw new Error(`${label} must use YYYY-MM-DD`)
  return value
}

function toMetricNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function hasRowChanged(row: BackfillRow) {
  return row.current_builder_active_paying_clients_60d !== row.next_builder_active_paying_clients_60d
    || row.current_live_updates_active_paying_clients_60d !== row.next_live_updates_active_paying_clients_60d
}

function chunkItems<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize)
    chunks.push(items.slice(index, index + chunkSize))
  return chunks
}

function getDatabaseUrl(env: Record<string, string | undefined>) {
  for (const key of DATABASE_URL_ENV_KEYS) {
    const value = env[key]?.trim()
    if (value)
      return value
  }

  return null
}

function getRequiredDatabaseUrl(env: Record<string, string | undefined>) {
  const value = getDatabaseUrl(env)
  if (!value)
    throw new Error(`Missing Postgres URL. Set one of: ${DATABASE_URL_ENV_KEYS.join(', ')}`)

  try {
    const parsed = new URL(value)
    if (!parsed.protocol)
      throw new Error('Missing URL protocol')
  }
  catch {
    throw new Error(`Invalid Postgres URL from ${DATABASE_URL_ENV_KEYS.join(', ')}`)
  }

  return value
}

function isSupabasePoolerHost(databaseUrl: string) {
  const parsed = new URL(databaseUrl)
  const hostname = parsed.hostname.toLowerCase()
  const port = parsed.port || '5432'
  return port === '6543' && (hostname.endsWith('.supabase.co') || hostname.endsWith('.supabase.com'))
}

function shouldAllowSelfSignedPgCertificate(env: Record<string, string | undefined>, databaseUrl: string) {
  const allowSelfSigned = env.PG_ALLOW_SELF_SIGNED_CERT?.trim().toLowerCase()
  if (allowSelfSigned === 'true' || allowSelfSigned === '1')
    return true
  if (allowSelfSigned === 'false' || allowSelfSigned === '0')
    return false

  const rejectUnauthorized = env.PG_SSL_REJECT_UNAUTHORIZED?.trim()
  if (rejectUnauthorized === '0')
    return true
  if (rejectUnauthorized === '1')
    return false

  return isSupabasePoolerHost(databaseUrl)
}

function createPgClient(databaseUrl: string, env: Record<string, string | undefined>) {
  const host = new URL(databaseUrl).hostname
  const usesLocalDatabase = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  return new PgClient({
    connectionString: databaseUrl,
    ssl: usesLocalDatabase ? false : { rejectUnauthorized: !shouldAllowSelfSignedPgCertificate(env, databaseUrl) },
  })
}

async function fetchGlobalStatsDateIds(client: PgClient, fromDateId: string | null, toDateId: string | null) {
  const values: string[] = []
  const predicates: string[] = ['date_id ~ \'^\\d{4}-\\d{2}-\\d{2}$\'']

  if (fromDateId) {
    values.push(fromDateId)
    predicates.push(`date_id >= $${values.length}`)
  }
  if (toDateId) {
    values.push(toDateId)
    predicates.push(`date_id <= $${values.length}`)
  }

  const { rows } = await client.query<{ date_id: string }>(`
    SELECT date_id
    FROM public.global_stats
    WHERE ${predicates.join(' AND ')}
    ORDER BY date_id ASC
  `, values)

  return rows.map(row => row.date_id)
}

function buildActivityMetricsCte() {
  return `
    WITH target_stats AS (
      SELECT
        gs.date_id,
        gs.date_id::date AS day_date,
        (gs.date_id::date - INTERVAL '59 days')::date AS lookback_date,
        gs.date_id::date::timestamptz AS day_start,
        (gs.date_id::date + INTERVAL '1 day')::timestamptz AS next_day_start,
        COALESCE(gs.builder_active_paying_clients_60d, 0)::int AS current_builder_active_paying_clients_60d,
        COALESCE(gs.live_updates_active_paying_clients_60d, 0)::int AS current_live_updates_active_paying_clients_60d
      FROM public.global_stats gs
      WHERE gs.date_id = ANY($1::text[])
    ),
    paying_orgs AS (
      SELECT DISTINCT
        ts.date_id,
        ts.day_date,
        ts.lookback_date,
        o.id AS org_id,
        o.customer_id
      FROM target_stats ts
      INNER JOIN public.stripe_info si ON si.status = 'succeeded'
        AND si.is_good_plan = true
      INNER JOIN public.orgs o ON o.customer_id = si.customer_id
      WHERE o.customer_id IS NOT NULL
        AND COALESCE(si.paid_at, si.subscription_anchor_start, si.created_at, o.created_at) < ts.next_day_start
        AND (si.canceled_at IS NULL OR si.canceled_at >= ts.day_start)
    ),
    builder_clients AS (
      SELECT DISTINCT
        po.date_id,
        po.customer_id
      FROM paying_orgs po
      INNER JOIN public.apps a ON a.owner_org = po.org_id
      INNER JOIN public.daily_build_time dbt ON dbt.app_id = a.app_id
      WHERE dbt.date >= po.lookback_date
        AND dbt.date <= po.day_date
        AND dbt.build_count > 0
    ),
    live_updates_clients AS (
      SELECT DISTINCT
        po.date_id,
        po.customer_id
      FROM paying_orgs po
      INNER JOIN public.apps a ON a.owner_org = po.org_id
      INNER JOIN public.daily_version dv ON dv.app_id = a.app_id
      WHERE dv.date >= po.lookback_date
        AND dv.date <= po.day_date
        AND (
          COALESCE(dv.get, 0) > 0
          OR COALESCE(dv.install, 0) > 0
          OR COALESCE(dv.fail, 0) > 0
          OR COALESCE(dv.uninstall, 0) > 0
        )
    ),
    builder_counts AS (
      SELECT
        date_id,
        COUNT(*)::int AS builder_active_paying_clients_60d
      FROM builder_clients
      GROUP BY date_id
    ),
    live_updates_counts AS (
      SELECT
        date_id,
        COUNT(*)::int AS live_updates_active_paying_clients_60d
      FROM live_updates_clients
      GROUP BY date_id
    ),
    calculated AS (
      SELECT
        ts.date_id,
        ts.current_builder_active_paying_clients_60d,
        ts.current_live_updates_active_paying_clients_60d,
        COALESCE(bc.builder_active_paying_clients_60d, 0)::int AS next_builder_active_paying_clients_60d,
        COALESCE(luc.live_updates_active_paying_clients_60d, 0)::int AS next_live_updates_active_paying_clients_60d
      FROM target_stats ts
      LEFT JOIN builder_counts bc ON bc.date_id = ts.date_id
      LEFT JOIN live_updates_counts luc ON luc.date_id = ts.date_id
    )
  `
}

async function calculateBatch(client: PgClient, dateIds: string[]) {
  if (dateIds.length === 0)
    return []

  const { rows } = await client.query<BackfillRow>(`
    ${buildActivityMetricsCte()}
    SELECT *
    FROM calculated
    ORDER BY date_id ASC
  `, [dateIds])

  return rows.map(row => ({
    date_id: row.date_id,
    current_builder_active_paying_clients_60d: toMetricNumber(row.current_builder_active_paying_clients_60d),
    current_live_updates_active_paying_clients_60d: toMetricNumber(row.current_live_updates_active_paying_clients_60d),
    next_builder_active_paying_clients_60d: toMetricNumber(row.next_builder_active_paying_clients_60d),
    next_live_updates_active_paying_clients_60d: toMetricNumber(row.next_live_updates_active_paying_clients_60d),
  }))
}

async function updateBatch(client: PgClient, dateIds: string[]) {
  if (dateIds.length === 0)
    return []

  const { rows } = await client.query<BackfillRow>(`
    ${buildActivityMetricsCte()}
    UPDATE public.global_stats gs
    SET
      builder_active_paying_clients_60d = calculated.next_builder_active_paying_clients_60d,
      live_updates_active_paying_clients_60d = calculated.next_live_updates_active_paying_clients_60d
    FROM calculated
    WHERE gs.date_id = calculated.date_id
      AND (
        gs.builder_active_paying_clients_60d IS DISTINCT FROM calculated.next_builder_active_paying_clients_60d
        OR gs.live_updates_active_paying_clients_60d IS DISTINCT FROM calculated.next_live_updates_active_paying_clients_60d
      )
    RETURNING
      calculated.date_id,
      calculated.current_builder_active_paying_clients_60d,
      calculated.current_live_updates_active_paying_clients_60d,
      calculated.next_builder_active_paying_clients_60d,
      calculated.next_live_updates_active_paying_clients_60d
  `, [dateIds])

  return rows.map(row => ({
    date_id: row.date_id,
    current_builder_active_paying_clients_60d: toMetricNumber(row.current_builder_active_paying_clients_60d),
    current_live_updates_active_paying_clients_60d: toMetricNumber(row.current_live_updates_active_paying_clients_60d),
    next_builder_active_paying_clients_60d: toMetricNumber(row.next_builder_active_paying_clients_60d),
    next_live_updates_active_paying_clients_60d: toMetricNumber(row.next_live_updates_active_paying_clients_60d),
  }))
}

function printSampleRows(rows: BackfillRow[]) {
  const sampleRows = rows.slice(0, 10)
  if (sampleRows.length === 0)
    return

  console.log('Sample updates:')
  for (const row of sampleRows) {
    console.log([
      `${row.date_id}:`,
      `builder ${row.current_builder_active_paying_clients_60d} -> ${row.next_builder_active_paying_clients_60d};`,
      `live updates ${row.current_live_updates_active_paying_clients_60d} -> ${row.next_live_updates_active_paying_clients_60d}`,
    ].join(' '))
  }
}

async function main(args = process.argv.slice(2), runtimeEnv: Record<string, string | undefined> = process.env) {
  if (args.includes('--help')) {
    printHelp()
    return
  }

  const apply = args.includes('--apply')
  const all = args.includes('--all')
  const fromArg = getArgValue(args, '--from')
  const toArg = getArgValue(args, '--to')
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const batchSize = parsePositiveInteger(getArgValue(args, '--batch-size'), '--batch-size', DEFAULT_BATCH_SIZE)

  if (all && (fromArg || toArg))
    throw new Error('--all cannot be combined with --from or --to')

  const fromDateId = fromArg ? assertDateId(fromArg, '--from') : null
  const toDateId = toArg ? assertDateId(toArg, '--to') : null

  if (fromDateId && toDateId && fromDateId > toDateId)
    throw new Error('--from must be before or equal to --to')

  const fileEnv = await loadEnv(envFile)
  const env = {
    ...fileEnv,
    ...runtimeEnv,
  }
  const databaseUrl = getRequiredDatabaseUrl(env)
  const client = createPgClient(databaseUrl, env)

  await client.connect()
  try {
    const dateIds = await fetchGlobalStatsDateIds(client, fromDateId, toDateId)
    const chunks = chunkItems(dateIds, batchSize)
    const changedRows: BackfillRow[] = []
    let processed = 0

    console.log(`Loaded ${dateIds.length} global_stats rows`)
    console.log(`Env file: ${envFile}`)
    if (!fromDateId && !toDateId)
      console.log('Scope: all global_stats rows')
    else
      console.log(`Scope: ${fromDateId ?? 'first'} to ${toDateId ?? 'last'}`)
    console.log(`Batch size: ${batchSize}`)

    for (const chunk of chunks) {
      const batchRows = apply
        ? await updateBatch(client, chunk)
        : (await calculateBatch(client, chunk)).filter(hasRowChanged)
      changedRows.push(...batchRows)
      processed += chunk.length
      if (processed % (batchSize * 10) === 0 || processed === dateIds.length)
        console.log(`${apply ? 'Updated' : 'Analyzed'} ${processed}/${dateIds.length}`)
    }

    console.log(`Rows needing update: ${changedRows.length}`)
    printSampleRows(changedRows)

    if (!apply) {
      console.log('Dry run only. Pass --apply to update global_stats.')
      return
    }

    console.log(`Done. Updated ${changedRows.length}/${dateIds.length} paid product activity rows.`)
  }
  finally {
    await client.end()
  }
}

if (import.meta.main)
  await main()
