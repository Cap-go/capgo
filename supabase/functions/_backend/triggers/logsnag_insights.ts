import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database, Json } from '../utils/supabase.types.ts'

import { sql } from 'drizzle-orm'
import { Hono } from 'hono/tiny'

import { getPluginBreakdownCF, readActiveAppsCF, readLastMonthDevicesByPlatformCF, readLastMonthDevicesCF, readLastMonthUpdatesCF } from '../utils/cloudflare.ts'
import { BRES, middlewareAPISecret, quickError } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { logsnagInsights } from '../utils/logsnag.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { countAllApps, countAllUpdates, countAllUpdatesExternal, getUpdateStats } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { sendEventToTracking } from '../utils/tracking.ts'
import { backgroundTask } from '../utils/utils.ts'

interface PlanTotal { [key: string]: number }
interface BuildStats {
  total: number
  ios: number
  android: number
  last_month: number
  last_month_ios: number
  last_month_android: number
  success_total: number
  success_ios: number
  success_android: number
  total_seconds_day_ios: number
  total_seconds_day_android: number
  avg_seconds_day_ios: number
  avg_seconds_day_android: number
  build_count_day_ios: number
  build_count_day_android: number
  daily_metrics_available: boolean
}
interface DailyWindow {
  prevDayStart: Date
  prevDayEnd: Date
  prevDayDateId: string
}
interface CurrentDayWindow {
  dayStart: Date
  nextDayStart: Date
  dayDateId: string
}
interface PlanRevenue {
  mrr: number
  total_revenue: number
  revenue_solo: number
  revenue_maker: number
  revenue_team: number
  revenue_enterprise: number
  plan_solo_monthly: number
  plan_solo_yearly: number
  plan_maker_monthly: number
  plan_maker_yearly: number
  plan_team_monthly: number
  plan_team_yearly: number
  plan_enterprise_monthly: number
  plan_enterprise_yearly: number
}
interface PlanConversionRates {
  enterprise: number
  maker: number
  solo: number
  team: number
  total: number
}
interface DailyRevenueChangeSummary {
  churnMrr: number
  contractionMrr: number
  expansionMrr: number
}
interface RevenueRetentionMetrics {
  churnRevenue: number
  churnRevenueSolo: number
  churnRevenueMaker: number
  churnRevenueTeam: number
  churnRevenueEnterprise: number
  nrr: number
}
interface PaidProductActivityStats {
  builder_active_paying_clients_60d: number
  live_updates_active_paying_clients_60d: number
}
interface LtvStats {
  average_ltv: number
  shortest_ltv: number
  longest_ltv: number
}
interface BillingSnapshotCustomerCounts {
  yearly: number
  monthly: number
  total: number
}
interface BillingSnapshotCounts {
  customers: BillingSnapshotCustomerCounts
  plans: PlanTotal
  payingOrgsForConversion: number
}
interface BillingSnapshotRow {
  [key: string]: unknown
  yearly: number | string | null
  monthly: number | string | null
  total: number | string | null
  paying_orgs_for_conversion: number | string | null
  plan_name: string | null
  plan_count: number | string | null
}
interface CoreSnapshotCounts {
  onboarded: number
  needUpgrade: number
}
interface CoreSnapshotRow {
  [key: string]: unknown
  onboarded: number | string | null
  need_upgrade: number | string | null
}
interface CustomerIdRow {
  customer_id: string
}

function getDateId(targetDate = new Date()): string {
  return new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())).toISOString().slice(0, 10)
}

function calculateConversionRate(converted: number | null | undefined, totalOrgs: number) {
  if (totalOrgs <= 0)
    return 0
  return Number((((converted ?? 0) * 100) / totalOrgs).toFixed(1))
}

const GLOBAL_STATS_PLAN_KEYS = ['Trial', 'Solo', 'Maker', 'Team', 'Enterprise'] as const

function normalizePlanTotals(plans: PlanTotal): PlanTotal {
  const normalized: PlanTotal = {}

  for (const [key, value] of Object.entries(plans))
    normalized[key] = Number(value) || 0

  for (const key of GLOBAL_STATS_PLAN_KEYS)
    normalized[key] = Number(normalized[key]) || 0

  return normalized
}

function getEmptyBillingSnapshotCounts(): BillingSnapshotCounts {
  return {
    customers: { yearly: 0, monthly: 0, total: 0 },
    payingOrgsForConversion: 0,
    plans: normalizePlanTotals({}),
  }
}

function normalizeBillingSnapshotCounts(rows: BillingSnapshotRow[]): BillingSnapshotCounts {
  const firstRow = rows[0]
  if (!firstRow)
    return getEmptyBillingSnapshotCounts()

  const plans: PlanTotal = {}
  for (const row of rows) {
    if (!row.plan_name)
      continue
    plans[row.plan_name] = Number(row.plan_count) || 0
  }

  return {
    customers: {
      yearly: Number(firstRow.yearly) || 0,
      monthly: Number(firstRow.monthly) || 0,
      total: Number(firstRow.total) || 0,
    },
    payingOrgsForConversion: Number(firstRow.paying_orgs_for_conversion) || 0,
    plans: normalizePlanTotals(plans),
  }
}
function normalizeCoreSnapshotCounts(row: Partial<CoreSnapshotRow> | null | undefined): CoreSnapshotCounts {
  return {
    onboarded: Number(row?.onboarded) || 0,
    needUpgrade: Number(row?.need_upgrade) || 0,
  }
}

const LOGSNAG_INSIGHTS_BACKGROUND_MAX_RETRIES = 4
const LOGSNAG_INSIGHTS_RETRY_DELAY_SECONDS = 300
const LOGSNAG_INSIGHTS_QUEUE_NAME = 'admin_stats'
const LOGSNAG_INSIGHTS_NOTIFICATION_DELAY_SECONDS = 180
const GLOBAL_STATS_NOTIFICATION_LOCK_NAMESPACE = 'logsnag_insights_notifications'
const GLOBAL_STATS_NOTIFICATION_LOGSNAG_STEP = 'notifications_logsnag'
const GLOBAL_STATS_NOTIFICATION_TRACKING_STEP = 'notifications_tracking'
const GLOBAL_STATS_SHARDS = [
  'core',
  'usage',
  'revenue',
  'plugins',
  'builds',
  'retention',
  'paid_products',
  'ltv',
  'notifications',
] as const
const GLOBAL_STATS_COMPLETION_MARKERS = [
  ...GLOBAL_STATS_SHARDS,
  GLOBAL_STATS_NOTIFICATION_LOGSNAG_STEP,
  GLOBAL_STATS_NOTIFICATION_TRACKING_STEP,
] as const
const GLOBAL_STATS_SHARD_SET = new Set<string>(GLOBAL_STATS_SHARDS)
const GLOBAL_STATS_COMPLETION_MARKER_SET = new Set<string>(GLOBAL_STATS_COMPLETION_MARKERS)

type GlobalStatsShard = typeof GLOBAL_STATS_SHARDS[number]
type GlobalStatsCompletionMarker = typeof GLOBAL_STATS_COMPLETION_MARKERS[number]
type RequiredGlobalStatsShard = Exclude<GlobalStatsShard, 'notifications'>
const REQUIRED_GLOBAL_STATS_SHARDS = GLOBAL_STATS_SHARDS.filter((shard): shard is RequiredGlobalStatsShard => shard !== 'notifications')
type GlobalStatsUpdate = Database['public']['Tables']['global_stats']['Update']
type GlobalStatsRow = Database['public']['Tables']['global_stats']['Row']
type GlobalStatsSnapshotPatch = GlobalStatsUpdate & { orgs?: number }
type GlobalStatsSnapshotRow = GlobalStatsRow & { orgs?: number | null }

interface LogsnagInsightsPayload {
  retry_count?: unknown
  shard?: unknown
  date_id?: unknown
}

interface ScheduleLogsnagInsightsUpdateOptions {
  retryCount?: number
  retryMsgId?: number | null
  cancelRetry?: (c: Context, retryMsgId: number) => Promise<void>
}

function normalizeLogsnagInsightsRetryCount(value: unknown): number {
  const retryCount = Number(value)
  if (!Number.isFinite(retryCount) || retryCount < 0)
    return 0
  return Math.floor(retryCount)
}

function buildLogsnagInsightsRetryMessage(retryCount: number, dateId?: string) {
  return {
    function_name: 'logsnag_insights',
    function_type: 'cloudflare',
    payload: {
      ...(dateId ? { date_id: dateId } : {}),
      retry_count: retryCount,
    },
  }
}

function getLogsnagInsightsShardFunctionName(shard: GlobalStatsShard): string {
  return `logsnag_insights_${shard}`
}

function buildLogsnagInsightsShardMessage(shard: GlobalStatsShard, dateId: string) {
  return {
    function_name: getLogsnagInsightsShardFunctionName(shard),
    function_type: 'cloudflare',
    payload: {
      date_id: dateId,
    },
  }
}

async function readLogsnagInsightsPayload(c: Context): Promise<LogsnagInsightsPayload> {
  const rawBody = await c.req.raw.clone().text()
  if (!rawBody.trim())
    return {}

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  }
  catch (error) {
    quickError(400, 'invalid_logsnag_insights_payload', 'Invalid LogSnag insights payload', undefined, error, { alert: false })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body))
    return {}
  return body as LogsnagInsightsPayload
}
function normalizeLogsnagInsightsShard(value: unknown): GlobalStatsShard | null {
  if (typeof value !== 'string' || !GLOBAL_STATS_SHARD_SET.has(value))
    return null
  return value as GlobalStatsShard
}

function normalizeGlobalStatsDateId(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null

  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || getDateId(date) !== value)
    return null

  return value
}

function getCompletedDayWindowForDateId(dateId: string): DailyWindow {
  const prevDayStart = new Date(`${dateId}T00:00:00.000Z`)
  const prevDayEnd = new Date(prevDayStart.getTime() + 24 * 60 * 60 * 1000)
  return {
    prevDayStart,
    prevDayEnd,
    prevDayDateId: dateId,
  }
}

function getMetricWindowFromDailyWindow(window: DailyWindow): CurrentDayWindow {
  return {
    dayStart: window.prevDayStart,
    nextDayStart: window.prevDayEnd,
    dayDateId: window.prevDayDateId,
  }
}

async function reserveLogsnagInsightsRetry(c: Context, retryCount: number, dateId?: string): Promise<number | null> {
  if (retryCount >= LOGSNAG_INSIGHTS_BACKGROUND_MAX_RETRIES)
    return null

  const nextRetryCount = retryCount + 1
  const delaySeconds = LOGSNAG_INSIGHTS_RETRY_DELAY_SECONDS * nextRetryCount
  const retryMessage = buildLogsnagInsightsRetryMessage(nextRetryCount, dateId)
  const db = getPgClient(c)

  try {
    const retryMsgId = await queueLogsnagInsightsMessage(db, retryMessage, delaySeconds)
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Reserved logsnag insights dispatcher retry',
      retryCount: nextRetryCount,
      delaySeconds,
      retryMsgId,
      dateId,
    })
    return retryMsgId
  }
  finally {
    await closeClient(c, db)
  }
}

async function cancelLogsnagInsightsRetry(c: Context, retryMsgId: number): Promise<void> {
  const db = getPgClient(c)

  try {
    await db.query('SELECT pgmq.delete($1, $2::bigint[])', [
      LOGSNAG_INSIGHTS_QUEUE_NAME,
      [retryMsgId],
    ])
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Cancelled reserved logsnag insights dispatcher retry',
      retryMsgId,
    })
  }
  catch (cancelError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to cancel reserved logsnag insights dispatcher retry',
      retryMsgId,
      error: cancelError,
    })
    throw cancelError
  }
  finally {
    await closeClient(c, db)
  }
}

function getPaidPlanTotal(plans: PlanTotal) {
  return (plans.Solo ?? 0) + (plans.Maker ?? 0) + (plans.Team ?? 0) + (plans.Enterprise ?? 0)
}

function getPlanConversionRates(plans: PlanTotal, totalOrgs: number): PlanConversionRates {
  return {
    solo: calculateConversionRate(plans.Solo, totalOrgs),
    maker: calculateConversionRate(plans.Maker, totalOrgs),
    team: calculateConversionRate(plans.Team, totalOrgs),
    enterprise: calculateConversionRate(plans.Enterprise, totalOrgs),
    total: calculateConversionRate(getPaidPlanTotal(plans), totalOrgs),
  }
}

function getDailyWindow(referenceDate = new Date()): DailyWindow {
  const todayStartMillis = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  const prevDayStart = new Date(todayStartMillis - 24 * 60 * 60 * 1000)
  const prevDayEnd = new Date(todayStartMillis)
  return {
    prevDayStart,
    prevDayEnd,
    prevDayDateId: getDateId(prevDayStart),
  }
}
function isLatestCompletedGlobalStatsWindow(window: DailyWindow, referenceDate = new Date()): boolean {
  return window.prevDayDateId === getDailyWindow(referenceDate).prevDayDateId
}


function getCurrentDayWindow(referenceDate = new Date()): CurrentDayWindow {
  const dayStartMillis = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  const dayStart = new Date(dayStartMillis)
  const nextDayStart = new Date(dayStartMillis + 24 * 60 * 60 * 1000)
  return {
    dayStart,
    nextDayStart,
    dayDateId: getDateId(dayStart),
  }
}

function getCompletedDayWindow(referenceDate = new Date()): CurrentDayWindow {
  const { prevDayStart, prevDayEnd, prevDayDateId } = getDailyWindow(referenceDate)
  return {
    dayStart: prevDayStart,
    nextDayStart: prevDayEnd,
    dayDateId: prevDayDateId,
  }
}

function countUniqueCustomers(...rowSets: Array<Array<CustomerIdRow | null | undefined>>) {
  return new Set(
    rowSets
      .flat()
      .filter((row): row is CustomerIdRow => Boolean(row?.customer_id))
      .map(row => row.customer_id),
  ).size
}

function getPreviousDateId(dateId: string) {
  const target = new Date(`${dateId}T00:00:00.000Z`)
  target.setUTCDate(target.getUTCDate() - 1)
  return getDateId(target)
}

function calculateNrr(previousMrr: number, dailyChanges: DailyRevenueChangeSummary) {
  if (previousMrr <= 0)
    return 100

  const retainedMrr = Math.max(
    previousMrr - dailyChanges.churnMrr - dailyChanges.contractionMrr + dailyChanges.expansionMrr,
    0,
  )

  return Number(((retainedMrr / previousMrr) * 100).toFixed(2))
}

function calculateChurnRevenue(dailyChanges: DailyRevenueChangeSummary) {
  return Number((dailyChanges.churnMrr + dailyChanges.contractionMrr).toFixed(2))
}

function isMissingBuildMetricColumnError(error: unknown): boolean {
  const errorCode = String((error as any)?.code ?? '').toUpperCase()
  const message = String((error as any)?.message ?? '').toLowerCase()
  return errorCode === 'PGRST204'
    || errorCode === '42703'
    || message.includes('build_total_seconds_day')
    || message.includes('build_avg_seconds_day')
    || message.includes('build_count_day')
}

async function calculateRevenue(c: Context, referenceDate?: Date): Promise<PlanRevenue> {
  const supabase = supabaseAdmin(c)

  try {
    // Get plan prices from database
    const { data: plansData, error: plansError } = await supabase
      .from('plans')
      .select('name, price_m, price_y, price_m_id, price_y_id')
      .in('name', ['Solo', 'Maker', 'Team', 'Enterprise'])

    if (plansError || !plansData) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to fetch plan prices', error: plansError })
      return {
        mrr: 0,
        total_revenue: 0,
        revenue_solo: 0,
        revenue_maker: 0,
        revenue_team: 0,
        revenue_enterprise: 0,
        plan_solo_monthly: 0,
        plan_solo_yearly: 0,
        plan_maker_monthly: 0,
        plan_maker_yearly: 0,
        plan_team_monthly: 0,
        plan_team_yearly: 0,
        plan_enterprise_monthly: 0,
        plan_enterprise_yearly: 0,
      }
    }

    // Build price map
    const priceMap = new Map<string, { price_m: number, price_y: number, price_m_id: string, price_y_id: string }>()
    for (const plan of plansData) {
      const price_m = Number(plan.price_m) || 0
      const price_y = Number(plan.price_y) || 0
      priceMap.set(plan.name.toLowerCase(), {
        price_m, // Already in dollars
        price_y, // Already in dollars
        price_m_id: plan.price_m_id || '',
        price_y_id: plan.price_y_id || '',
      })
      cloudlog({ requestId: c.get('requestId'), message: `Plan ${plan.name}: monthly=$${price_m}, yearly=$${price_y}` })
    }

    // Get subscription counts from stripe_info. Replays use the snapshot end to avoid counting subscriptions created after the target date.
    let subsQuery = supabase
      .from('stripe_info')
      .select('price_id')
      .eq('is_good_plan', true)

    if (referenceDate) {
      const snapshotEndIso = referenceDate.toISOString()
      subsQuery = subsQuery
        .lt('created_at', snapshotEndIso)
        .or(`paid_at.lt.${snapshotEndIso},paid_at.is.null`)
        .in('status', ['succeeded', 'canceled', 'deleted'])
        .or(`canceled_at.is.null,canceled_at.gte.${snapshotEndIso}`)
        .gt('subscription_anchor_end', snapshotEndIso)
    }
    else {
      subsQuery = subsQuery.eq('status', 'succeeded')
    }

    const { data: subsData, error: subsError } = await subsQuery
    if (subsError || !subsData) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to fetch subscriptions', error: subsError })
      return {
        mrr: 0,
        total_revenue: 0,
        revenue_solo: 0,
        revenue_maker: 0,
        revenue_team: 0,
        revenue_enterprise: 0,
        plan_solo_monthly: 0,
        plan_solo_yearly: 0,
        plan_maker_monthly: 0,
        plan_maker_yearly: 0,
        plan_team_monthly: 0,
        plan_team_yearly: 0,
        plan_enterprise_monthly: 0,
        plan_enterprise_yearly: 0,
      }
    }

    // Count subscriptions by plan and billing period
    const subCountMap = new Map<string, { monthly: number, yearly: number }>()
    const priceToPlan = new Map<string, { planName: string, billing: 'monthly' | 'yearly' }>()
    for (const [planName, planPrices] of priceMap) {
      if (planPrices.price_m_id)
        priceToPlan.set(planPrices.price_m_id, { planName, billing: 'monthly' })
      if (planPrices.price_y_id)
        priceToPlan.set(planPrices.price_y_id, { planName, billing: 'yearly' })
    }

    for (const sub of subsData) {
      const priceId = sub.price_id
      if (!priceId)
        continue

      const plan = priceToPlan.get(priceId)
      if (!plan)
        continue

      if (!subCountMap.has(plan.planName))
        subCountMap.set(plan.planName, { monthly: 0, yearly: 0 })

      subCountMap.get(plan.planName)![plan.billing]++
    }

    // Calculate MRR and ARR
    const solo = subCountMap.get('solo') || { monthly: 0, yearly: 0 }
    const maker = subCountMap.get('maker') || { monthly: 0, yearly: 0 }
    const team = subCountMap.get('team') || { monthly: 0, yearly: 0 }
    const enterprise = subCountMap.get('enterprise') || { monthly: 0, yearly: 0 }

    const soloPrices = priceMap.get('solo') || { price_m: 0, price_y: 0, price_m_id: '', price_y_id: '' }
    const makerPrices = priceMap.get('maker') || { price_m: 0, price_y: 0, price_m_id: '', price_y_id: '' }
    const teamPrices = priceMap.get('team') || { price_m: 0, price_y: 0, price_m_id: '', price_y_id: '' }
    const enterprisePrices = priceMap.get('enterprise') || { price_m: 0, price_y: 0, price_m_id: '', price_y_id: '' }

    // MRR = (monthly subs × monthly price) + (yearly subs × yearly price / 12)
    const soloMRR = (solo.monthly * soloPrices.price_m) + (solo.yearly * soloPrices.price_y / 12)
    const makerMRR = (maker.monthly * makerPrices.price_m) + (maker.yearly * makerPrices.price_y / 12)
    const teamMRR = (team.monthly * teamPrices.price_m) + (team.yearly * teamPrices.price_y / 12)
    const enterpriseMRR = (enterprise.monthly * enterprisePrices.price_m) + (enterprise.yearly * enterprisePrices.price_y / 12)
    const totalMRR = soloMRR + makerMRR + teamMRR + enterpriseMRR

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Revenue calculation',
      solo: { monthly: solo.monthly, yearly: solo.yearly, mrr: soloMRR, prices: soloPrices },
      maker: { monthly: maker.monthly, yearly: maker.yearly, mrr: makerMRR, prices: makerPrices },
      team: { monthly: team.monthly, yearly: team.yearly, mrr: teamMRR, prices: teamPrices },
      enterprise: { monthly: enterprise.monthly, yearly: enterprise.yearly, mrr: enterpriseMRR, prices: enterprisePrices },
      totalMRR,
    })

    // ARR = MRR × 12
    const soloARR = soloMRR * 12
    const makerARR = makerMRR * 12
    const teamARR = teamMRR * 12
    const enterpriseARR = enterpriseMRR * 12
    const totalARR = totalMRR * 12

    return {
      mrr: totalMRR,
      total_revenue: totalARR,
      revenue_solo: soloARR,
      revenue_maker: makerARR,
      revenue_team: teamARR,
      revenue_enterprise: enterpriseARR,
      plan_solo_monthly: solo.monthly,
      plan_solo_yearly: solo.yearly,
      plan_maker_monthly: maker.monthly,
      plan_maker_yearly: maker.yearly,
      plan_team_monthly: team.monthly,
      plan_team_yearly: team.yearly,
      plan_enterprise_monthly: enterprise.monthly,
      plan_enterprise_yearly: enterprise.yearly,
    }
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'calculateRevenue error', error: e })
    return {
      mrr: 0,
      total_revenue: 0,
      revenue_solo: 0,
      revenue_maker: 0,
      revenue_team: 0,
      revenue_enterprise: 0,
      plan_solo_monthly: 0,
      plan_solo_yearly: 0,
      plan_maker_monthly: 0,
      plan_maker_yearly: 0,
      plan_team_monthly: 0,
      plan_team_yearly: 0,
      plan_enterprise_monthly: 0,
      plan_enterprise_yearly: 0,
    }
  }
}

async function getGithubStars(): Promise<number> {
  try {
    const response = await fetch('https://api.github.com/repos/Cap-go/capacitor-updater', {
      headers: {
        'User-Agent': 'capgo-app', // GitHub API rate limit
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: HTTP ${response.status}`)
    }

    const json = await response.json() as { stargazers_count: number }
    return json.stargazers_count
  }
  catch (e) {
    throw new Error(`getGithubStars error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function getBuildStats(c: Context, window?: DailyWindow): Promise<BuildStats> {
  const supabase = supabaseAdmin(c)
  const { prevDayStart, prevDayEnd } = window ?? getDailyWindow()
  const last30daysStart = new Date(prevDayEnd.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const last30daysEnd = prevDayEnd.toISOString()

  try {
    // Run all count queries in parallel for better performance
    const [
      totalResult,
      iosResult,
      androidResult,
      lastMonthTotalResult,
      lastMonthIosResult,
      lastMonthAndroidResult,
      successTotalResult,
      successIosResult,
      successAndroidResult,
      dailyBuildStats,
    ] = await Promise.all([
      // Count total builds (all time)
      supabase.from('build_logs').select('*', { count: 'exact', head: true }),
      // Count iOS builds (all time)
      supabase.from('build_logs').select('*', { count: 'exact', head: true }).eq('platform', 'ios'),
      // Count Android builds (all time)
      supabase.from('build_logs').select('*', { count: 'exact', head: true }).eq('platform', 'android'),
      // Count total builds (last 30 days)
      supabase.from('build_logs').select('*', { count: 'exact', head: true }).gte('created_at', last30daysStart).lt('created_at', last30daysEnd),
      // Count iOS builds (last 30 days)
      supabase.from('build_logs').select('*', { count: 'exact', head: true }).eq('platform', 'ios').gte('created_at', last30daysStart).lt('created_at', last30daysEnd),
      // Count Android builds (last 30 days)
      supabase.from('build_logs').select('*', { count: 'exact', head: true }).eq('platform', 'android').gte('created_at', last30daysStart).lt('created_at', last30daysEnd),
      // Count successful builds (all time)
      supabase.from('build_requests').select('*', { count: 'exact', head: true }).eq('status', 'succeeded'),
      // Count successful iOS builds (all time)
      supabase.from('build_requests').select('*', { count: 'exact', head: true }).eq('platform', 'ios').eq('status', 'succeeded'),
      // Count successful Android builds (all time)
      supabase.from('build_requests').select('*', { count: 'exact', head: true }).eq('platform', 'android').eq('status', 'succeeded'),
      aggregateDailyBuildStats(c, prevDayStart, prevDayEnd),
    ])

    // Log any errors
    if (totalResult.error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats total error', error: totalResult.error })
    if (iosResult.error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats iOS error', error: iosResult.error })
    if (androidResult.error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats Android error', error: androidResult.error })
    if (lastMonthTotalResult.error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats lastMonthTotal error', error: lastMonthTotalResult.error })
    if (lastMonthIosResult.error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats lastMonthIos error', error: lastMonthIosResult.error })
    if (lastMonthAndroidResult.error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats lastMonthAndroid error', error: lastMonthAndroidResult.error })
    if (successTotalResult.error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats successTotal error', error: successTotalResult.error })
    if (successIosResult.error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats successIos error', error: successIosResult.error })
    if (successAndroidResult.error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats successAndroid error', error: successAndroidResult.error })

    return {
      total: totalResult.count ?? 0,
      ios: iosResult.count ?? 0,
      android: androidResult.count ?? 0,
      last_month: lastMonthTotalResult.count ?? 0,
      last_month_ios: lastMonthIosResult.count ?? 0,
      last_month_android: lastMonthAndroidResult.count ?? 0,
      success_total: successTotalResult.count ?? 0,
      success_ios: successIosResult.count ?? 0,
      success_android: successAndroidResult.count ?? 0,
      total_seconds_day_ios: dailyBuildStats?.totalSeconds.ios ?? 0,
      total_seconds_day_android: dailyBuildStats?.totalSeconds.android ?? 0,
      avg_seconds_day_ios: dailyBuildStats?.avgSeconds.ios ?? 0,
      avg_seconds_day_android: dailyBuildStats?.avgSeconds.android ?? 0,
      build_count_day_ios: dailyBuildStats?.counts.ios ?? 0,
      build_count_day_android: dailyBuildStats?.counts.android ?? 0,
      daily_metrics_available: dailyBuildStats !== null,
    }
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getBuildStats error', error: e })
    return {
      total: 0,
      ios: 0,
      android: 0,
      last_month: 0,
      last_month_ios: 0,
      last_month_android: 0,
      success_total: 0,
      success_ios: 0,
      success_android: 0,
      total_seconds_day_ios: 0,
      total_seconds_day_android: 0,
      avg_seconds_day_ios: 0,
      avg_seconds_day_android: 0,
      build_count_day_ios: 0,
      build_count_day_android: 0,
      daily_metrics_available: false,
    }
  }
}

async function getPaidProductActivityStats(c: Context, window: CurrentDayWindow): Promise<PaidProductActivityStats> {
  const pgClient = getPgClient(c, false)
  const drizzleClient = getDrizzleClient(pgClient)
  const dayStart = window.dayStart
  const nextDayStart = window.nextDayStart
  const snapshotEndIso = nextDayStart.toISOString()
  const lookbackStart = new Date(dayStart.getTime() - 59 * 24 * 60 * 60 * 1000)
  const dayDateId = getDateId(dayStart)
  const lookbackDateId = getDateId(lookbackStart)

  try {
    const result = await drizzleClient.execute(sql`
      WITH paying_orgs AS (
        SELECT DISTINCT
          o.id AS org_id,
          o.customer_id
        FROM public.orgs o
        INNER JOIN public.stripe_info si ON si.customer_id = o.customer_id
        WHERE o.customer_id IS NOT NULL
          AND si.is_good_plan = true
          AND COALESCE(si.paid_at, si.subscription_anchor_start, si.created_at, o.created_at) < ${snapshotEndIso}::timestamptz
          AND si.status IN (
            'succeeded'::public.stripe_status,
            'canceled'::public.stripe_status,
            'deleted'::public.stripe_status
          )
          AND (si.canceled_at IS NULL OR si.canceled_at >= ${snapshotEndIso}::timestamptz)
          AND si.subscription_anchor_end > ${snapshotEndIso}::timestamptz
      ),
      builder_clients AS (
        SELECT DISTINCT po.customer_id
        FROM paying_orgs po
        INNER JOIN public.apps a ON a.owner_org = po.org_id
        INNER JOIN public.daily_build_time dbt ON dbt.app_id = a.app_id
        WHERE dbt.date >= ${lookbackDateId}::date
          AND dbt.date <= ${dayDateId}::date
          AND dbt.build_count > 0
      ),
      live_updates_clients AS (
        SELECT DISTINCT po.customer_id
        FROM paying_orgs po
        INNER JOIN public.apps a ON a.owner_org = po.org_id
        INNER JOIN public.daily_version dv ON dv.app_id = a.app_id
        WHERE dv.date >= ${lookbackDateId}::date
          AND dv.date <= ${dayDateId}::date
          AND (
            COALESCE(dv.get, 0) > 0
            OR COALESCE(dv.install, 0) > 0
            OR COALESCE(dv.fail, 0) > 0
            OR COALESCE(dv.uninstall, 0) > 0
          )
      )
      SELECT
        (SELECT COUNT(*) FROM builder_clients)::int AS builder_active_paying_clients_60d,
        (SELECT COUNT(*) FROM live_updates_clients)::int AS live_updates_active_paying_clients_60d
    `)

    const row = result.rows[0] as Partial<PaidProductActivityStats> | undefined
    return {
      builder_active_paying_clients_60d: Number(row?.builder_active_paying_clients_60d) || 0,
      live_updates_active_paying_clients_60d: Number(row?.live_updates_active_paying_clients_60d) || 0,
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getPaidProductActivityStats error', error })
    return {
      builder_active_paying_clients_60d: 0,
      live_updates_active_paying_clients_60d: 0,
    }
  }
  finally {
    closeClient(c, pgClient)
  }
}

async function getLtvStats(c: Context, window: CurrentDayWindow): Promise<LtvStats> {
  const pgClient = getPgClient(c, false)
  const drizzleClient = getDrizzleClient(pgClient)
  const snapshotExclusiveEnd = window.nextDayStart.toISOString()
  const monthSeconds = (365.2425 / 12) * 24 * 60 * 60

  try {
    const result = await drizzleClient.execute(sql`
      WITH source AS (
        SELECT
          CASE
            WHEN si.price_id = p.price_y_id THEN p.price_y::double precision
            WHEN si.price_id = p.price_m_id THEN p.price_m::double precision
            ELSE 0::double precision
          END AS amount,
          CASE
            WHEN si.price_id = p.price_y_id THEN 12::double precision
            WHEN si.price_id = p.price_m_id THEN 1::double precision
            ELSE NULL::double precision
          END AS period_months,
          si.paid_at AS paid_start,
          COALESCE(
            si.canceled_at,
            CASE
              WHEN si.status IN ('canceled', 'deleted') THEN si.subscription_anchor_end
              ELSE NULL
            END
          ) AS known_end
        FROM public.stripe_info si
        INNER JOIN public.plans p ON p.stripe_id = si.product_id
        WHERE si.is_good_plan = true
          AND si.paid_at IS NOT NULL
      ),
      ltv_values AS (
        SELECT
          amount
            * GREATEST(
              1::double precision,
              CEIL(
                (
                  EXTRACT(EPOCH FROM (
                    LEAST(COALESCE(known_end, ${snapshotExclusiveEnd}::timestamptz), ${snapshotExclusiveEnd}::timestamptz)
                    - paid_start
                  ))
                  / (${monthSeconds}::double precision * period_months)
                ) - 0.000000001
              )
            ) AS ltv
        FROM source
        WHERE amount > 0
          AND period_months IS NOT NULL
          AND paid_start < ${snapshotExclusiveEnd}::timestamptz
          AND LEAST(COALESCE(known_end, ${snapshotExclusiveEnd}::timestamptz), ${snapshotExclusiveEnd}::timestamptz) > paid_start
      )
      SELECT
        COALESCE(ROUND(AVG(ltv)::numeric, 2), 0)::double precision AS average_ltv,
        COALESCE(ROUND(MIN(ltv)::numeric, 2), 0)::double precision AS shortest_ltv,
        COALESCE(ROUND(MAX(ltv)::numeric, 2), 0)::double precision AS longest_ltv
      FROM ltv_values
    `)

    const row = result.rows[0] as Partial<LtvStats> | undefined
    return {
      average_ltv: Number(row?.average_ltv) || 0,
      shortest_ltv: Number(row?.shortest_ltv) || 0,
      longest_ltv: Number(row?.longest_ltv) || 0,
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'ltv stats error', error })
    return {
      average_ltv: 0,
      shortest_ltv: 0,
      longest_ltv: 0,
    }
  }
  finally {
    closeClient(c, pgClient)
  }
}

async function getRevenueRetentionMetrics(c: Context, dateId: string): Promise<RevenueRetentionMetrics> {
  const pgClient = getPgClient(c, false)
  const drizzleClient = getDrizzleClient(pgClient)
  const previousDateId = getPreviousDateId(dateId)

  try {
    const result = await drizzleClient.execute<{
      retained_churn_mrr: number
      retained_contraction_mrr: number
      retained_expansion_mrr: number
      total_churn_mrr: number
      total_contraction_mrr: number
      churn_revenue_solo: number
      churn_revenue_maker: number
      churn_revenue_team: number
      churn_revenue_enterprise: number
      previous_mrr: number
    }>(sql`
      WITH daily AS (
        SELECT
          COALESCE(SUM(CASE WHEN opening_mrr > 0 THEN churn_mrr ELSE 0 END), 0)::float AS retained_churn_mrr,
          COALESCE(SUM(CASE WHEN opening_mrr > 0 THEN contraction_mrr ELSE 0 END), 0)::float AS retained_contraction_mrr,
          COALESCE(SUM(CASE WHEN opening_mrr > 0 THEN expansion_mrr ELSE 0 END), 0)::float AS retained_expansion_mrr,
          COALESCE(SUM(churn_mrr), 0)::float AS total_churn_mrr,
          COALESCE(SUM(contraction_mrr), 0)::float AS total_contraction_mrr,
          COALESCE(SUM(
            COALESCE(NULLIF(to_jsonb(drm) ->> 'churn_mrr_solo', '')::float, 0)
            + COALESCE(NULLIF(to_jsonb(drm) ->> 'contraction_mrr_solo', '')::float, 0)
          ), 0)::float AS churn_revenue_solo,
          COALESCE(SUM(
            COALESCE(NULLIF(to_jsonb(drm) ->> 'churn_mrr_maker', '')::float, 0)
            + COALESCE(NULLIF(to_jsonb(drm) ->> 'contraction_mrr_maker', '')::float, 0)
          ), 0)::float AS churn_revenue_maker,
          COALESCE(SUM(
            COALESCE(NULLIF(to_jsonb(drm) ->> 'churn_mrr_team', '')::float, 0)
            + COALESCE(NULLIF(to_jsonb(drm) ->> 'contraction_mrr_team', '')::float, 0)
          ), 0)::float AS churn_revenue_team,
          COALESCE(SUM(
            COALESCE(NULLIF(to_jsonb(drm) ->> 'churn_mrr_enterprise', '')::float, 0)
            + COALESCE(NULLIF(to_jsonb(drm) ->> 'contraction_mrr_enterprise', '')::float, 0)
          ), 0)::float AS churn_revenue_enterprise
        FROM public.daily_revenue_metrics drm
        WHERE date_id = ${dateId}
      ),
      previous_snapshot AS (
        SELECT COALESCE(mrr, 0)::float AS previous_mrr
        FROM public.global_stats
        WHERE date_id = ${previousDateId}
        LIMIT 1
      )
      SELECT
        daily.retained_churn_mrr,
        daily.retained_contraction_mrr,
        daily.retained_expansion_mrr,
        daily.total_churn_mrr,
        daily.total_contraction_mrr,
        daily.churn_revenue_solo,
        daily.churn_revenue_maker,
        daily.churn_revenue_team,
        daily.churn_revenue_enterprise,
        COALESCE(previous_snapshot.previous_mrr, 0)::float AS previous_mrr
      FROM daily
      LEFT JOIN previous_snapshot ON true
    `)

    const row = result.rows[0]
    const retainedChanges = {
      churnMrr: Number(row?.retained_churn_mrr) || 0,
      contractionMrr: Number(row?.retained_contraction_mrr) || 0,
      expansionMrr: Number(row?.retained_expansion_mrr) || 0,
    }
    const totalLostRevenue = {
      churnMrr: Number(row?.total_churn_mrr) || 0,
      contractionMrr: Number(row?.total_contraction_mrr) || 0,
      expansionMrr: 0,
    }
    const previousMrr = Number(row?.previous_mrr) || 0

    return {
      churnRevenue: calculateChurnRevenue(totalLostRevenue),
      churnRevenueSolo: Number((Number(row?.churn_revenue_solo) || 0).toFixed(2)),
      churnRevenueMaker: Number((Number(row?.churn_revenue_maker) || 0).toFixed(2)),
      churnRevenueTeam: Number((Number(row?.churn_revenue_team) || 0).toFixed(2)),
      churnRevenueEnterprise: Number((Number(row?.churn_revenue_enterprise) || 0).toFixed(2)),
      nrr: calculateNrr(previousMrr, retainedChanges),
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getRevenueRetentionMetrics error', error })
    throw error
  }
  finally {
    closeClient(c, pgClient)
  }
}

async function aggregateDailyBuildStats(
  c: Context,
  start: Date,
  end: Date,
): Promise<{
  totalSeconds: Record<'ios' | 'android', number>
  avgSeconds: Record<'ios' | 'android', number>
  counts: Record<'ios' | 'android', number>
} | null> {
  // Read from primary so the daily rollup is not permanently undercounted by replica lag.
  const pgClient = getPgClient(c, false)
  const drizzleClient = getDrizzleClient(pgClient)
  const totalSecondsByPlatform: Record<'ios' | 'android', number> = { ios: 0, android: 0 }
  const avgSecondsByPlatform: Record<'ios' | 'android', number> = { ios: 0, android: 0 }
  const countsByPlatform: Record<'ios' | 'android', number> = { ios: 0, android: 0 }

  try {
    const query = sql`
      SELECT
        platform,
        SUM(build_time_unit)::bigint AS total_seconds,
        COALESCE(ROUND(AVG(build_time_unit)::numeric, 1), 0)::float AS avg_seconds,
        COUNT(*)::int AS total_builds
      FROM build_logs
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND platform IN ('ios', 'android')
      GROUP BY platform
    `
    const result = await drizzleClient.execute<{ platform: string, total_seconds: number, avg_seconds: number, total_builds: number }>(query)
    for (const row of result.rows ?? []) {
      if (row.platform === 'ios' || row.platform === 'android') {
        totalSecondsByPlatform[row.platform] = Number(row.total_seconds) || 0
        avgSecondsByPlatform[row.platform] = Number(row.avg_seconds) || 0
        countsByPlatform[row.platform] = Number(row.total_builds) || 0
      }
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'aggregateDailyBuildStats error', error })
    return null
  }
  finally {
    closeClient(c, pgClient)
  }

  return { totalSeconds: totalSecondsByPlatform, avgSeconds: avgSecondsByPlatform, counts: countsByPlatform }
}

async function countDemoSeededApps(c: Context, createdAfterIso: string, createdBeforeIso: string): Promise<number> {
  const pgClient = getPgClient(c, false)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    const result = await drizzleClient.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM public.apps AS apps
      WHERE apps.created_at >= ${new Date(createdAfterIso)}
        AND apps.created_at < ${new Date(createdBeforeIso)}
        AND EXISTS (
          SELECT 1
          FROM public.app_versions AS app_versions
          INNER JOIN public.manifest AS manifest
            ON manifest.app_version_id = app_versions.id
          WHERE app_versions.app_id = apps.app_id
            AND app_versions.owner_org = apps.owner_org
            AND manifest.s3_path LIKE ('demo/' || apps.app_id || '/%')
        )
    `)

    return Number(result.rows[0]?.count) || 0
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'countDemoSeededApps error', error })
    return 0
  }
  finally {
    closeClient(c, pgClient)
  }
}

async function ensureGlobalStatsSnapshotRow(c: Context, dateId: string): Promise<void> {
  const db = getPgClient(c)

  try {
    await db.query(
      'INSERT INTO public.global_stats (date_id, apps, updates, stars) VALUES ($1, 0, 0, 0) ON CONFLICT (date_id) DO NOTHING',
      [dateId],
    )
  }
  finally {
    await closeClient(c, db)
  }
}

async function resetGlobalStatsCompletedShards(c: Context, dateId: string): Promise<void> {
  const db = getPgClient(c)

  try {
    const result = await db.query(
      `UPDATE public.global_stats
      SET completed_shards = '[]'::jsonb
      WHERE date_id = $1`,
      [dateId],
    )
    if (result.rowCount !== 1)
      throw new Error(`Expected one global_stats row for ${dateId}, reset ${result.rowCount ?? 0}`)
  }
  finally {
    await closeClient(c, db)
  }
}

async function updateGlobalStatsSnapshot(c: Context, dateId: string, patch: GlobalStatsSnapshotPatch): Promise<void> {
  await ensureGlobalStatsSnapshotRow(c, dateId)

  const { orgs, ...globalStatsPatch } = patch
  const { error } = await supabaseAdmin(c)
    .from('global_stats')
    .update(globalStatsPatch as GlobalStatsUpdate)
    .eq('date_id', dateId)

  if (error)
    throw error

  if (orgs !== undefined)
    await updateGlobalStatsSnapshotOrgCount(c, dateId, orgs)
}

async function updateGlobalStatsSnapshotOrgCount(c: Context, dateId: string, orgs: number): Promise<void> {
  const db = getPgClient(c)

  try {
    const result = await db.query(
      `UPDATE public.global_stats
      SET orgs = $2
      WHERE date_id = $1`,
      [dateId, orgs],
    )
    if (result.rowCount !== 1)
      throw new Error(`Expected one global_stats row for ${dateId}, updated orgs on ${result.rowCount ?? 0}`)
  }
  finally {
    await closeClient(c, db)
  }
}

function normalizeCompletedGlobalStatsShards(value: unknown): Set<GlobalStatsCompletionMarker> {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    }
    catch {
      parsed = []
    }
  }

  if (!Array.isArray(parsed))
    return new Set()

  return new Set(parsed.filter((shard): shard is GlobalStatsCompletionMarker => typeof shard === 'string' && GLOBAL_STATS_COMPLETION_MARKER_SET.has(shard)))
}

function getMissingGlobalStatsRequiredShards(completedShards: ReadonlySet<GlobalStatsCompletionMarker>): RequiredGlobalStatsShard[] {
  return REQUIRED_GLOBAL_STATS_SHARDS.filter(shard => !completedShards.has(shard))
}

function getMissingGlobalStatsShards(completedShards: ReadonlySet<GlobalStatsCompletionMarker>): GlobalStatsShard[] {
  return GLOBAL_STATS_SHARDS.filter(shard => !completedShards.has(shard))
}

function hasCompletedGlobalStatsNotifications(completedShards: ReadonlySet<GlobalStatsCompletionMarker>): boolean {
  return completedShards.has('notifications')
}

async function readCompletedGlobalStatsShards(c: Context, dateId: string): Promise<Set<GlobalStatsCompletionMarker>> {
  const db = getPgClient(c)

  try {
    const result = await db.query<{ completed_shards: unknown }>(
      'SELECT completed_shards FROM public.global_stats WHERE date_id = $1',
      [dateId],
    )
    const completedShards = result.rows[0]?.completed_shards
    return normalizeCompletedGlobalStatsShards(completedShards)
  }
  catch (error) {
    quickError(503, 'global_stats_snapshot_not_ready', 'Global stats snapshot shard state is not ready', { dateId }, error, { alert: false })
  }
  finally {
    await closeClient(c, db)
  }
}

async function claimGlobalStatsNotificationDelivery(c: Context, dateId: string): Promise<ReturnType<typeof getPgClient> | null> {
  const db = getPgClient(c)

  try {
    const result = await db.query<{ claimed: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS claimed',
      [GLOBAL_STATS_NOTIFICATION_LOCK_NAMESPACE, dateId],
    )
    if (result.rows[0]?.claimed === true)
      return db

    await closeClient(c, db)
    return null
  }
  catch (error) {
    await closeClient(c, db)
    quickError(503, 'global_stats_notification_claim_failed', 'Global stats notification delivery claim failed', { dateId }, error, { alert: false })
  }
}

async function releaseGlobalStatsNotificationDeliveryClaim(c: Context, db: ReturnType<typeof getPgClient>, dateId: string): Promise<void> {
  try {
    await db.query('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))', [GLOBAL_STATS_NOTIFICATION_LOCK_NAMESPACE, dateId])
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to release global stats notification claim', dateId, error })
  }
  finally {
    await closeClient(c, db)
  }
}

async function shouldSkipCompletedLogsnagInsightsRetryDispatch(c: Context, dateId: string, retryCount: number): Promise<boolean> {
  if (retryCount <= 0)
    return false

  const completedShards = await readCompletedGlobalStatsShards(c, dateId)
  const missingRequiredShards = getMissingGlobalStatsRequiredShards(completedShards)
  if (missingRequiredShards.length > 0)
    return false

  if (!completedShards.has('notifications')) {
    const queued = await queueLogsnagInsightsShard(c, 'notifications', dateId)
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Queued missing logsnag insights notification shard for completed retry',
      dateId,
      retryCount,
      queued,
      completedShards: Array.from(completedShards).sort((a, b) => a.localeCompare(b)),
    })
    return true
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Skipping completed logsnag insights retry dispatch',
    dateId,
    retryCount,
    completedShards: Array.from(completedShards).sort((a, b) => a.localeCompare(b)),
  })
  return true
}

async function markGlobalStatsShardComplete(c: Context, dateId: string, shard: GlobalStatsCompletionMarker): Promise<void> {
  const db = getPgClient(c)

  try {
    const result = await db.query(
      `UPDATE public.global_stats
      SET completed_shards = (
        SELECT COALESCE(jsonb_agg(shard_name ORDER BY shard_name), '[]'::jsonb)
        FROM (
          SELECT DISTINCT shard_name
          FROM (
            SELECT jsonb_array_elements_text(completed_shards) AS shard_name
            UNION ALL
            SELECT $2::text AS shard_name
          ) shards
        ) deduped
      )
      WHERE date_id = $1`,
      [dateId, shard],
    )
    if (result.rowCount !== 1)
      throw new Error(`Expected one global_stats row for ${dateId}, updated ${result.rowCount ?? 0}`)
  }
  finally {
    await closeClient(c, db)
  }
}

function getLogsnagInsightsShardDelaySeconds(shard: GlobalStatsShard): number {
  return shard === 'notifications' ? LOGSNAG_INSIGHTS_NOTIFICATION_DELAY_SECONDS : 0
}

async function queueLogsnagInsightsMessage(
  db: ReturnType<typeof getPgClient>,
  message: ReturnType<typeof buildLogsnagInsightsRetryMessage> | ReturnType<typeof buildLogsnagInsightsShardMessage>,
  delaySeconds: number,
): Promise<number> {
  const result = await db.query<{ msg_id: number | string }>('SELECT pgmq.send($1, $2::jsonb, $3) AS msg_id', [
    LOGSNAG_INSIGHTS_QUEUE_NAME,
    JSON.stringify(message),
    delaySeconds,
  ])
  const msgId = Number(result.rows[0]?.msg_id)
  if (!Number.isSafeInteger(msgId))
    throw new Error('pgmq.send did not return a message id')
  return msgId
}

async function queueLogsnagInsightsShard(c: Context, shard: GlobalStatsShard, dateId: string): Promise<{ shard: GlobalStatsShard, msgId: number, delaySeconds: number }> {
  const db = getPgClient(c)

  try {
    const delaySeconds = getLogsnagInsightsShardDelaySeconds(shard)
    const msgId = await queueLogsnagInsightsMessage(db, buildLogsnagInsightsShardMessage(shard, dateId), delaySeconds)
    return { shard, msgId, delaySeconds }
  }
  finally {
    await closeClient(c, db)
  }
}

async function dispatchLogsnagInsightsShards(c: Context, dateId: string): Promise<void> {
  await ensureGlobalStatsSnapshotRow(c, dateId)
  await resetGlobalStatsCompletedShards(c, dateId)
  const db = getPgClient(c)
  const queued: Array<{ shard: GlobalStatsShard, msgId: number, delaySeconds: number }> = []

  try {
    for (const shard of GLOBAL_STATS_SHARDS) {
      const delaySeconds = getLogsnagInsightsShardDelaySeconds(shard)
      const msgId = await queueLogsnagInsightsMessage(db, buildLogsnagInsightsShardMessage(shard, dateId), delaySeconds)
      queued.push({ shard, msgId, delaySeconds })
    }
  }
  finally {
    await closeClient(c, db)
  }

  cloudlog({ requestId: c.get('requestId'), message: 'Queued logsnag insights global stats shards', dateId, queued })
}
async function getBillingSnapshotCounts(c: Context, snapshotExclusiveEnd: Date): Promise<BillingSnapshotCounts> {
  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)
  const snapshotExclusiveEndIso = snapshotExclusiveEnd.toISOString()

  try {
    // stripe_info stores current rows, so historical replays derive snapshot state from lifecycle timestamps.
    const result = await drizzleClient.execute<BillingSnapshotRow>(sql`
      WITH active_subscriptions AS (
        SELECT DISTINCT ON (si.customer_id)
          si.customer_id,
          si.price_id,
          p.name::character varying AS plan_name
        FROM public.stripe_info si
        INNER JOIN public.plans p ON p.stripe_id = si.product_id
        WHERE si.is_good_plan = true
          AND si.created_at < ${snapshotExclusiveEndIso}::timestamptz
          AND (si.paid_at < ${snapshotExclusiveEndIso}::timestamptz OR si.paid_at IS NULL)
          AND si.status IN (
            'succeeded'::public.stripe_status,
            'canceled'::public.stripe_status,
            'deleted'::public.stripe_status
          )
          AND (si.canceled_at IS NULL OR si.canceled_at >= ${snapshotExclusiveEndIso}::timestamptz)
          AND si.subscription_anchor_end > ${snapshotExclusiveEndIso}::timestamptz
        ORDER BY si.customer_id, si.created_at DESC
      ),
      trial_users AS (
        SELECT DISTINCT ON (si.customer_id)
          'Trial'::character varying AS plan_name,
          si.customer_id
        FROM public.stripe_info si
        WHERE si.created_at < ${snapshotExclusiveEndIso}::timestamptz
          AND si.trial_at > ${snapshotExclusiveEndIso}::timestamptz
          AND si.status IS DISTINCT FROM 'succeeded'::public.stripe_status
          AND (si.canceled_at IS NULL OR si.canceled_at >= ${snapshotExclusiveEndIso}::timestamptz)
          AND NOT EXISTS (
            SELECT 1
            FROM active_subscriptions a
            WHERE a.customer_id = si.customer_id
          )
        ORDER BY si.customer_id, si.created_at DESC
      ),
      plan_counts AS (
        SELECT plan_name, COUNT(*)::int AS plan_count
        FROM active_subscriptions
        GROUP BY plan_name
        UNION ALL
        SELECT 'Trial'::character varying AS plan_name, COUNT(*)::int AS plan_count
        FROM trial_users
      ),
      customer_counts AS (
        SELECT
          COUNT(CASE WHEN price_id IN (SELECT price_y_id FROM public.plans WHERE price_y_id IS NOT NULL) THEN 1 END)::int AS yearly,
          COUNT(CASE WHEN price_id IN (SELECT price_m_id FROM public.plans WHERE price_m_id IS NOT NULL) THEN 1 END)::int AS monthly,
          COUNT(*)::int AS total
        FROM active_subscriptions
      ),
      paying_org_counts AS (
        SELECT COUNT(DISTINCT o.id)::int AS paying_orgs_for_conversion
        FROM public.orgs o
        INNER JOIN active_subscriptions a ON a.customer_id = o.customer_id
      )
      SELECT
        cc.yearly,
        cc.monthly,
        cc.total,
        poc.paying_orgs_for_conversion,
        pc.plan_name,
        pc.plan_count
      FROM customer_counts cc
      CROSS JOIN paying_org_counts poc
      LEFT JOIN plan_counts pc ON true
    `)

    return normalizeBillingSnapshotCounts(result.rows)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'billing snapshot counts error', error })
    return getEmptyBillingSnapshotCounts()
  }
  finally {
    await closeClient(c, pgClient)
  }
}
async function getCoreSnapshotCounts(c: Context, snapshotExclusiveEnd: Date): Promise<CoreSnapshotCounts> {
  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)
  const snapshotExclusiveEndIso = snapshotExclusiveEnd.toISOString()

    // stripe_info stores current plan-state flags; plan_calculated_at bounds dated replays against later recalculations.
  try {
    const result = await drizzleClient.execute<CoreSnapshotRow>(sql`
      WITH active_need_upgrade AS (
        SELECT DISTINCT ON (si.customer_id)
          si.customer_id
        FROM public.stripe_info si
        WHERE si.is_good_plan = false
          AND si.created_at < ${snapshotExclusiveEndIso}::timestamptz
          AND (si.plan_calculated_at IS NULL OR si.plan_calculated_at < ${snapshotExclusiveEndIso}::timestamptz)
          AND (si.paid_at < ${snapshotExclusiveEndIso}::timestamptz OR si.paid_at IS NULL)
          AND si.status IN (
            'succeeded'::public.stripe_status,
            'canceled'::public.stripe_status,
            'deleted'::public.stripe_status
          )
          AND (si.canceled_at IS NULL OR si.canceled_at >= ${snapshotExclusiveEndIso}::timestamptz)
          AND si.subscription_anchor_end > ${snapshotExclusiveEndIso}::timestamptz
        ORDER BY si.customer_id, si.created_at DESC
      )
      SELECT
        (
          SELECT COUNT(DISTINCT apps.owner_org)::int
          FROM public.apps apps
          WHERE apps.created_at < ${snapshotExclusiveEndIso}::timestamptz
        ) AS onboarded,
        (
          SELECT COUNT(*)::int
          FROM active_need_upgrade
        ) AS need_upgrade
    `)

    return normalizeCoreSnapshotCounts(result.rows[0])
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'core snapshot counts error', error })
    return normalizeCoreSnapshotCounts(null)
  }
  finally {
    await closeClient(c, pgClient)
  }
}

async function runCoreGlobalStatsShard(c: Context, window: DailyWindow): Promise<void> {
  const supabase = supabaseAdmin(c)
  const snapshotEndIso = window.prevDayEnd.toISOString()
  const [
    apps,
    updates,
    updates_external,
    users,
    orgs,
    stars,
    billingSnapshot,
    coreSnapshot,
    actives,
  ] = await Promise.all([
    countAllApps(c, window.prevDayEnd),
    countAllUpdates(c, window.prevDayEnd),
    countAllUpdatesExternal(c, window.prevDayEnd),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', snapshotEndIso)
      .then(res => res.count ?? 0),
    supabase
      .from('orgs')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', snapshotEndIso)
      .then(res => res.count ?? 0),
    getGithubStars(),
    getBillingSnapshotCounts(c, window.prevDayEnd),
    getCoreSnapshotCounts(c, window.prevDayEnd),
    readActiveAppsCF(c, window.prevDayEnd).then(async (app_ids) => {
      try {
        const res2 = await supabase.rpc('count_active_users', { app_ids }).single()
        return { apps: app_ids.length, users: res2.data ?? 0 }
      }
      catch (e) {
        cloudlogErr({ requestId: c.get('requestId'), message: 'count_active_users error', error: e })
      }
      return { apps: app_ids.length, users: 0 }
    }),
  ])

  const { customers, payingOrgsForConversion, plans } = billingSnapshot
  const { onboarded, needUpgrade: need_upgrade } = coreSnapshot
  const not_paying = users - customers.total - plans.Trial
  const org_conversion_rate = calculateConversionRate(payingOrgsForConversion, orgs)
  const planConversionRates = getPlanConversionRates(plans, orgs)

  await updateGlobalStatsSnapshot(c, window.prevDayDateId, {
    apps,
    apps_active: actives.apps,
    need_upgrade,
    not_paying,
    onboarded,
    orgs,
    org_conversion_rate,
    paying: customers.total,
    paying_monthly: customers.monthly,
    paying_yearly: customers.yearly,
    plan_enterprise: plans.Enterprise || 0,
    plan_enterprise_conversion_rate: planConversionRates.enterprise,
    plan_maker: plans.Maker,
    plan_maker_conversion_rate: planConversionRates.maker,
    plan_solo: plans.Solo,
    plan_solo_conversion_rate: planConversionRates.solo,
    plan_team: plans.Team,
    plan_team_conversion_rate: planConversionRates.team,
    plan_total_conversion_rate: planConversionRates.total,
    stars,
    trial: plans.Trial,
    updates,
    updates_external,
    users,
    users_active: actives.users,
  })

  cloudlog({ requestId: c.get('requestId'), message: 'Updated global stats core shard', dateId: window.prevDayDateId, apps, updates, users, orgs })
}

async function getRegistersToday(c: Context, createdAfterIso: string, createdBeforeIso: string): Promise<number> {
  const supabase = supabaseAdmin(c)
  const filtered = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', createdAfterIso)
    .lt('created_at', createdBeforeIso)
    .eq('created_via_invite', false)

  const filteredCode = String((filtered.error as any)?.code ?? '').toUpperCase()
  if (filteredCode === 'PGRST204' || filteredCode === '42703' || filtered.error?.message?.toLowerCase().includes('created_via_invite')) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'registers_today: created_via_invite column missing, falling back to legacy count',
      error: filtered.error,
    })
    const legacy = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', createdAfterIso)
      .lt('created_at', createdBeforeIso)
    if (legacy.error)
      cloudlog({ requestId: c.get('requestId'), message: 'registers_today legacy error', error: legacy.error })
    return legacy.count ?? 0
  }

  if (filtered.error)
    cloudlog({ requestId: c.get('requestId'), message: 'registers_today error', error: filtered.error })
  return filtered.count ?? 0
}

async function getBundleStorageGb(c: Context): Promise<number> {
  const res = await supabaseAdmin(c).rpc('total_bundle_storage_bytes')
  if (res.error) {
    cloudlog({ requestId: c.get('requestId'), message: 'total_bundle_storage_bytes error', error: res.error })
    return 0
  }
  const bytes = res.data ?? 0
  const gigabytes = bytes / (1024 ** 3)
  return Number.isFinite(gigabytes) ? Number(gigabytes.toFixed(2)) : 0
}

async function runUsageGlobalStatsShard(c: Context, window: DailyWindow): Promise<void> {
  const metricWindow = getMetricWindowFromDailyWindow(window)
  const dayStartIso = metricWindow.dayStart.toISOString()
  const nextDayStartIso = metricWindow.nextDayStart.toISOString()
  const shouldWriteCurrentUsageMetrics = isLatestCompletedGlobalStatsWindow(window)
  const currentUsageMetricsPromise: Promise<{ bundleStorageGb: number, successRate: number } | null> = shouldWriteCurrentUsageMetrics
    ? (async () => {
        const [bundleStorageGb, successRate] = await Promise.all([
          getBundleStorageGb(c),
          (async () => {
            const res = await getUpdateStats(c)
            cloudlog({ requestId: c.get('requestId'), message: 'success_rate', successRate: res.total.success_rate })
            return res.total.success_rate
          })(),
        ])
        return { bundleStorageGb, successRate }
      })()
    : Promise.resolve(null)
  const [
    updatesLastMonth,
    devicesLastMonth,
    devicesByPlatform,
    registersToday,
    currentUsageMetrics,
    demoAppsCreated,
  ] = await Promise.all([
    readLastMonthUpdatesCF(c, window.prevDayEnd),
    readLastMonthDevicesCF(c, window.prevDayEnd),
    readLastMonthDevicesByPlatformCF(c, window.prevDayEnd),
    getRegistersToday(c, dayStartIso, nextDayStartIso),
    currentUsageMetricsPromise,
    countDemoSeededApps(c, dayStartIso, nextDayStartIso),
  ])

  const snapshotPatch: GlobalStatsSnapshotPatch = {
    demo_apps_created: demoAppsCreated,
    devices_last_month: devicesLastMonth,
    devices_last_month_android: devicesByPlatform.android,
    devices_last_month_ios: devicesByPlatform.ios,
    registers_today: registersToday,
    updates_last_month: updatesLastMonth,
  }

  if (currentUsageMetrics) {
    snapshotPatch.bundle_storage_gb = currentUsageMetrics.bundleStorageGb
    snapshotPatch.success_rate = currentUsageMetrics.successRate
  }

  await updateGlobalStatsSnapshot(c, window.prevDayDateId, snapshotPatch)
  cloudlog({ requestId: c.get('requestId'), message: 'Updated global stats usage shard', dateId: window.prevDayDateId, updatesLastMonth, devicesLastMonth, registersToday })
}

async function runRevenueGlobalStatsShard(c: Context, window: DailyWindow): Promise<void> {
  const supabase = supabaseAdmin(c)
  const metricWindow = getMetricWindowFromDailyWindow(window)
  const { dayStart, nextDayStart } = metricWindow
  const dayStartIso = dayStart.toISOString()
  const nextDayStartIso = nextDayStart.toISOString()
  const [
    revenue,
    new_paying_orgs,
    canceled_orgs,
    upgraded_orgs,
    credits_bought,
    credits_consumed,
  ] = await Promise.all([
    calculateRevenue(c, window.prevDayEnd),
    Promise.all([
      supabase
        .from('stripe_info')
        .select('customer_id')
        .not('paid_at', 'is', null)
        .eq('is_good_plan', true)
        .gte('paid_at', dayStartIso)
        .lt('paid_at', nextDayStartIso),
      supabase
        .from('stripe_info')
        .select('customer_id')
        .is('paid_at', null)
        .eq('status', 'succeeded')
        .eq('is_good_plan', true)
        .gte('created_at', dayStartIso)
        .lt('created_at', nextDayStartIso),
    ]).then(([paidToday, legacyFallback]) => {
      if (paidToday.error) {
        cloudlog({ requestId: c.get('requestId'), message: 'new_paying_orgs paid_at error', error: paidToday.error })
        return 0
      }
      if (legacyFallback.error) {
        cloudlog({ requestId: c.get('requestId'), message: 'new_paying_orgs legacy fallback error', error: legacyFallback.error })
        return 0
      }
      return countUniqueCustomers(paidToday.data || [], legacyFallback.data || [])
    }),
    supabase
      .from('stripe_info')
      .select('customer_id')
      .not('canceled_at', 'is', null)
      .gte('canceled_at', dayStartIso)
      .lt('canceled_at', nextDayStartIso)
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'canceled_orgs error', error: res.error })
          return 0
        }
        return new Set((res.data || []).map(row => row.customer_id)).size
      }),
    supabase
      .from('stripe_info')
      .select('customer_id')
      .gte('upgraded_at', dayStartIso)
      .lt('upgraded_at', nextDayStartIso)
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'upgraded_orgs error', error: res.error })
          return 0
        }
        return new Set((res.data || []).map(row => row.customer_id)).size
      }),
    supabase
      .from('usage_credit_grants')
      .select('credits_total')
      .gte('granted_at', dayStartIso)
      .lt('granted_at', nextDayStartIso)
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'credits_bought error', error: res.error })
          return 0
        }
        return (res.data || []).reduce((sum, row) => sum + (Number(row.credits_total) || 0), 0)
      }),
    supabase
      .from('usage_credit_consumptions')
      .select('credits_used')
      .gte('applied_at', dayStartIso)
      .lt('applied_at', nextDayStartIso)
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'credits_consumed error', error: res.error })
          return 0
        }
        return (res.data || []).reduce((sum, row) => sum + (Number(row.credits_used) || 0), 0)
      }),
  ])

  await updateGlobalStatsSnapshot(c, window.prevDayDateId, {
    canceled_orgs,
    credits_bought: Math.round(credits_bought),
    credits_consumed: Math.round(credits_consumed),
    mrr: revenue.mrr,
    new_paying_orgs,
    plan_enterprise_monthly: revenue.plan_enterprise_monthly,
    plan_enterprise_yearly: revenue.plan_enterprise_yearly,
    plan_maker_monthly: revenue.plan_maker_monthly,
    plan_maker_yearly: revenue.plan_maker_yearly,
    plan_solo_monthly: revenue.plan_solo_monthly,
    plan_solo_yearly: revenue.plan_solo_yearly,
    plan_team_monthly: revenue.plan_team_monthly,
    plan_team_yearly: revenue.plan_team_yearly,
    revenue_enterprise: revenue.revenue_enterprise,
    revenue_maker: revenue.revenue_maker,
    revenue_solo: revenue.revenue_solo,
    revenue_team: revenue.revenue_team,
    total_revenue: revenue.total_revenue,
    upgraded_orgs,
  })

  cloudlog({ requestId: c.get('requestId'), message: 'Updated global stats revenue shard', dateId: window.prevDayDateId, mrr: revenue.mrr, new_paying_orgs, canceled_orgs })
}

async function runPluginsGlobalStatsShard(c: Context, window: DailyWindow): Promise<void> {
  const plugin_breakdown = await getPluginBreakdownCF(c, window.prevDayEnd)

  await updateGlobalStatsSnapshot(c, window.prevDayDateId, {
    plugin_major_breakdown: plugin_breakdown.major_breakdown,
    plugin_version_breakdown: plugin_breakdown.version_breakdown,
    plugin_version_ladder: plugin_breakdown.version_ladder as unknown as Json,
  })

  cloudlog({ requestId: c.get('requestId'), message: 'Updated global stats plugin shard', dateId: window.prevDayDateId })
}

async function runBuildsGlobalStatsShard(c: Context, window: DailyWindow): Promise<void> {
  const build_stats = await getBuildStats(c, window)

  await updateGlobalStatsSnapshot(c, window.prevDayDateId, {
    builds_android: build_stats.android,
    builds_ios: build_stats.ios,
    builds_last_month: build_stats.last_month,
    builds_last_month_android: build_stats.last_month_android,
    builds_last_month_ios: build_stats.last_month_ios,
    builds_success_android: build_stats.success_android,
    builds_success_ios: build_stats.success_ios,
    builds_success_total: build_stats.success_total,
    builds_total: build_stats.total,
  })

  if (build_stats.daily_metrics_available) {
    const { error: buildMetricsError } = await supabaseAdmin(c)
      .from('global_stats')
      .update({
        build_total_seconds_day_ios: build_stats.total_seconds_day_ios,
        build_total_seconds_day_android: build_stats.total_seconds_day_android,
        build_avg_seconds_day_ios: build_stats.avg_seconds_day_ios,
        build_avg_seconds_day_android: build_stats.avg_seconds_day_android,
        build_count_day_ios: build_stats.build_count_day_ios,
        build_count_day_android: build_stats.build_count_day_android,
      })
      .eq('date_id', window.prevDayDateId)

    if (buildMetricsError) {
      if (isMissingBuildMetricColumnError(buildMetricsError)) {
        const { error: legacyBuildMetricsError } = await supabaseAdmin(c)
          .from('global_stats')
          .update({
            build_minutes_day_ios: build_stats.total_seconds_day_ios / 60,
            build_minutes_day_android: build_stats.total_seconds_day_android / 60,
            builds_day_ios: build_stats.build_count_day_ios,
            builds_day_android: build_stats.build_count_day_android,
          } as any)
          .eq('date_id', window.prevDayDateId)

        if (legacyBuildMetricsError)
          throw legacyBuildMetricsError
      }
      else {
        throw buildMetricsError
      }
    }
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'Skipping build metric update because daily aggregation failed' })
  }

  cloudlog({ requestId: c.get('requestId'), message: 'Updated global stats builds shard', dateId: window.prevDayDateId, builds_total: build_stats.total })
}

async function runRetentionGlobalStatsShard(c: Context, window: DailyWindow): Promise<void> {
  const retention_metrics = await getRevenueRetentionMetrics(c, window.prevDayDateId)

  await updateGlobalStatsSnapshot(c, window.prevDayDateId, {
    churn_revenue: retention_metrics.churnRevenue,
    churn_revenue_enterprise: retention_metrics.churnRevenueEnterprise,
    churn_revenue_maker: retention_metrics.churnRevenueMaker,
    churn_revenue_solo: retention_metrics.churnRevenueSolo,
    churn_revenue_team: retention_metrics.churnRevenueTeam,
    nrr: retention_metrics.nrr,
  })

  cloudlog({ requestId: c.get('requestId'), message: 'Updated global stats retention shard', dateId: window.prevDayDateId, nrr: retention_metrics.nrr })
}

async function runPaidProductsGlobalStatsShard(c: Context, window: DailyWindow): Promise<void> {
  const paid_product_activity_stats = await getPaidProductActivityStats(c, getMetricWindowFromDailyWindow(window))

  await updateGlobalStatsSnapshot(c, window.prevDayDateId, {
    builder_active_paying_clients_60d: paid_product_activity_stats.builder_active_paying_clients_60d,
    live_updates_active_paying_clients_60d: paid_product_activity_stats.live_updates_active_paying_clients_60d,
  })

  cloudlog({ requestId: c.get('requestId'), message: 'Updated global stats paid products shard', dateId: window.prevDayDateId })
}

async function runLtvGlobalStatsShard(c: Context, window: DailyWindow): Promise<void> {
  const ltv_stats = await getLtvStats(c, getMetricWindowFromDailyWindow(window))

  await updateGlobalStatsSnapshot(c, window.prevDayDateId, {
    average_ltv: ltv_stats.average_ltv,
    longest_ltv: ltv_stats.longest_ltv,
    shortest_ltv: ltv_stats.shortest_ltv,
  })

  cloudlog({ requestId: c.get('requestId'), message: 'Updated global stats ltv shard', dateId: window.prevDayDateId, average_ltv: ltv_stats.average_ltv })
}

async function readGlobalStatsSnapshot(c: Context, dateId: string): Promise<GlobalStatsSnapshotRow> {
  const { data, error } = await supabaseAdmin(c)
    .from('global_stats')
    .select('*')
    .eq('date_id', dateId)
    .single()

  if (error || !data)
    quickError(503, 'global_stats_snapshot_not_ready', 'Global stats snapshot is not ready', { dateId }, error, { alert: false })

  return data as GlobalStatsSnapshotRow
}

function getNumber(value: number | null | undefined): number {
  return Number(value) || 0
}

function formatPercentCount(count: number, total: number): string {
  if (total <= 0)
    return `0% - ${count}`
  return `${(count * 100 / total).toFixed(0)}% - ${count}`
}

async function runNotificationsGlobalStatsShard(c: Context, window: DailyWindow): Promise<void> {
  const notificationClaim = await claimGlobalStatsNotificationDelivery(c, window.prevDayDateId)
  if (!notificationClaim) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Skipping claimed global stats notification shard',
      dateId: window.prevDayDateId,
    })
    return
  }

  try {
    const completedShards = await readCompletedGlobalStatsShards(c, window.prevDayDateId)
    if (hasCompletedGlobalStatsNotifications(completedShards)) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Skipping completed global stats notification shard',
        dateId: window.prevDayDateId,
        completedShards: Array.from(completedShards).sort((a, b) => a.localeCompare(b)),
      })
      return
    }

    const snapshot = await readGlobalStatsSnapshot(c, window.prevDayDateId)

    const apps = getNumber(snapshot.apps)
    const users = getNumber(snapshot.users)
    const orgs = getNumber(snapshot.orgs)
    const missingShards = getMissingGlobalStatsRequiredShards(completedShards)
    if (apps <= 0 || users <= 0 || orgs <= 0 || missingShards.length > 0) {
      quickError(503, 'global_stats_snapshot_not_ready', 'Global stats snapshot is not ready', {
        dateId: window.prevDayDateId,
        apps,
        users,
        orgs,
        completedShards: Array.from(completedShards),
        missingShards,
      }, undefined, { alert: false })
    }

    const paying = getNumber(snapshot.paying)
    const bundle_storage_gb = getNumber(snapshot.bundle_storage_gb)
    const success_rate = getNumber(snapshot.success_rate)
    const org_conversion_rate = getNumber(snapshot.org_conversion_rate)
    const plans = normalizePlanTotals({
      Enterprise: getNumber(snapshot.plan_enterprise),
      Maker: getNumber(snapshot.plan_maker),
      Solo: getNumber(snapshot.plan_solo),
      Team: getNumber(snapshot.plan_team),
      Trial: getNumber(snapshot.trial),
    })

    if (!completedShards.has(GLOBAL_STATS_NOTIFICATION_LOGSNAG_STEP)) {
      await logsnagInsights(c, [
        { title: 'Apps', value: apps, icon: '📱' },
        { title: 'Active Apps', value: getNumber(snapshot.apps_active), icon: '💃' },
        { title: 'Updates', value: getNumber(snapshot.updates), icon: '📲' },
        { title: 'Updates on premises', value: getNumber(snapshot.updates_external), icon: '📲' },
        { title: 'Updates last month', value: getNumber(snapshot.updates_last_month), icon: '📲' },
        { title: 'Bundle Storage (GB)', value: `${bundle_storage_gb.toFixed(2)} GB`, icon: '💾' },
        { title: 'Total Users', value: users, icon: '👨' },
        { title: 'Active Users', value: getNumber(snapshot.users_active), icon: '🎉' },
        { title: 'Registrations Today', value: getNumber(snapshot.registers_today), icon: '🆕' },
        { title: 'User onboarded', value: getNumber(snapshot.onboarded), icon: '✅' },
        { title: 'Orgs', value: orgs, icon: '🏢' },
        { title: 'Orgs with trial', value: plans.Trial, icon: '👶' },
        { title: 'Orgs paying', value: paying, icon: '💰' },
        { title: 'Org conversion rate', value: `${org_conversion_rate.toFixed(1)}%`, icon: '🎯' },
        { title: 'Orgs yearly', value: formatPercentCount(getNumber(snapshot.paying_yearly), paying), icon: '🧧' },
        { title: 'Orgs monthly', value: formatPercentCount(getNumber(snapshot.paying_monthly), paying), icon: '🗓️' },
        { title: 'Orgs not paying', value: getNumber(snapshot.not_paying), icon: '🥲' },
        { title: 'Orgs need upgrade', value: getNumber(snapshot.need_upgrade), icon: '🤒' },
        { title: 'Orgs Solo Plan', value: formatPercentCount(plans.Solo, paying), icon: '🎸' },
        { title: 'Orgs Maker Plan', value: formatPercentCount(plans.Maker, paying), icon: '🤝' },
        { title: 'Orgs Team Plan', value: formatPercentCount(plans.Team, paying), icon: '👏' },
        { title: 'Orgs Enterprise Plan', value: formatPercentCount(plans.Enterprise, paying), icon: '📈' },
        { title: 'Devices iOS (30d)', value: getNumber(snapshot.devices_last_month_ios), icon: '🍎' },
        { title: 'Devices Android (30d)', value: getNumber(snapshot.devices_last_month_android), icon: '🤖' },
        { title: 'Total Builds', value: getNumber(snapshot.builds_total), icon: '🔨' },
        { title: 'iOS Builds', value: getNumber(snapshot.builds_ios), icon: '🍏' },
        { title: 'Android Builds', value: getNumber(snapshot.builds_android), icon: '🤖' },
        { title: 'Builds (30d)', value: getNumber(snapshot.builds_last_month), icon: '🔨' },
        { title: 'iOS Builds (30d)', value: getNumber(snapshot.builds_last_month_ios), icon: '🍏' },
        { title: 'Android Builds (30d)', value: getNumber(snapshot.builds_last_month_android), icon: '🤖' },
      ], { strict: true })
      await markGlobalStatsShardComplete(c, window.prevDayDateId, GLOBAL_STATS_NOTIFICATION_LOGSNAG_STEP)
      completedShards.add(GLOBAL_STATS_NOTIFICATION_LOGSNAG_STEP)
    }

    if (!completedShards.has(GLOBAL_STATS_NOTIFICATION_TRACKING_STEP)) {
      await sendEventToTracking(c, {
        channel: 'updates-stats',
        event: 'Updates last month',
        user_id: 'admin',
        tags: {
          updates_last_month: getNumber(snapshot.updates_last_month),
          success_rate,
          registers_today: getNumber(snapshot.registers_today),
          storage_gb: bundle_storage_gb,
          org_conversion_rate,
        },
        icon: '📲',
      }, { background: false, strict: true })
      await markGlobalStatsShardComplete(c, window.prevDayDateId, GLOBAL_STATS_NOTIFICATION_TRACKING_STEP)
      completedShards.add(GLOBAL_STATS_NOTIFICATION_TRACKING_STEP)
    }

    await markGlobalStatsShardComplete(c, window.prevDayDateId, 'notifications')
    cloudlog({ requestId: c.get('requestId'), message: 'Sent logsnag insights from global stats snapshot', dateId: window.prevDayDateId })
  }
  finally {
    await releaseGlobalStatsNotificationDeliveryClaim(c, notificationClaim, window.prevDayDateId)
  }
}

function scheduleLogsnagInsightsUpdate(
  c: Context,
  runUpdate: (c: Context) => Promise<void> = runLogsnagInsightsUpdate,
  options: ScheduleLogsnagInsightsUpdateOptions = {},
) {
  const retryCount = options.retryCount ?? 0
  const retryMsgId = options.retryMsgId ?? null
  const cancelRetry = options.cancelRetry ?? cancelLogsnagInsightsRetry
  let updateSucceeded = false
  const task = Promise.resolve()
    .then(() => runUpdate(c))
    .then(async () => {
      updateSucceeded = true
      if (retryMsgId === null)
        return
      await cancelRetry(c, retryMsgId)
    })
    .catch(async (error: unknown) => {
      cloudlogErr({ requestId: c.get('requestId'), message: 'logsnag insights background task failed', retryCount, retryMsgId, updateSucceeded, error })
      if (retryMsgId !== null && !updateSucceeded)
        return
      if (retryMsgId !== null)
        throw error
      if (retryCount >= LOGSNAG_INSIGHTS_BACKGROUND_MAX_RETRIES)
        cloudlogErr({ requestId: c.get('requestId'), message: 'logsnag insights background retry budget exhausted', retryCount, error })
    })

  return backgroundTask(c, task)
}

export const logsnagInsightsTestUtils = {
  buildLogsnagInsightsRetryMessage,
  buildLogsnagInsightsShardMessage,
  readLogsnagInsightsPayload,
  calculateChurnRevenue,
  calculateNrr,
  countUniqueCustomers,
  getCompletedDayWindowForDateId,
  getMetricWindowFromDailyWindow,
  getMissingGlobalStatsRequiredShards,
  getMissingGlobalStatsShards,
  hasCompletedGlobalStatsNotifications,
  normalizeCompletedGlobalStatsShards,
  isLatestCompletedGlobalStatsWindow,
  getLogsnagInsightsShardFunctionName,
  getCompletedDayWindow,
  getCurrentDayWindow,
  getPreviousDateId,
  normalizeGlobalStatsDateId,
  normalizeLogsnagInsightsShard,
  normalizeLogsnagInsightsRetryCount,
  normalizePlanTotals,
  normalizeBillingSnapshotCounts,
  normalizeCoreSnapshotCounts,
  reserveLogsnagInsightsRetry,
  scheduleLogsnagInsightsUpdate,
}

export const app = new Hono<MiddlewareKeyVariables>()

async function runLogsnagInsightsShard(c: Context, shard: GlobalStatsShard, dateId: string): Promise<void> {
  const window = getCompletedDayWindowForDateId(dateId)

  switch (shard) {
    case 'core':
      await runCoreGlobalStatsShard(c, window)
      await markGlobalStatsShardComplete(c, dateId, shard)
      return
    case 'usage':
      await runUsageGlobalStatsShard(c, window)
      await markGlobalStatsShardComplete(c, dateId, shard)
      return
    case 'revenue':
      await runRevenueGlobalStatsShard(c, window)
      await markGlobalStatsShardComplete(c, dateId, shard)
      return
    case 'plugins':
      await runPluginsGlobalStatsShard(c, window)
      await markGlobalStatsShardComplete(c, dateId, shard)
      return
    case 'builds':
      await runBuildsGlobalStatsShard(c, window)
      await markGlobalStatsShardComplete(c, dateId, shard)
      return
    case 'retention':
      await runRetentionGlobalStatsShard(c, window)
      await markGlobalStatsShardComplete(c, dateId, shard)
      return
    case 'paid_products':
      await runPaidProductsGlobalStatsShard(c, window)
      await markGlobalStatsShardComplete(c, dateId, shard)
      return
    case 'ltv':
      await runLtvGlobalStatsShard(c, window)
      await markGlobalStatsShardComplete(c, dateId, shard)
      return
    case 'notifications':
      await runNotificationsGlobalStatsShard(c, window)
      return
  }
}

async function runLogsnagInsightsUpdate(c: Context, dateId = getDailyWindow().prevDayDateId, retryCount = 0): Promise<void> {
  if (await shouldSkipCompletedLogsnagInsightsRetryDispatch(c, dateId, retryCount))
    return

  await dispatchLogsnagInsightsShards(c, dateId)
}

function resolveLogsnagInsightsSnapshotDateId(payload: LogsnagInsightsPayload): string {
  const payloadDateId = normalizeGlobalStatsDateId(payload.date_id)
  if (payload.date_id !== undefined && payloadDateId === null)
    quickError(400, 'invalid_global_stats_date_id', 'Invalid global stats date_id', { date_id: payload.date_id }, undefined, { alert: false })

  return payloadDateId ?? getDailyWindow().prevDayDateId
}

function createLogsnagInsightsShardApp(shard: GlobalStatsShard): Hono<MiddlewareKeyVariables> {
  const shardApp = new Hono<MiddlewareKeyVariables>()

  shardApp.post('/', middlewareAPISecret, async (c) => {
    const payload = await readLogsnagInsightsPayload(c)
    const snapshotDateId = resolveLogsnagInsightsSnapshotDateId(payload)

    if (payload.shard !== undefined) {
      const payloadShard = normalizeLogsnagInsightsShard(payload.shard)
      if (payloadShard !== shard)
        quickError(400, 'invalid_global_stats_shard', 'Invalid global stats shard', { shard: payload.shard, expected: shard }, undefined, { alert: false })
    }

    await runLogsnagInsightsShard(c, shard, snapshotDateId)
    return c.json(BRES)
  })

  return shardApp
}

export const logsnagInsightsShardApps: Record<GlobalStatsShard, Hono<MiddlewareKeyVariables>> = {
  core: createLogsnagInsightsShardApp('core'),
  usage: createLogsnagInsightsShardApp('usage'),
  revenue: createLogsnagInsightsShardApp('revenue'),
  plugins: createLogsnagInsightsShardApp('plugins'),
  builds: createLogsnagInsightsShardApp('builds'),
  retention: createLogsnagInsightsShardApp('retention'),
  paid_products: createLogsnagInsightsShardApp('paid_products'),
  ltv: createLogsnagInsightsShardApp('ltv'),
  notifications: createLogsnagInsightsShardApp('notifications'),
}

app.post('/', middlewareAPISecret, async (c) => {
  const payload = await readLogsnagInsightsPayload(c)
  const snapshotDateId = resolveLogsnagInsightsSnapshotDateId(payload)

  if (payload.shard !== undefined) {
    const shard = normalizeLogsnagInsightsShard(payload.shard)
    if (shard === null)
      quickError(400, 'invalid_global_stats_shard', 'Invalid global stats shard', { shard: payload.shard }, undefined, { alert: false })

    await runLogsnagInsightsShard(c, shard, snapshotDateId)
    return c.json(BRES)
  }

  const retryCount = normalizeLogsnagInsightsRetryCount(payload.retry_count)
  let retryMsgId: number | null = null

  try {
    // Reserve the next delayed dispatcher retry before returning 202 so queue_consumer can acknowledge the current message safely.
    retryMsgId = await reserveLogsnagInsightsRetry(c, retryCount, snapshotDateId)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to reserve logsnag insights dispatcher retry', retryCount, dateId: snapshotDateId, error })
    quickError(503, 'logsnag_insights_retry_reserve_failed', 'Failed to reserve logsnag insights retry', { retryCount, dateId: snapshotDateId }, error, { alert: false })
  }

  await scheduleLogsnagInsightsUpdate(c, context => runLogsnagInsightsUpdate(context, snapshotDateId, retryCount), {
    retryCount,
    retryMsgId,
  })
  return c.json(BRES, 202)
})
