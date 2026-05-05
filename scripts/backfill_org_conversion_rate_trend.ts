/*
 * Backfill the admin "Org Conversion Rate Trend" metric.
 *
 * The historical paying counts in public.global_stats are Stripe-backed
 * snapshots written by the admin stats cron. The raw org count was not stored,
 * so this script reconstructs that denominator from public.orgs.created_at.
 *
 * Dry run, defaulting to the last 30 UTC calendar days:
 *   bun run stripe:backfill-org-conversion-rate
 *
 * Apply a date range:
 *   bun run stripe:backfill-org-conversion-rate --apply --from=2026-02-01 --to=2026-04-30
 *
 * Apply every stored global_stats row:
 *   bun run stripe:backfill-org-conversion-rate --apply --all
 */
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import process from 'node:process'
import { asyncPool, createSupabaseServiceClient, DEFAULT_ENV_FILE, getArgValue, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

const DEFAULT_LOOKBACK_DAYS = 30
const DEFAULT_CONCURRENCY = 10
const DEFAULT_PAGE_SIZE = 1000
const DATE_ID_REGEX = /^\d{4}-\d{2}-\d{2}$/

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>
type GlobalStatsRow = Pick<
  Database['public']['Tables']['global_stats']['Row'],
  'date_id' | 'paying' | 'org_conversion_rate'
>
type OrgCreatedAtRow = Pick<Database['public']['Tables']['orgs']['Row'], 'created_at'>

export interface OrgConversionRateBackfillRow {
  changed: boolean
  current_rate: number
  date_id: string
  orgs: number
  paying: number
  next_rate: number
}

function getDateId(targetDate = new Date()) {
  return new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())).toISOString().slice(0, 10)
}

function assertDateId(value: string, label: string) {
  if (!DATE_ID_REGEX.test(value))
    throw new Error(`${label} must use YYYY-MM-DD`)
  return value
}

function getDefaultFromDateId(referenceDate = new Date()) {
  const date = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()))
  date.setUTCDate(date.getUTCDate() - DEFAULT_LOOKBACK_DAYS + 1)
  return getDateId(date)
}

function getNextDateId(dateId: string) {
  const date = new Date(`${dateId}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return getDateId(date)
}

function toMetricNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

export function calculateOrgConversionRate(paying: number | string | null | undefined, orgs: number | string | null | undefined) {
  const payingCount = toMetricNumber(paying)
  const orgCount = toMetricNumber(orgs)
  if (orgCount <= 0)
    return 0
  return Number(((payingCount * 100) / orgCount).toFixed(1))
}

function buildOrgCountsByDateId(dateIds: string[], orgRows: OrgCreatedAtRow[]) {
  const orgCreatedAtTimes = orgRows
    .map(row => row.created_at ? Date.parse(row.created_at) : Number.NaN)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  const countsByDateId = new Map<string, number>()
  let orgIndex = 0

  for (const dateId of [...dateIds].sort()) {
    const endExclusive = Date.parse(`${getNextDateId(dateId)}T00:00:00.000Z`)
    while (orgIndex < orgCreatedAtTimes.length && orgCreatedAtTimes[orgIndex]! < endExclusive)
      orgIndex++
    countsByDateId.set(dateId, orgIndex)
  }

  return countsByDateId
}

export function buildOrgConversionRateBackfillRows(rows: GlobalStatsRow[], orgRows: OrgCreatedAtRow[]): OrgConversionRateBackfillRow[] {
  const orgCountsByDateId = buildOrgCountsByDateId(rows.map(row => row.date_id), orgRows)

  return rows.map((row) => {
    const orgs = orgCountsByDateId.get(row.date_id) ?? 0
    const paying = toMetricNumber(row.paying)
    const currentRate = toMetricNumber(row.org_conversion_rate)
    const nextRate = calculateOrgConversionRate(paying, orgs)
    return {
      date_id: row.date_id,
      orgs,
      paying,
      current_rate: currentRate,
      next_rate: nextRate,
      changed: Math.abs(currentRate - nextRate) > 0.0001,
    }
  })
}

async function fetchGlobalStatsRows(supabase: SupabaseClient, fromDateId: string | null, toDateId: string | null) {
  const rows: GlobalStatsRow[] = []
  let offset = 0

  while (true) {
    let query = supabase
      .from('global_stats')
      .select('date_id, paying, org_conversion_rate')
      .order('date_id', { ascending: true })
      .range(offset, offset + DEFAULT_PAGE_SIZE - 1)

    if (fromDateId)
      query = query.gte('date_id', fromDateId)
    if (toDateId)
      query = query.lte('date_id', toDateId)

    const { data, error } = await query
    if (error)
      throw error
    if (!data?.length)
      break

    rows.push(...data)
    if (data.length < DEFAULT_PAGE_SIZE)
      break
    offset += DEFAULT_PAGE_SIZE
  }

  return rows
}

async function fetchOrgCreatedAtRows(supabase: SupabaseClient, toDateId: string | null) {
  const rows: OrgCreatedAtRow[] = []
  let offset = 0

  while (true) {
    let query = supabase
      .from('orgs')
      .select('created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + DEFAULT_PAGE_SIZE - 1)

    if (toDateId)
      query = query.lt('created_at', `${getNextDateId(toDateId)}T00:00:00.000Z`)

    const { data, error } = await query
    if (error)
      throw error
    if (!data?.length)
      break

    rows.push(...data)
    if (data.length < DEFAULT_PAGE_SIZE)
      break
    offset += DEFAULT_PAGE_SIZE
  }

  return rows
}

async function updateConversionRate(supabase: SupabaseClient, row: OrgConversionRateBackfillRow) {
  const { error } = await supabase
    .from('global_stats')
    .update({ org_conversion_rate: row.next_rate })
    .eq('date_id', row.date_id)

  if (error)
    throw error
}

async function main(args = process.argv.slice(2), runtimeEnv: Record<string, string | undefined> = process.env) {
  const apply = args.includes('--apply')
  const all = args.includes('--all')
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const concurrency = parsePositiveInteger(getArgValue(args, '--concurrency'), '--concurrency', DEFAULT_CONCURRENCY)
  const fromDateId = all
    ? null
    : assertDateId(getArgValue(args, '--from') ?? getDefaultFromDateId(), '--from')
  const toDateId = all
    ? null
    : assertDateId(getArgValue(args, '--to') ?? getDateId(), '--to')

  if (fromDateId && toDateId && fromDateId > toDateId)
    throw new Error('--from must be before or equal to --to')

  const fileEnv = await loadEnv(envFile)
  const env = {
    ...fileEnv,
    ...runtimeEnv,
  }
  const supabase = createSupabaseServiceClient(env)

  const rows = await fetchGlobalStatsRows(supabase, fromDateId, toDateId)
  const orgRows = await fetchOrgCreatedAtRows(supabase, toDateId)
  const backfillRows = buildOrgConversionRateBackfillRows(rows, orgRows)
  const changedRows = backfillRows.filter(row => row.changed)

  console.log(`Loaded ${rows.length} global_stats rows`)
  console.log(`Loaded ${orgRows.length} org rows for denominator reconstruction`)
  console.log(`Env file: ${envFile}`)
  if (all)
    console.log('Scope: all global_stats rows')
  else
    console.log(`Scope: ${fromDateId} to ${toDateId}`)
  console.log(`Rows needing update: ${changedRows.length}`)

  const sampleRows = changedRows.slice(0, 10)
  if (sampleRows.length > 0) {
    console.log('Sample updates:')
    for (const row of sampleRows)
      console.log(`${row.date_id}: ${row.current_rate}% -> ${row.next_rate}% (${row.paying}/${row.orgs})`)
  }

  if (!apply) {
    console.log('Dry run only. Pass --apply to update global_stats.')
    return
  }

  if (changedRows.length === 0) {
    console.log('Nothing to update.')
    return
  }

  let updated = 0
  await asyncPool(concurrency, changedRows, async (row) => {
    await updateConversionRate(supabase, row)
    updated++
    if (updated % 100 === 0 || updated === changedRows.length)
      console.log(`Updated ${updated}/${changedRows.length}`)
  })

  console.log(`Done. Updated ${updated}/${changedRows.length} org conversion rate rows.`)
}

if (import.meta.main)
  await main()
