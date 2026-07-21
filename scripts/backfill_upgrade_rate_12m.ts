/*
 * Backfill public.global_stats.upgrade_rate_12m.
 *
 * For each snapshot day, compute:
 *   orgs with stripe_info.upgraded_at in [dayEnd-12 calendar months, dayEnd)
 *   / orgs with created_at < dayEnd
 *   * 100
 *
 * Limitation: stripe_info.upgraded_at stores only the latest upgrade timestamp,
 * so historical rows use that last-known upgrade (same contract as the daily
 * revenue shard). Orgs that upgraded earlier in-window but again later may be
 * undercounted on older snapshots.
 *
 * Dry run, defaulting to the last 30 UTC calendar days:
 *   bun run stripe:backfill-upgrade-rate-12m
 *
 * Apply a date range:
 *   bun run stripe:backfill-upgrade-rate-12m --apply --from=2024-01-01 --to=2026-07-21
 *
 * Apply every stored global_stats row:
 *   bun run stripe:backfill-upgrade-rate-12m --apply --all
 */
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import process from 'node:process'
import { asyncPool, createSupabaseServiceClient, DEFAULT_ENV_FILE, getArgValue, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

const DEFAULT_LOOKBACK_DAYS = 30
const DEFAULT_CONCURRENCY = 10
const DEFAULT_PAGE_SIZE = 1000
const DATE_ID_REGEX = /^\d{4}-\d{2}-\d{2}$/

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>
type GlobalStatsRow = Pick<Database['public']['Tables']['global_stats']['Row'], 'date_id' | 'upgrade_rate_12m'>
type OrgRow = Pick<Database['public']['Tables']['orgs']['Row'], 'created_at' | 'customer_id' | 'id'>
type StripeInfoRow = Pick<Database['public']['Tables']['stripe_info']['Row'], 'customer_id' | 'upgraded_at'>

export interface UpgradeRate12mBackfillRow {
  changed: boolean
  current_rate: number
  date_id: string
  next_rate: number
  orgs: number
  upgraded_orgs_12m: number
}

function getDateId(targetDate = new Date()) {
  return new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())).toISOString().slice(0, 10)
}

function assertDateId(value: string, label: string) {
  if (!DATE_ID_REGEX.test(value))
    throw new Error(`${label} must use YYYY-MM-DD`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || getDateId(parsed) !== value)
    throw new Error(`${label} must be a valid UTC calendar date`)
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

export function calculateUpgradeRate12m(upgradedOrgs: number | string | null | undefined, orgs: number | string | null | undefined) {
  const upgradedCount = toMetricNumber(upgradedOrgs)
  const orgCount = toMetricNumber(orgs)
  if (orgCount <= 0)
    return 0
  return Number(((upgradedCount * 100) / orgCount).toFixed(1))
}

function hasRateChanged(currentRate: number, nextRate: number) {
  return Math.abs(currentRate - nextRate) > 0.0001
}

function buildOrgCreatedAtTimes(orgRows: OrgRow[]) {
  return orgRows
    .map(row => row.created_at ? Date.parse(row.created_at) : Number.NaN)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
}

function buildUpgradeEvents(orgRows: OrgRow[], stripeRows: StripeInfoRow[]) {
  const orgIdsByCustomerId = new Map<string, string[]>()
  for (const org of orgRows) {
    if (!org.customer_id)
      continue
    const existing = orgIdsByCustomerId.get(org.customer_id) ?? []
    existing.push(org.id)
    orgIdsByCustomerId.set(org.customer_id, existing)
  }

  const events: Array<{ orgId: string, upgradedAt: number }> = []
  for (const row of stripeRows) {
    if (!row.customer_id || !row.upgraded_at)
      continue
    const upgradedAt = Date.parse(row.upgraded_at)
    if (!Number.isFinite(upgradedAt))
      continue
    const orgIds = orgIdsByCustomerId.get(row.customer_id)
    if (!orgIds?.length)
      continue
    for (const orgId of orgIds)
      events.push({ orgId, upgradedAt })
  }

  return events.sort((left, right) => left.upgradedAt - right.upgradedAt)
}

export function buildUpgradeRate12mBackfillRows(
  rows: GlobalStatsRow[],
  orgRows: OrgRow[],
  stripeRows: StripeInfoRow[],
): UpgradeRate12mBackfillRow[] {
  const orgCreatedAtTimes = buildOrgCreatedAtTimes(orgRows)
  const upgradeEvents = buildUpgradeEvents(orgRows, stripeRows)
  let orgIndex = 0

  return [...rows]
    .sort((left, right) => left.date_id.localeCompare(right.date_id))
    .map((row) => {
      const endExclusiveDate = new Date(`${getNextDateId(row.date_id)}T00:00:00.000Z`)
      const endExclusive = endExclusiveDate.getTime()
      const startInclusive = Date.UTC(
        endExclusiveDate.getUTCFullYear() - 1,
        endExclusiveDate.getUTCMonth(),
        endExclusiveDate.getUTCDate(),
      )

      while (orgIndex < orgCreatedAtTimes.length && orgCreatedAtTimes[orgIndex]! < endExclusive)
        orgIndex++

      const upgradedOrgIds = new Set<string>()
      for (const event of upgradeEvents) {
        if (event.upgradedAt < startInclusive)
          continue
        if (event.upgradedAt >= endExclusive)
          break
        upgradedOrgIds.add(event.orgId)
      }

      const orgs = orgIndex
      const upgraded_orgs_12m = upgradedOrgIds.size
      const current_rate = toMetricNumber(row.upgrade_rate_12m)
      const next_rate = calculateUpgradeRate12m(upgraded_orgs_12m, orgs)

      return {
        date_id: row.date_id,
        orgs,
        upgraded_orgs_12m,
        current_rate,
        next_rate,
        changed: row.upgrade_rate_12m == null || hasRateChanged(current_rate, next_rate),
      }
    })
}

async function fetchGlobalStatsRows(supabase: SupabaseClient, fromDateId: string | null, toDateId: string | null) {
  const rows: GlobalStatsRow[] = []
  let offset = 0

  while (true) {
    let query = supabase
      .from('global_stats')
      .select('date_id, upgrade_rate_12m')
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

async function fetchOrgRows(supabase: SupabaseClient, toDateId: string | null) {
  const rows: OrgRow[] = []
  let offset = 0

  while (true) {
    let query = supabase
      .from('orgs')
      .select('id, created_at, customer_id')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
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

async function fetchStripeInfoRows(supabase: SupabaseClient) {
  const rows: StripeInfoRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('stripe_info')
      .select('customer_id, upgraded_at')
      .not('upgraded_at', 'is', null)
      .order('upgraded_at', { ascending: true })
      .order('customer_id', { ascending: true })
      .range(offset, offset + DEFAULT_PAGE_SIZE - 1)

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

async function updateUpgradeRate(supabase: SupabaseClient, row: UpgradeRate12mBackfillRow) {
  const { error } = await supabase
    .from('global_stats')
    .update({ upgrade_rate_12m: row.next_rate })
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
  const orgRows = await fetchOrgRows(supabase, toDateId)
  const stripeRows = await fetchStripeInfoRows(supabase)
  const backfillRows = buildUpgradeRate12mBackfillRows(rows, orgRows, stripeRows)
  const changedRows = backfillRows.filter(row => row.changed)

  console.log(`Loaded ${rows.length} global_stats rows`)
  console.log(`Loaded ${orgRows.length} org rows`)
  console.log(`Loaded ${stripeRows.length} stripe_info rows with upgraded_at`)
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
      console.log(`${row.date_id}: ${row.current_rate}% -> ${row.next_rate}% (${row.upgraded_orgs_12m}/${row.orgs})`)
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
    await updateUpgradeRate(supabase, row)
    updated++
    if (updated % 100 === 0 || updated === changedRows.length)
      console.log(`Updated ${updated}/${changedRows.length}`)
  })

  console.log(`Done. Updated ${updated}/${changedRows.length} upgrade_rate_12m rows.`)
}

if (import.meta.main)
  await main()
