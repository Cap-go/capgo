/*
 * Backfill estimated LTV metrics stored in public.global_stats.
 *
 * LTV is estimated from the customer's stored Stripe plan price and paid
 * lifetime. Plan changes before the current stored plan are not reconstructed.
 *
 * Dry run every stored global_stats row:
 *   bun run stripe:backfill-ltv-metrics
 *
 * Apply a date range:
 *   bun run stripe:backfill-ltv-metrics --apply --from=2026-04-01 --to=2026-04-30
 */
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import process from 'node:process'
import { asyncPool, createSupabaseServiceClient, DEFAULT_ENV_FILE, getArgValue, loadEnv, parsePositiveInteger } from './admin_stripe_backfill_utils.ts'

const DEFAULT_CONCURRENCY = 10
const DEFAULT_PAGE_SIZE = 1000
const DATE_ID_REGEX = /^\d{4}-\d{2}-\d{2}$/
const MONTH_MS = (365.2425 / 12) * 24 * 60 * 60 * 1000

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>
type GlobalStatsLtvRow = Pick<
  Database['public']['Tables']['global_stats']['Row'],
  'average_ltv' | 'date_id' | 'longest_ltv' | 'shortest_ltv'
>
type GlobalStatsUpdate = Database['public']['Tables']['global_stats']['Update']

export interface LtvSourcePlan {
  name: string | null
  price_m: number | null
  price_m_id: string | null
  price_y: number | null
  price_y_id: string | null
}

export interface LtvSourceRow {
  canceled_at: string | null
  created_at: string
  customer_id: string
  is_good_plan: boolean | null
  paid_at: string | null
  price_id: string | null
  status: Database['public']['Enums']['stripe_status'] | null
  subscription_anchor_end: string | null
  subscription_anchor_start: string | null
  plans: LtvSourcePlan | LtvSourcePlan[] | null
}

export interface LtvMetricValues {
  average_ltv: number
  shortest_ltv: number
  longest_ltv: number
}

export interface LtvBackfillRow extends LtvMetricValues {
  changed: boolean
  current: Partial<LtvMetricValues>
  date_id: string
}

function assertDateId(value: string, label: string) {
  if (!DATE_ID_REGEX.test(value))
    throw new Error(`${label} must use YYYY-MM-DD`)

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be a valid UTC date`)

  return value
}

function compareDateIds(left: string, right: string) {
  return left.localeCompare(right)
}

function toDate(value: string | null | undefined) {
  if (!value)
    return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toMoney(value: number) {
  return Number(value.toFixed(2))
}

function toMetricNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function getPlan(row: LtvSourceRow) {
  return Array.isArray(row.plans) ? row.plans[0] ?? null : row.plans
}

function getBillingValue(row: LtvSourceRow) {
  const plan = getPlan(row)
  if (!plan || !row.price_id)
    return null

  if (row.price_id === plan.price_y_id) {
    return {
      amount: Number(plan.price_y) || 0,
      periodMonths: 12,
    }
  }

  if (row.price_id === plan.price_m_id) {
    return {
      amount: Number(plan.price_m) || 0,
      periodMonths: 1,
    }
  }

  return null
}

function getPaidStart(row: LtvSourceRow) {
  return toDate(row.paid_at)
}

function getKnownSubscriptionEnd(row: LtvSourceRow) {
  const canceledAt = toDate(row.canceled_at)
  if (canceledAt)
    return canceledAt

  if (row.status === 'canceled' || row.status === 'deleted') {
    return toDate(row.subscription_anchor_end)
  }

  return null
}

export function estimateCustomerLtv(row: LtvSourceRow, snapshotExclusiveEnd: Date) {
  if (row.is_good_plan !== true)
    return null

  const billingValue = getBillingValue(row)
  if (!billingValue || billingValue.amount <= 0)
    return null

  const start = getPaidStart(row)
  if (!start || start.getTime() >= snapshotExclusiveEnd.getTime())
    return null

  const knownEnd = getKnownSubscriptionEnd(row)
  const effectiveEnd = knownEnd && knownEnd.getTime() < snapshotExclusiveEnd.getTime()
    ? knownEnd
    : snapshotExclusiveEnd

  if (effectiveEnd.getTime() <= start.getTime())
    return null

  const elapsedMonths = (effectiveEnd.getTime() - start.getTime()) / MONTH_MS
  const paidPeriods = Math.max(1, Math.ceil((elapsedMonths / billingValue.periodMonths) - 1e-9))
  return toMoney(billingValue.amount * paidPeriods)
}

export function calculateLtvMetrics(rows: LtvSourceRow[], dateId: string): LtvMetricValues {
  const snapshotExclusiveEnd = new Date(`${dateId}T00:00:00.000Z`)
  snapshotExclusiveEnd.setUTCDate(snapshotExclusiveEnd.getUTCDate() + 1)

  const values = rows
    .map(row => estimateCustomerLtv(row, snapshotExclusiveEnd))
    .filter((value): value is number => value !== null && value > 0)

  if (values.length === 0) {
    return {
      average_ltv: 0,
      shortest_ltv: 0,
      longest_ltv: 0,
    }
  }

  const total = values.reduce((sum, value) => sum + value, 0)

  return {
    average_ltv: toMoney(total / values.length),
    shortest_ltv: toMoney(Math.min(...values)),
    longest_ltv: toMoney(Math.max(...values)),
  }
}

export function buildLtvBackfillRows(globalStatsRows: GlobalStatsLtvRow[], ltvSourceRows: LtvSourceRow[]) {
  return globalStatsRows.map((row): LtvBackfillRow => {
    const metrics = calculateLtvMetrics(ltvSourceRows, row.date_id)
    const current = {
      average_ltv: toMetricNumber(row.average_ltv),
      shortest_ltv: toMetricNumber(row.shortest_ltv),
      longest_ltv: toMetricNumber(row.longest_ltv),
    }
    const changed = current.average_ltv !== metrics.average_ltv
      || current.shortest_ltv !== metrics.shortest_ltv
      || current.longest_ltv !== metrics.longest_ltv

    return {
      date_id: row.date_id,
      current,
      changed,
      ...metrics,
    }
  })
}

async function fetchGlobalStatsRows(supabase: SupabaseClient, fromDateId: string | null, toDateId: string | null) {
  const rows: GlobalStatsLtvRow[] = []
  let offset = 0

  while (true) {
    let query = supabase
      .from('global_stats')
      .select('date_id, average_ltv, shortest_ltv, longest_ltv')
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

async function fetchLtvSourceRows(supabase: SupabaseClient) {
  const rows: LtvSourceRow[] = []
  let lastSeenCustomerId: string | null = null

  while (true) {
    let query = supabase
      .from('stripe_info')
      .select(`
        customer_id,
        created_at,
        paid_at,
        subscription_anchor_start,
        subscription_anchor_end,
        canceled_at,
        price_id,
        status,
        is_good_plan,
        plans!stripe_info_product_id_fkey(name, price_m, price_y, price_m_id, price_y_id)
      `)
      .order('customer_id', { ascending: true })
      .limit(DEFAULT_PAGE_SIZE)

    if (lastSeenCustomerId)
      query = query.gt('customer_id', lastSeenCustomerId)

    const { data, error } = await query
    if (error)
      throw error
    if (!data?.length)
      break

    rows.push(...data as unknown as LtvSourceRow[])
    if (data.length < DEFAULT_PAGE_SIZE)
      break
    lastSeenCustomerId = data.at(-1)?.customer_id ?? null
  }

  return rows
}

function toGlobalStatsUpdate(row: LtvBackfillRow): GlobalStatsUpdate {
  return {
    average_ltv: row.average_ltv,
    shortest_ltv: row.shortest_ltv,
    longest_ltv: row.longest_ltv,
  }
}

async function updateGlobalStatsRow(supabase: SupabaseClient, row: LtvBackfillRow) {
  const { error } = await supabase
    .from('global_stats')
    .update(toGlobalStatsUpdate(row))
    .eq('date_id', row.date_id)

  if (error)
    throw error
}

function printSampleRows(rows: LtvBackfillRow[]) {
  for (const row of rows.slice(0, 10)) {
    console.log(`${row.date_id}: average=$${row.average_ltv.toFixed(2)}, shortest=$${row.shortest_ltv.toFixed(2)}, longest=$${row.longest_ltv.toFixed(2)}`)
  }
}

async function main(args = process.argv.slice(2), runtimeEnv: Record<string, string | undefined> = process.env) {
  const apply = args.includes('--apply')
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const fromDateId = getArgValue(args, '--from')
  const toDateId = getArgValue(args, '--to')
  const concurrency = parsePositiveInteger(getArgValue(args, '--concurrency'), '--concurrency', DEFAULT_CONCURRENCY)

  const from = fromDateId ? assertDateId(fromDateId, '--from') : null
  const to = toDateId ? assertDateId(toDateId, '--to') : null
  if (from && to && compareDateIds(from, to) > 0)
    throw new Error('--from must be before or equal to --to')

  const fileEnv = await loadEnv(envFile)
  const env = {
    ...fileEnv,
    ...runtimeEnv,
  }
  const supabase = createSupabaseServiceClient(env)

  console.log(`Env file: ${envFile}`)
  if (from || to)
    console.log(`Backfill range: ${from ?? 'first'}..${to ?? 'last'}`)
  else
    console.log('Backfill range: all global_stats rows')
  if (!apply)
    console.log('Dry run only. Pass --apply to update global_stats.')

  const [globalStatsRows, ltvSourceRows] = await Promise.all([
    fetchGlobalStatsRows(supabase, from, to),
    fetchLtvSourceRows(supabase),
  ])

  const rows = buildLtvBackfillRows(globalStatsRows, ltvSourceRows)
  const changedRows = rows.filter(row => row.changed)

  console.log(`Loaded ${globalStatsRows.length} global_stats rows`)
  console.log(`Loaded ${ltvSourceRows.length} stripe_info LTV source rows`)
  console.log(`Rows needing update: ${changedRows.length}`)

  if (changedRows.length > 0) {
    console.log('Sample updates:')
    printSampleRows(changedRows)
  }

  if (!apply)
    return

  let updated = 0
  await asyncPool(concurrency, changedRows, async (row) => {
    await updateGlobalStatsRow(supabase, row)
    updated++
    if (updated % 100 === 0 || updated === changedRows.length)
      console.log(`Updated ${updated}/${changedRows.length}`)
  })

  console.log(`Done. Updated ${updated}/${changedRows.length} LTV rows.`)
}

if (import.meta.main)
  await main()
