import type { Context } from 'hono'
import type { DevicesByPlatform, PluginBreakdownResult } from '../utils/cloudflare.ts'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database, Json } from '../utils/supabase.types.ts'

import { sql } from 'drizzle-orm'
import { Hono } from 'hono/tiny'

import { getPluginBreakdownCF, readActiveAppsCF, readLastMonthDevicesByPlatformCF, readLastMonthDevicesCF, readLastMonthUpdatesCF } from '../utils/cloudflare.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { logsnagInsights } from '../utils/logsnag.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { countAllApps, countAllUpdates, countAllUpdatesExternal, getUpdateStats } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { sendEventToTracking } from '../utils/tracking.ts'

interface PlanTotal { [key: string]: number }
interface Actives { users: number, apps: number }
interface CustomerCount { total: number, yearly: number, monthly: number }
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
type TrialExtensionStats = {
  trial_extended_orgs: number
  trial_extended_subscribed_orgs: number
}
interface PastDueOrgStats {
  past_due_orgs: number
  past_due_orgs_average_days: number
}
interface PastDueOrgRow extends CustomerIdRow {
  past_due_at?: string | null
  updated_at?: string | null
}
interface GlobalStats {
  apps: PromiseLike<number>
  updates: PromiseLike<number>
  updates_external: PromiseLike<number>
  updates_last_month: PromiseLike<number>
  users: PromiseLike<number>
  orgs: PromiseLike<number>
  stars: Promise<number>
  onboarded: PromiseLike<number>
  success_rate: PromiseLike<number>
  need_upgrade: PromiseLike<number>
  customers: PromiseLike<CustomerCount>
  paying_orgs_for_conversion: PromiseLike<number>
  plans: PromiseLike<PlanTotal>
  actives: Promise<Actives>
  devices_last_month: PromiseLike<number>
  devices_by_platform: PromiseLike<DevicesByPlatform>
  registers_today: PromiseLike<number>
  bundle_storage_gb: PromiseLike<number>
  revenue: PromiseLike<PlanRevenue>
  new_paying_orgs: PromiseLike<number>
  canceled_orgs: PromiseLike<number>
  upgraded_orgs: PromiseLike<number>
  trial_extension_stats: PromiseLike<TrialExtensionStats>
  past_due_org_stats: PromiseLike<PastDueOrgStats>
  credits_bought: PromiseLike<number>
  credits_consumed: PromiseLike<number>
  demo_apps_created: PromiseLike<number>
  plugin_breakdown: PromiseLike<PluginBreakdownResult>
  build_stats: PromiseLike<BuildStats>
  retention_metrics: PromiseLike<RevenueRetentionMetrics>
  paid_product_activity_stats: PromiseLike<PaidProductActivityStats>
  ltv_stats: PromiseLike<LtvStats>
}
interface CustomerIdRow {
  customer_id: string
}
const REVENUE_ACTIVE_STRIPE_STATUSES: Database['public']['Enums']['stripe_status'][] = ['succeeded']

function getDateId(targetDate = new Date()): string {
  return new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())).toISOString().slice(0, 10)
}

function calculateConversionRate(converted: number | null | undefined, totalOrgs: number) {
  if (totalOrgs <= 0)
    return 0
  return Number((((converted ?? 0) * 100) / totalOrgs).toFixed(1))
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

function calculateAveragePastDueDays(rows: PastDueOrgRow[], snapshotAt: Date) {
  const startTimeByCustomer = getPastDueStartTimesByCustomer(rows, snapshotAt)
  const snapshotTime = snapshotAt.getTime()

  const durations = Array.from(startTimeByCustomer.values())
    .map(startTime => (snapshotTime - startTime) / (24 * 60 * 60 * 1000))

  if (durations.length === 0)
    return 0

  const totalDays = durations.reduce((sum, days) => sum + days, 0)
  return Number((totalDays / durations.length).toFixed(1))
}

function getPastDueStartTimesByCustomer(rows: PastDueOrgRow[], snapshotAt: Date) {
  const snapshotTime = snapshotAt.getTime()
  const startTimeByCustomer = new Map<string, number>()

  for (const row of rows) {
    if (!row.customer_id)
      continue

    const startDate = row.past_due_at ?? row.updated_at
    if (!startDate)
      continue

    const startTime = new Date(startDate).getTime()
    if (!Number.isFinite(startTime) || startTime > snapshotTime)
      continue

    const previousStartTime = startTimeByCustomer.get(row.customer_id)
    if (previousStartTime === undefined || startTime < previousStartTime)
      startTimeByCustomer.set(row.customer_id, startTime)
  }

  return startTimeByCustomer
}

function calculatePastDueOrgStats(rows: PastDueOrgRow[], snapshotAt: Date): PastDueOrgStats {
  const startTimeByCustomer = getPastDueStartTimesByCustomer(rows, snapshotAt)
  return {
    past_due_orgs: startTimeByCustomer.size,
    past_due_orgs_average_days: calculateAveragePastDueDays(rows, snapshotAt),
  }
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

async function calculateRevenue(c: Context): Promise<PlanRevenue> {
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

    // Get subscription counts from stripe_info
    const { data: subsData, error: subsError } = await supabase
      .from('stripe_info')
      .select(`
        price_id,
        plans!stripe_info_product_id_fkey(name)
      `)
      .in('status', REVENUE_ACTIVE_STRIPE_STATUSES)
      .eq('is_good_plan', true)

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
    for (const sub of subsData) {
      const planName = (sub.plans as any)?.name?.toLowerCase()
      if (!planName || !['solo', 'maker', 'team', 'enterprise'].includes(planName))
        continue

      const priceId = sub.price_id
      if (!subCountMap.has(planName)) {
        subCountMap.set(planName, { monthly: 0, yearly: 0 })
      }

      const planPrices = priceMap.get(planName)
      if (planPrices) {
        if (priceId === planPrices.price_m_id) {
          subCountMap.get(planName)!.monthly++
        }
        else if (priceId === planPrices.price_y_id) {
          subCountMap.get(planName)!.yearly++
        }
      }
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
  const last30days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { prevDayStart, prevDayEnd } = window ?? getDailyWindow()

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
      supabase.from('build_logs').select('*', { count: 'exact', head: true }).gte('created_at', last30days),
      // Count iOS builds (last 30 days)
      supabase.from('build_logs').select('*', { count: 'exact', head: true }).eq('platform', 'ios').gte('created_at', last30days),
      // Count Android builds (last 30 days)
      supabase.from('build_logs').select('*', { count: 'exact', head: true }).eq('platform', 'android').gte('created_at', last30days),
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
          AND si.status = 'succeeded'
          AND si.is_good_plan = true
          AND COALESCE(si.paid_at, si.subscription_anchor_start, si.created_at, o.created_at) < ${nextDayStart.toISOString()}::timestamptz
          AND (si.canceled_at IS NULL OR si.canceled_at >= ${dayStart.toISOString()}::timestamptz)
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

async function countDemoSeededApps(c: Context, createdAfterIso: string): Promise<number> {
  const pgClient = getPgClient(c, false)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    const result = await drizzleClient.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM public.apps AS apps
      WHERE apps.created_at >= ${new Date(createdAfterIso)}
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

async function getTrialExtensionStats(c: Context, window: CurrentDayWindow): Promise<TrialExtensionStats> {
  const pgClient = getPgClient(c, false)
  const drizzleClient = getDrizzleClient(pgClient)
  const dayStartIso = window.dayStart.toISOString()
  const nextDayStartIso = window.nextDayStart.toISOString()

  try {
    const result = await drizzleClient.execute<TrialExtensionStats>(sql`
      WITH extension_events AS (
        SELECT DISTINCT tee.org_id
        FROM public.trial_extension_events tee
        WHERE tee.created_at >= ${dayStartIso}::timestamptz
          AND tee.created_at < ${nextDayStartIso}::timestamptz
      ),
      subscribed_extended AS (
        SELECT DISTINCT o.id AS org_id
        FROM public.orgs o
        INNER JOIN public.stripe_info si ON si.customer_id = o.customer_id
        WHERE si.paid_at IS NOT NULL
          AND si.paid_at >= ${dayStartIso}::timestamptz
          AND si.paid_at < ${nextDayStartIso}::timestamptz
          AND EXISTS (
            SELECT 1
            FROM public.trial_extension_events tee
            WHERE tee.org_id = o.id
              AND tee.created_at <= si.paid_at
          )
      )
      SELECT
        (SELECT COUNT(*) FROM extension_events)::int AS trial_extended_orgs,
        (SELECT COUNT(*) FROM subscribed_extended)::int AS trial_extended_subscribed_orgs
    `)

    const row = result.rows[0]
    return {
      trial_extended_orgs: Number(row?.trial_extended_orgs) || 0,
      trial_extended_subscribed_orgs: Number(row?.trial_extended_subscribed_orgs) || 0,
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'trial extension stats unavailable', error })
    return {
      trial_extended_orgs: 0,
      trial_extended_subscribed_orgs: 0,
    }
  }
  finally {
    closeClient(c, pgClient)
  }
}

function getStats(c: Context, window?: DailyWindow): GlobalStats {
  const supabase = supabaseAdmin(c)
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const metricWindow = window
    ? {
        dayStart: window.prevDayStart,
        nextDayStart: window.prevDayEnd,
        dayDateId: window.prevDayDateId,
      }
    : getCurrentDayWindow()
  const { dayStart, nextDayStart } = metricWindow
  const dayStartIso = dayStart.toISOString()
  const nextDayStartIso = nextDayStart.toISOString()
  return {
    apps: countAllApps(c),
    updates: countAllUpdates(c),
    updates_external: countAllUpdatesExternal(c),
    users: supabase
      .from('users')
      .select('*', { count: 'exact' })
      .then(res => res.count ?? 0),
    orgs: supabase
      .from('orgs')
      .select('*', { count: 'exact' })
      .then(res => res.count ?? 0),
    stars: getGithubStars(),
    customers: supabase.rpc('get_customer_counts').single().then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'get_customer_counts', error: res.error })
      return res.data ?? { total: 0, yearly: 0, monthly: 0 }
    }),
    paying_orgs_for_conversion: supabase
      .from('orgs')
      .select('id, stripe_info!inner(customer_id)', { count: 'exact', head: true })
      .in('stripe_info.status', REVENUE_ACTIVE_STRIPE_STATUSES)
      .eq('stripe_info.is_good_plan', true)
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'paying_orgs_for_conversion error', error: res.error })
          return 0
        }
        return res.count ?? 0
      }),
    onboarded: supabase.rpc('count_all_onboarded').single().then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'count_all_onboarded', error: res.error })
      return res.data ?? 0
    }),
    need_upgrade: supabase.rpc('count_all_need_upgrade').single().then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'count_all_need_upgrade', error: res.error })
      return res.data ?? 0
    }),
    plans: supabase.rpc('count_all_plans_v2').then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'count_all_plans_v2', error: res.error })
      return res.data ?? {}
    }).then((data: any) => {
      const total: PlanTotal = {}
      for (const plan of data)
        total[plan.plan_name] = plan.count

      return total
    }),
    success_rate: getUpdateStats(c).then((res) => {
      cloudlog({ requestId: c.get('requestId'), message: 'success_rate', success_rate: res.total.success_rate })
      return res.total.success_rate
    }),
    actives: readActiveAppsCF(c).then(async (app_ids) => {
      try {
        const res2 = await supabase.rpc('count_active_users', { app_ids }).single()
        return { apps: app_ids.length, users: res2.data ?? 0 }
      }
      catch (e) {
        cloudlogErr({ requestId: c.get('requestId'), message: 'count_active_users error', error: e })
      }
      return { apps: app_ids.length, users: 0 }
    }),
    updates_last_month: readLastMonthUpdatesCF(c),
    devices_last_month: readLastMonthDevicesCF(c),
    devices_by_platform: readLastMonthDevicesByPlatformCF(c),
    registers_today: (async () => {
      // TODO: Remove backward-compat fallback once migration 20260209014020 is deployed to all environments.
      // Backward compatible rollout: if the column doesn't exist yet, fall back to the legacy count.
      const filtered = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', last24h)
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
          .gte('created_at', last24h)
        if (legacy.error)
          cloudlog({ requestId: c.get('requestId'), message: 'registers_today legacy error', error: legacy.error })
        return legacy.count ?? 0
      }

      if (filtered.error)
        cloudlog({ requestId: c.get('requestId'), message: 'registers_today error', error: filtered.error })
      return filtered.count ?? 0
    })(),
    bundle_storage_gb: supabase
      .rpc('total_bundle_storage_bytes')
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'total_bundle_storage_bytes error', error: res.error })
          return 0
        }
        const bytes = res.data ?? 0
        const gigabytes = bytes / (1024 ** 3)
        return Number.isFinite(gigabytes) ? Number(gigabytes.toFixed(2)) : 0
      }),
    revenue: calculateRevenue(c),
    new_paying_orgs: Promise.all([
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
        .in('status', REVENUE_ACTIVE_STRIPE_STATUSES)
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
    canceled_orgs: supabase
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
        // Count unique customer_ids (orgs) that canceled today
        const uniqueCustomers = new Set((res.data || []).map(row => row.customer_id))
        return uniqueCustomers.size
      }),
    upgraded_orgs: supabase
      .from('stripe_info')
      .select('customer_id')
      .gte('upgraded_at', dayStartIso)
      .lt('upgraded_at', nextDayStartIso)
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'upgraded_orgs error', error: res.error })
          return 0
        }
        const uniqueCustomers = new Set((res.data || []).map(row => row.customer_id))
        return uniqueCustomers.size
      }),
    trial_extension_stats: getTrialExtensionStats(c, metricWindow),
    past_due_org_stats: (async () => {
      const res = await supabase
        .from('stripe_info')
        .select('customer_id, past_due_at, updated_at')
        .not('past_due_at', 'is', null)
        .lt('past_due_at', nextDayStartIso)

      if (res.error) {
        cloudlog({ requestId: c.get('requestId'), message: 'past_due_org_stats error', error: res.error })
        return { past_due_orgs: 0, past_due_orgs_average_days: 0 }
      }

      return calculatePastDueOrgStats((res.data || []) as PastDueOrgRow[], nextDayStart)
    })(),
    credits_bought: supabase
      .from('usage_credit_grants')
      .select('credits_total')
      .gte('granted_at', last24h)
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'credits_bought error', error: res.error })
          return 0
        }
        return (res.data || []).reduce((sum, row) => sum + (Number(row.credits_total) || 0), 0)
      }),
    credits_consumed: supabase
      .from('usage_credit_consumptions')
      .select('credits_used')
      .gte('applied_at', last24h)
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'credits_consumed error', error: res.error })
          return 0
        }
        return (res.data || []).reduce((sum, row) => sum + (Number(row.credits_used) || 0), 0)
      }),
    demo_apps_created: countDemoSeededApps(c, last24h),
    plugin_breakdown: getPluginBreakdownCF(c),
    build_stats: getBuildStats(c, window),
    retention_metrics: getRevenueRetentionMetrics(c, metricWindow.dayDateId),
    paid_product_activity_stats: getPaidProductActivityStats(c, metricWindow),
    ltv_stats: getLtvStats(c, metricWindow),
  }
}

export const logsnagInsightsTestUtils = {
  REVENUE_ACTIVE_STRIPE_STATUSES,
  calculateChurnRevenue,
  calculatePastDueOrgStats,
  calculateNrr,
  countUniqueCustomers,
  getCompletedDayWindow,
  getCurrentDayWindow,
  getPreviousDateId,
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const dailyWindow = getDailyWindow()
  const res = getStats(c, dailyWindow)
  const snapshotDateId = dailyWindow.prevDayDateId
  const [
    apps,
    updates,
    updates_external,
    users,
    orgs,
    stars,
    customers,
    paying_orgs_for_conversion,
    onboarded,
    need_upgrade,
    plans,
    actives,
    updates_last_month,
    devices_last_month,
    devices_by_platform,
    registers_today,
    bundle_storage_gb,
    success_rate,
    revenue,
    new_paying_orgs,
    canceled_orgs,
    upgraded_orgs,
    trial_extension_stats,
    past_due_org_stats,
    credits_bought,
    credits_consumed,
    demo_apps_created,
    plugin_breakdown,
    build_stats,
    retention_metrics,
    paid_product_activity_stats,
    ltv_stats,
  ] = await Promise.all([
    res.apps,
    res.updates,
    res.updates_external,
    res.users,
    res.orgs,
    res.stars,
    res.customers,
    res.paying_orgs_for_conversion,
    res.onboarded,
    res.need_upgrade,
    res.plans,
    res.actives,
    res.updates_last_month,
    res.devices_last_month,
    res.devices_by_platform,
    res.registers_today,
    res.bundle_storage_gb,
    res.success_rate,
    res.revenue,
    res.new_paying_orgs,
    res.canceled_orgs,
    res.upgraded_orgs,
    res.trial_extension_stats,
    res.past_due_org_stats,
    res.credits_bought,
    res.credits_consumed,
    res.demo_apps_created,
    res.plugin_breakdown,
    res.build_stats,
    Promise.resolve(res.retention_metrics).catch((error: unknown) => {
      cloudlogErr({ requestId: c.get('requestId'), message: 'retention metrics unavailable', error })
      return null
    }),
    res.paid_product_activity_stats,
    res.ltv_stats,
  ])
  const not_paying = users - customers.total - plans.Trial
  const org_conversion_rate = calculateConversionRate(paying_orgs_for_conversion, orgs)
  const planConversionRates = getPlanConversionRates(plans, orgs)
  cloudlog({
    requestId: c.get('requestId'),
    message: 'All Promises',
    apps,
    updates,
    updates_external,
    users,
    stars,
    customers,
    paying_orgs_for_conversion,
    onboarded,
    need_upgrade,
    plans,
    updates_last_month,
    devices_last_month,
    registers_today,
    bundle_storage_gb,
    demo_apps_created,
    trial_extension_stats,
  })
  // cloudlog(c.get('requestId'), 'app', app.app_id, downloads, versions, shared, channels)
  const newData: Database['public']['Tables']['global_stats']['Insert'] = {
    date_id: snapshotDateId,
    apps,
    trial: plans.Trial,
    users,
    updates,
    updates_external,
    apps_active: actives.apps,
    users_active: actives.users,
    stars,
    paying: customers.total,
    org_conversion_rate,
    plan_total_conversion_rate: planConversionRates.total,
    plan_solo_conversion_rate: planConversionRates.solo,
    plan_maker_conversion_rate: planConversionRates.maker,
    plan_team_conversion_rate: planConversionRates.team,
    plan_enterprise_conversion_rate: planConversionRates.enterprise,
    paying_yearly: customers.yearly,
    paying_monthly: customers.monthly,
    onboarded,
    need_upgrade,
    not_paying,
    updates_last_month,
    devices_last_month,
    devices_last_month_ios: devices_by_platform.ios,
    devices_last_month_android: devices_by_platform.android,
    registers_today,
    bundle_storage_gb,
    success_rate,
    plan_solo: plans.Solo,
    plan_maker: plans.Maker,
    plan_team: plans.Team,
    plan_enterprise: plans.Enterprise || 0,
    // Revenue metrics
    mrr: revenue.mrr,
    total_revenue: revenue.total_revenue,
    revenue_solo: revenue.revenue_solo,
    revenue_maker: revenue.revenue_maker,
    revenue_team: revenue.revenue_team,
    revenue_enterprise: revenue.revenue_enterprise,
    plan_solo_monthly: revenue.plan_solo_monthly,
    plan_solo_yearly: revenue.plan_solo_yearly,
    plan_maker_monthly: revenue.plan_maker_monthly,
    plan_maker_yearly: revenue.plan_maker_yearly,
    plan_team_monthly: revenue.plan_team_monthly,
    plan_team_yearly: revenue.plan_team_yearly,
    plan_enterprise_monthly: revenue.plan_enterprise_monthly,
    plan_enterprise_yearly: revenue.plan_enterprise_yearly,
    // Subscription flow tracking
    new_paying_orgs,
    past_due_orgs: past_due_org_stats.past_due_orgs,
    past_due_orgs_average_days: past_due_org_stats.past_due_orgs_average_days,
    canceled_orgs,
    upgraded_orgs,
    trial_extended_orgs: trial_extension_stats.trial_extended_orgs,
    trial_extended_subscribed_orgs: trial_extension_stats.trial_extended_subscribed_orgs,
    // Credits tracking (round to integers for bigint column)
    credits_bought: Math.round(credits_bought),
    credits_consumed: Math.round(credits_consumed),
    demo_apps_created,
    // Plugin version breakdown (percentage per version)
    plugin_version_breakdown: plugin_breakdown.version_breakdown,
    plugin_major_breakdown: plugin_breakdown.major_breakdown,
    plugin_version_ladder: plugin_breakdown.version_ladder as unknown as Json,
    builder_active_paying_clients_60d: paid_product_activity_stats.builder_active_paying_clients_60d,
    live_updates_active_paying_clients_60d: paid_product_activity_stats.live_updates_active_paying_clients_60d,
    average_ltv: ltv_stats.average_ltv,
    shortest_ltv: ltv_stats.shortest_ltv,
    longest_ltv: ltv_stats.longest_ltv,
    // Build statistics (all time)
    builds_total: build_stats.total,
    builds_ios: build_stats.ios,
    builds_android: build_stats.android,
    builds_success_total: build_stats.success_total,
    builds_success_ios: build_stats.success_ios,
    builds_success_android: build_stats.success_android,
    // Build statistics (last 30 days)
    builds_last_month: build_stats.last_month,
    builds_last_month_ios: build_stats.last_month_ios,
    builds_last_month_android: build_stats.last_month_android,
    ...(retention_metrics
      ? {
          churn_revenue: retention_metrics.churnRevenue,
          churn_revenue_solo: retention_metrics.churnRevenueSolo,
          churn_revenue_maker: retention_metrics.churnRevenueMaker,
          churn_revenue_team: retention_metrics.churnRevenueTeam,
          churn_revenue_enterprise: retention_metrics.churnRevenueEnterprise,
          nrr: retention_metrics.nrr,
        }
      : {}),
  }
  cloudlog({ requestId: c.get('requestId'), message: 'newData', newData })
  const { error } = await supabaseAdmin(c)
    .from('global_stats')
    .upsert(newData)
  if (error)
    cloudlogErr({ requestId: c.get('requestId'), message: 'insert global_stats error', error })
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
      .eq('date_id', dailyWindow.prevDayDateId)

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
          .eq('date_id', dailyWindow.prevDayDateId)

        if (legacyBuildMetricsError) {
          cloudlogErr({ requestId: c.get('requestId'), message: 'legacy update build metrics error', error: legacyBuildMetricsError })
        }
      }
      else {
        cloudlogErr({ requestId: c.get('requestId'), message: 'update build metrics error', error: buildMetricsError })
      }
    }
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'Skipping build metric update because daily aggregation failed' })
  }
  await sendEventToTracking(c, {
    channel: 'updates-stats',
    event: 'Updates last month',
    user_id: 'admin',
    tags: {
      updates_last_month,
      success_rate,
      registers_today,
      storage_gb: bundle_storage_gb,
      org_conversion_rate,
    },
    icon: '📲',
  }).catch((e: any) => {
    cloudlogErr({ requestId: c.get('requestId'), message: 'insights error', e })
  })
  await logsnagInsights(c, [
    {
      title: 'Apps',
      value: apps,
      icon: '📱',
    },
    {
      title: 'Active Apps',
      value: actives.apps,
      icon: '💃',
    },
    {
      title: 'Updates',
      value: updates,
      icon: '📲',
    },
    {
      title: 'Updates on premises',
      value: updates_external,
      icon: '📲',
    },
    {
      title: 'Updates last month',
      value: updates_last_month,
      icon: '📲',
    },
    {
      title: 'Bundle Storage (GB)',
      value: `${bundle_storage_gb.toFixed(2)} GB`,
      icon: '💾',
    },
    {
      title: 'Total Users',
      value: users,
      icon: '👨',
    },
    {
      title: 'Active Users',
      value: actives.users,
      icon: '🎉',
    },
    {
      title: 'Registrations Today',
      value: registers_today,
      icon: '🆕',
    },
    {
      title: 'User onboarded',
      value: onboarded,
      icon: '✅',
    },
    {
      title: 'Orgs',
      value: orgs,
      icon: '🏢',
    },
    {
      title: 'Orgs with trial',
      value: plans.Trial,
      icon: '👶',
    },
    {
      title: 'Orgs paying',
      value: customers.total,
      icon: '💰',
    },
    {
      title: 'Org conversion rate',
      value: `${org_conversion_rate.toFixed(1)}%`,
      icon: '🎯',
    },
    {
      title: 'Orgs yearly',
      value: `${(customers.yearly * 100 / customers.total).toFixed(0)}% - ${customers.yearly}`,
      icon: '🧧',
    },
    {
      title: 'Orgs monthly',
      value: `${(customers.monthly * 100 / customers.total).toFixed(0)}% - ${customers.monthly}`,
      icon: '🗓️',
    },
    {
      title: 'Orgs not paying',
      value: not_paying,
      icon: '🥲',
    },
    {
      title: 'Orgs need upgrade',
      value: need_upgrade,
      icon: '🤒',
    },
    {
      title: 'Orgs Solo Plan',
      value: `${(plans.Solo * 100 / customers.total).toFixed(0)}% - ${plans.Solo}`,
      icon: '🎸',
    },
    {
      title: 'Orgs Maker Plan',
      value: `${(plans.Maker * 100 / customers.total).toFixed(0)}% - ${plans.Maker}`,
      icon: '🤝',
    },
    {
      title: 'Orgs Team Plan',
      value: `${(plans.Team * 100 / customers.total).toFixed(0)}% - ${plans.Team}`,
      icon: '👏',
    },
    {
      title: 'Orgs Enterprise Plan',
      value: `${((plans.Enterprise || 0) * 100 / customers.total).toFixed(0)}% - ${plans.Enterprise || 0}`,
      icon: '📈',
    },
    {
      title: 'Devices iOS (30d)',
      value: devices_by_platform.ios,
      icon: '🍎',
    },
    {
      title: 'Devices Android (30d)',
      value: devices_by_platform.android,
      icon: '🤖',
    },
    {
      title: 'Total Builds',
      value: build_stats.total,
      icon: '🔨',
    },
    {
      title: 'iOS Builds',
      value: build_stats.ios,
      icon: '🍏',
    },
    {
      title: 'Android Builds',
      value: build_stats.android,
      icon: '🤖',
    },
    {
      title: 'Builds (30d)',
      value: build_stats.last_month,
      icon: '🔨',
    },
    {
      title: 'iOS Builds (30d)',
      value: build_stats.last_month_ios,
      icon: '🍏',
    },
    {
      title: 'Android Builds (30d)',
      value: build_stats.last_month_android,
      icon: '🤖',
    },
  ]).catch((e) => {
    cloudlogErr({ requestId: c.get('requestId'), message: 'insights error', e })
  })
  cloudlog({ requestId: c.get('requestId'), message: 'Sent to logsnag done' })

  // Note: Device cleanup is no longer needed as Analytics Engine handles data retention automatically

  return c.json(BRES)
})
