/*
 * Backfill admin revenue dashboard metrics stored in public.global_stats.
 *
 * Covers Subscription Type, Subscription Flow, MRR, ARR, ARR by Plan,
 * Churn Revenue - Lost MRR, Total Paying Organizations, and upgraded orgs.
 *
 * Dry run, defaulting to the last 30 UTC calendar days:
 *   bun run stripe:backfill-admin-revenue-dashboard
 *
 * Apply a date range:
 *   bun run stripe:backfill-admin-revenue-dashboard --apply --from=2026-04-01 --to=2026-04-30
 *
 * Older history should use an exported Stripe events JSON file that includes
 * enough pre-range subscription events to seed the opening state:
 *   bun run stripe:backfill-admin-revenue-dashboard --events-file=./tmp/stripe-events.json --from=2026-01-01 --to=2026-04-30
 */
import type Stripe from 'stripe'
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import {
  asyncPool,
  createStripeClient,
  createSupabaseServiceClient,
  DEFAULT_ENV_FILE,
  getArgValue,
  getRequiredEnv,
  loadEnv,
  parsePositiveInteger,
} from './admin_stripe_backfill_utils.ts'

const DEFAULT_LOOKBACK_DAYS = 30
const DEFAULT_CONCURRENCY = 10
const DEFAULT_PAGE_SIZE = 1000
const STRIPE_PAGE_SIZE = 100
const DATE_ID_REGEX = /^\d{4}-\d{2}-\d{2}$/
const SUBSCRIPTION_EVENT_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const
const PLAN_NAMES = ['Solo', 'Maker', 'Team', 'Enterprise'] as const

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>
type GlobalStatsRow = Pick<
  Database['public']['Tables']['global_stats']['Row'],
  | 'canceled_orgs'
  | 'churn_revenue'
  | 'churn_revenue_enterprise'
  | 'churn_revenue_maker'
  | 'churn_revenue_solo'
  | 'churn_revenue_team'
  | 'date_id'
  | 'mrr'
  | 'new_paying_orgs'
  | 'paying'
  | 'paying_monthly'
  | 'paying_yearly'
  | 'plan_enterprise'
  | 'plan_enterprise_monthly'
  | 'plan_enterprise_yearly'
  | 'plan_maker'
  | 'plan_maker_monthly'
  | 'plan_maker_yearly'
  | 'plan_solo'
  | 'plan_solo_monthly'
  | 'plan_solo_yearly'
  | 'plan_team'
  | 'plan_team_monthly'
  | 'plan_team_yearly'
  | 'revenue_enterprise'
  | 'revenue_maker'
  | 'revenue_solo'
  | 'revenue_team'
  | 'total_revenue'
  | 'upgraded_orgs'
>
type GlobalStatsUpdate = Database['public']['Tables']['global_stats']['Update']
type PlanRow = Pick<Database['public']['Tables']['plans']['Row'], 'name' | 'price_m' | 'price_m_id' | 'price_y' | 'price_y_id'>
type SubscriptionEventType = typeof SUBSCRIPTION_EVENT_TYPES[number]
type PlanName = typeof PLAN_NAMES[number]
type PlanKey = Lowercase<PlanName>
type BillingInterval = 'monthly' | 'yearly'

interface PriceLookupEntry {
  interval: BillingInterval
  mrr: number
  plan: PlanKey
}

interface RevenueSubscriptionState {
  activeUntilSeconds: number | null
  customerId: string
  interval: BillingInterval | null
  mrr: number
  plan: PlanKey | null
  priceId: string
  subscriptionId: string
}

interface DailyCounters {
  canceledCustomerIds: Set<string>
  churnRevenue: number
  churnRevenueByPlan: Record<PlanKey, number>
  newCustomerIds: Set<string>
  upgradedCustomerIds: Set<string>
}

export interface RevenueTrendMetricValues {
  canceled_orgs: number
  churn_revenue: number
  churn_revenue_enterprise: number
  churn_revenue_maker: number
  churn_revenue_solo: number
  churn_revenue_team: number
  mrr: number
  new_paying_orgs: number
  paying: number
  paying_monthly: number
  paying_yearly: number
  plan_enterprise: number
  plan_enterprise_monthly: number
  plan_enterprise_yearly: number
  plan_maker: number
  plan_maker_monthly: number
  plan_maker_yearly: number
  plan_solo: number
  plan_solo_monthly: number
  plan_solo_yearly: number
  plan_team: number
  plan_team_monthly: number
  plan_team_yearly: number
  revenue_enterprise: number
  revenue_maker: number
  revenue_solo: number
  revenue_team: number
  total_revenue: number
  upgraded_orgs: number
}

export interface RevenueTrendBackfillRow extends RevenueTrendMetricValues {
  changed: boolean
  current: Partial<RevenueTrendMetricValues>
  date_id: string
}

interface BuildRevenueTrendRowsOptions {
  baselineSubscriptions?: Stripe.Subscription[]
  customerId?: string | null
  events: Stripe.Event[]
  fromDateId: string
  plans: PlanRow[]
  toDateId: string
}

function getDateId(targetDate = new Date()) {
  return new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())).toISOString().slice(0, 10)
}

function assertDateId(value: string, label: string) {
  if (!DATE_ID_REGEX.test(value))
    throw new Error(`${label} must use YYYY-MM-DD`)

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be a valid UTC date`)

  return value
}

function getDefaultFromDateId(referenceDate = new Date()) {
  const date = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()))
  date.setUTCDate(date.getUTCDate() - DEFAULT_LOOKBACK_DAYS + 1)
  return getDateId(date)
}

function getDateIdsBetween(fromDateId: string, toDateId: string) {
  const dates: string[] = []
  const cursor = new Date(`${fromDateId}T00:00:00.000Z`)
  const end = new Date(`${toDateId}T00:00:00.000Z`)

  while (cursor.getTime() <= end.getTime()) {
    dates.push(getDateId(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

function dateIdToStartSeconds(dateId: string) {
  return Math.floor(new Date(`${dateId}T00:00:00.000Z`).getTime() / 1000)
}

function dateIdToEndSeconds(dateId: string) {
  return Math.floor(new Date(`${dateId}T23:59:59.999Z`).getTime() / 1000)
}

function compareDateIds(left: string, right: string) {
  return left.localeCompare(right)
}

function toMetricNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function createEmptyMetrics(): RevenueTrendMetricValues {
  return {
    canceled_orgs: 0,
    churn_revenue: 0,
    churn_revenue_enterprise: 0,
    churn_revenue_maker: 0,
    churn_revenue_solo: 0,
    churn_revenue_team: 0,
    mrr: 0,
    new_paying_orgs: 0,
    paying: 0,
    paying_monthly: 0,
    paying_yearly: 0,
    plan_enterprise: 0,
    plan_enterprise_monthly: 0,
    plan_enterprise_yearly: 0,
    plan_maker: 0,
    plan_maker_monthly: 0,
    plan_maker_yearly: 0,
    plan_solo: 0,
    plan_solo_monthly: 0,
    plan_solo_yearly: 0,
    plan_team: 0,
    plan_team_monthly: 0,
    plan_team_yearly: 0,
    revenue_enterprise: 0,
    revenue_maker: 0,
    revenue_solo: 0,
    revenue_team: 0,
    total_revenue: 0,
    upgraded_orgs: 0,
  }
}

function isSubscriptionEventType(type: string): type is SubscriptionEventType {
  return SUBSCRIPTION_EVENT_TYPES.includes(type as SubscriptionEventType)
}

function getEventDateId(event: Stripe.Event) {
  return getDateId(new Date(event.created * 1000))
}

function sortStripeEvents(events: Stripe.Event[]) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      if (left.event.created !== right.event.created)
        return left.event.created - right.event.created
      return left.index - right.index
    })
    .map(item => item.event)
}

function parseStripeEventCreatedSeconds(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value))
    return value

  if (typeof value !== 'string')
    return null

  const numericValue = Number(value)
  if (Number.isFinite(numericValue))
    return numericValue

  const parsedDate = Date.parse(value)
  if (Number.isNaN(parsedDate))
    return null

  return Math.floor(parsedDate / 1000)
}

function toStripeId(value: unknown) {
  if (!value)
    return null
  if (typeof value === 'string')
    return value
  if (typeof value === 'object' && 'id' in value && typeof value.id === 'string')
    return value.id
  return null
}

function getPlanKey(name: string): PlanKey | null {
  const normalized = name.toLowerCase()
  if (normalized === 'solo' || normalized === 'maker' || normalized === 'team' || normalized === 'enterprise')
    return normalized
  return null
}

function buildPriceLookup(plans: PlanRow[]) {
  const lookup = new Map<string, PriceLookupEntry>()

  for (const plan of plans) {
    const planKey = getPlanKey(plan.name)
    if (!planKey)
      continue

    const monthlyPriceId = plan.price_m_id?.trim()
    if (monthlyPriceId) {
      lookup.set(monthlyPriceId, {
        interval: 'monthly',
        mrr: Number(plan.price_m) || 0,
        plan: planKey,
      })
    }

    const yearlyPriceId = plan.price_y_id?.trim()
    if (yearlyPriceId) {
      lookup.set(yearlyPriceId, {
        interval: 'yearly',
        mrr: (Number(plan.price_y) || 0) / 12,
        plan: planKey,
      })
    }
  }

  return lookup
}

function getSubscriptionItems(subscription: Stripe.Subscription) {
  return subscription.items?.data as Stripe.SubscriptionItem[] | undefined
}

function getPreviousSubscriptionItems(event: Stripe.Event) {
  const previousAttributes = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined
  return previousAttributes?.items?.data as Stripe.SubscriptionItem[] | undefined
}

function getLicensedSubscriptionItem(items: Stripe.SubscriptionItem[] | undefined) {
  return items?.find(item => item.plan?.usage_type === 'licensed') ?? items?.[0] ?? null
}

function getItemPriceId(item: Stripe.SubscriptionItem | null | undefined) {
  if (!item)
    return null

  return item.plan?.id ?? toStripeId(item.price) ?? null
}

function getItemBillingInterval(item: Stripe.SubscriptionItem | null | undefined): BillingInterval | null {
  const priceInterval = (item?.price as { recurring?: { interval?: unknown } } | undefined)?.recurring?.interval
  const planInterval = (item?.plan as { interval?: unknown } | undefined)?.interval
  const interval = priceInterval ?? planInterval

  if (interval === 'month')
    return 'monthly'
  if (interval === 'year')
    return 'yearly'

  return null
}

function getLookupOrItemBillingInterval(item: Stripe.SubscriptionItem | null | undefined, priceLookup: Map<string, PriceLookupEntry>): BillingInterval | null {
  const priceId = getItemPriceId(item)
  return (priceId ? priceLookup.get(priceId)?.interval : null) ?? getItemBillingInterval(item)
}

function getItemPeriodEndSeconds(item: Stripe.SubscriptionItem | null | undefined) {
  const periodEnd = (item as { current_period_end?: number } | null | undefined)?.current_period_end
  return typeof periodEnd === 'number' && Number.isFinite(periodEnd) ? periodEnd : null
}

function getSubscriptionEndSeconds(subscription: Stripe.Subscription, item: Stripe.SubscriptionItem | null, fallbackSeconds: number | null) {
  const itemPeriodEnd = getItemPeriodEndSeconds(item)
  const endedAt = typeof subscription.ended_at === 'number' ? subscription.ended_at : null
  const canceledAt = typeof subscription.canceled_at === 'number' ? subscription.canceled_at : null
  const cancelAt = typeof subscription.cancel_at === 'number' ? subscription.cancel_at : null

  if (itemPeriodEnd && itemPeriodEnd > (fallbackSeconds ?? 0))
    return itemPeriodEnd
  return endedAt ?? cancelAt ?? canceledAt ?? fallbackSeconds
}

function isRevenueActiveStatus(status: unknown) {
  return status === 'active'
    || status === 'trialing'
    || status === 'past_due'
    || status === 'unpaid'
    || status === 'succeeded'
}

function isInactiveStatus(status: unknown) {
  return status === 'canceled'
    || status === 'deleted'
    || status === 'incomplete'
    || status === 'incomplete_expired'
    || status === 'paused'
}

function getPreviousSubscriptionStatus(event: Stripe.Event) {
  const previousAttributes = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined
  if (!previousAttributes || !Object.hasOwn(previousAttributes, 'status'))
    return { hasStatus: false, status: null as unknown }

  return {
    hasStatus: true,
    status: previousAttributes.status,
  }
}

function buildStateFromSubscription(
  subscription: Stripe.Subscription,
  priceLookup: Map<string, PriceLookupEntry>,
  options: {
    activeAtSeconds?: number
    eventSeconds?: number
    forceActive?: boolean
    item?: Stripe.SubscriptionItem | null
    status?: unknown
  } = {},
): RevenueSubscriptionState | null {
  const customerId = toStripeId(subscription.customer)
  if (!customerId || !subscription.id)
    return null

  const item = Object.hasOwn(options, 'item')
    ? options.item ?? null
    : getLicensedSubscriptionItem(getSubscriptionItems(subscription))
  const priceId = getItemPriceId(item)
  if (!priceId)
    return null

  const price = priceLookup.get(priceId) ?? null
  const interval = price?.interval ?? getLookupOrItemBillingInterval(item, priceLookup)

  const status = options.status ?? subscription.status
  const eventSeconds = options.eventSeconds ?? null
  const activeAtSeconds = options.activeAtSeconds ?? eventSeconds ?? null
  const endSeconds = getSubscriptionEndSeconds(subscription, item, eventSeconds)
  const activeByStatus = isRevenueActiveStatus(status)
  const activeByFutureEnd = Boolean(
    activeAtSeconds
    && endSeconds
    && endSeconds > activeAtSeconds
    && (status === 'canceled' || status === 'deleted'),
  )
  const active = options.forceActive || activeByStatus || activeByFutureEnd
  if (!active || (isInactiveStatus(status) && !activeByFutureEnd && !options.forceActive))
    return null

  return {
    activeUntilSeconds: endSeconds && !activeByStatus ? endSeconds : subscription.cancel_at_period_end ? endSeconds : null,
    customerId,
    interval,
    mrr: price?.mrr ?? 0,
    plan: price?.plan ?? null,
    priceId,
    subscriptionId: subscription.id,
  }
}

function buildPreviousStateFromEvent(event: Stripe.Event, priceLookup: Map<string, PriceLookupEntry>) {
  if (!isSubscriptionEventType(event.type))
    return null

  const subscription = event.data.object as Stripe.Subscription
  if (!subscription.id)
    return null

  if (event.type === 'customer.subscription.created')
    return null

  const eventSeconds = event.created
  const previousItem = getLicensedSubscriptionItem(getPreviousSubscriptionItems(event))
  const previousStatus = getPreviousSubscriptionStatus(event)
  const currentItem = getLicensedSubscriptionItem(getSubscriptionItems(subscription))
  const item = previousItem ?? (previousStatus.hasStatus && isRevenueActiveStatus(previousStatus.status) ? currentItem : null)

  if (event.type === 'customer.subscription.deleted') {
    return buildStateFromSubscription(subscription, priceLookup, {
      activeAtSeconds: eventSeconds,
      eventSeconds,
      forceActive: true,
      item: currentItem,
      status: 'active',
    })
  }

  if (!item && !previousStatus.hasStatus)
    return null

  return buildStateFromSubscription(subscription, priceLookup, {
    activeAtSeconds: eventSeconds,
    eventSeconds,
    item,
    status: previousStatus.hasStatus ? previousStatus.status : 'active',
  })
}

function buildNextStateFromEvent(event: Stripe.Event, priceLookup: Map<string, PriceLookupEntry>) {
  const subscription = event.data.object as Stripe.Subscription
  return buildStateFromSubscription(subscription, priceLookup, {
    activeAtSeconds: event.created,
    eventSeconds: event.created,
  })
}

function getStateKey(state: Pick<RevenueSubscriptionState, 'subscriptionId'>) {
  return state.subscriptionId
}

function createDailyCounters(): DailyCounters {
  return {
    canceledCustomerIds: new Set<string>(),
    churnRevenue: 0,
    churnRevenueByPlan: {
      solo: 0,
      maker: 0,
      team: 0,
      enterprise: 0,
    },
    newCustomerIds: new Set<string>(),
    upgradedCustomerIds: new Set<string>(),
  }
}

function recordTransition(
  daily: DailyCounters | null,
  seenPaidCustomerIds: Set<string>,
  currentState: RevenueSubscriptionState | null,
  nextState: RevenueSubscriptionState | null,
  options: { cadenceUpgrade?: boolean } = {},
) {
  const currentMrr = currentState?.mrr ?? 0
  const nextMrr = nextState?.mrr ?? 0
  const currentActive = Boolean(currentState)
  const nextActive = Boolean(nextState)
  const customerId = nextState?.customerId ?? currentState?.customerId
  if (!customerId)
    return

  if (daily && nextActive && options.cadenceUpgrade)
    daily.upgradedCustomerIds.add(customerId)

  if (!currentActive && nextActive) {
    if (!seenPaidCustomerIds.has(customerId)) {
      daily?.newCustomerIds.add(customerId)
      seenPaidCustomerIds.add(customerId)
    }
    return
  }

  if (!daily)
    return

  const isRevenueUpgrade = currentMrr > 0 && nextMrr > currentMrr
  const isCadenceUpgrade = options.cadenceUpgrade || (currentState?.interval === 'monthly' && nextState?.interval === 'yearly')
  if (currentActive && nextActive && (isRevenueUpgrade || isCadenceUpgrade))
    daily.upgradedCustomerIds.add(customerId)

  if (currentActive && !nextActive) {
    daily.canceledCustomerIds.add(customerId)
    daily.churnRevenue += currentMrr
    if (currentState?.plan)
      daily.churnRevenueByPlan[currentState.plan] += currentMrr
    return
  }

  if (currentMrr > nextMrr) {
    const lostMrr = currentMrr - nextMrr
    daily.churnRevenue += lostMrr
    if (currentState?.plan)
      daily.churnRevenueByPlan[currentState.plan] += lostMrr
  }
}

function applySubscriptionEventToStates(
  states: Map<string, RevenueSubscriptionState>,
  seenPaidCustomerIds: Set<string>,
  event: Stripe.Event,
  priceLookup: Map<string, PriceLookupEntry>,
  daily: DailyCounters | null,
) {
  if (!isSubscriptionEventType(event.type))
    return

  const subscription = event.data.object as Stripe.Subscription
  const subscriptionId = subscription.id
  if (!subscriptionId)
    return

  const existingState = states.get(subscriptionId) ?? null
  const previousState = existingState ?? buildPreviousStateFromEvent(event, priceLookup)
  const nextState = buildNextStateFromEvent(event, priceLookup)
  const previousInterval = previousState?.interval ?? getLookupOrItemBillingInterval(getLicensedSubscriptionItem(getPreviousSubscriptionItems(event)), priceLookup)
  const nextInterval = nextState?.interval ?? getLookupOrItemBillingInterval(getLicensedSubscriptionItem(getSubscriptionItems(subscription)), priceLookup)

  recordTransition(daily, seenPaidCustomerIds, previousState, nextState, {
    cadenceUpgrade: previousInterval === 'monthly' && nextInterval === 'yearly',
  })

  if (nextState)
    states.set(getStateKey(nextState), nextState)
  else
    states.delete(subscriptionId)
}

function seedBaselineStatesFromSubscriptions(
  states: Map<string, RevenueSubscriptionState>,
  seenPaidCustomerIds: Set<string>,
  subscriptions: Stripe.Subscription[],
  priceLookup: Map<string, PriceLookupEntry>,
  fromDateId: string,
  customerId?: string | null,
) {
  const fromStartSeconds = dateIdToStartSeconds(fromDateId)

  for (const subscription of subscriptions) {
    const state = buildStateFromSubscription(subscription, priceLookup, {
      activeAtSeconds: fromStartSeconds,
    })
    if (!state)
      continue
    if (customerId && state.customerId !== customerId)
      continue
    if (subscription.created >= fromStartSeconds)
      continue
    states.set(getStateKey(state), state)
    seenPaidCustomerIds.add(state.customerId)
  }
}

function replayPreRangeEvents(
  states: Map<string, RevenueSubscriptionState>,
  seenPaidCustomerIds: Set<string>,
  events: Stripe.Event[],
  priceLookup: Map<string, PriceLookupEntry>,
  fromDateId: string,
  customerId?: string | null,
) {
  for (const event of sortStripeEvents(events)) {
    if (compareDateIds(getEventDateId(event), fromDateId) >= 0)
      continue

    const subscription = event.data.object as Stripe.Subscription
    const eventCustomerId = toStripeId(subscription.customer)
    if (customerId && eventCustomerId !== customerId)
      continue

    applySubscriptionEventToStates(states, seenPaidCustomerIds, event, priceLookup, null)
  }
}

function seedOpeningStateFromFirstRangeEvents(
  states: Map<string, RevenueSubscriptionState>,
  seenPaidCustomerIds: Set<string>,
  events: Stripe.Event[],
  priceLookup: Map<string, PriceLookupEntry>,
  fromDateId: string,
  toDateId: string,
  customerId?: string | null,
) {
  const seenSubscriptionIds = new Set<string>()
  const fromStartSeconds = dateIdToStartSeconds(fromDateId)

  for (const event of sortStripeEvents(events)) {
    const dateId = getEventDateId(event)
    if (compareDateIds(dateId, fromDateId) < 0 || compareDateIds(dateId, toDateId) > 0)
      continue

    const subscription = event.data.object as Stripe.Subscription
    const eventCustomerId = toStripeId(subscription.customer)
    if (customerId && eventCustomerId !== customerId)
      continue
    if (!subscription.id || seenSubscriptionIds.has(subscription.id))
      continue

    seenSubscriptionIds.add(subscription.id)
    if (subscription.created >= fromStartSeconds)
      continue

    const previousState = buildPreviousStateFromEvent(event, priceLookup)
    if (previousState) {
      states.set(getStateKey(previousState), previousState)
      seenPaidCustomerIds.add(previousState.customerId)
    }
  }
}

function expireStatesForDate(states: Map<string, RevenueSubscriptionState>, dateId: string, daily: DailyCounters) {
  const dayStartSeconds = dateIdToStartSeconds(dateId)
  const dayEndSeconds = dateIdToEndSeconds(dateId)

  for (const state of [...states.values()]) {
    if (!state.activeUntilSeconds)
      continue
    if (state.activeUntilSeconds < dayStartSeconds || state.activeUntilSeconds > dayEndSeconds)
      continue

    daily.canceledCustomerIds.add(state.customerId)
    daily.churnRevenue += state.mrr
    if (state.plan)
      daily.churnRevenueByPlan[state.plan] += state.mrr
    states.delete(getStateKey(state))
  }
}

export function summarizeRevenueSnapshot(states: Iterable<RevenueSubscriptionState>, daily: DailyCounters = createDailyCounters()): RevenueTrendMetricValues {
  const metrics = createEmptyMetrics()
  const payingCustomerIds = new Set<string>()

  for (const state of states) {
    payingCustomerIds.add(state.customerId)
    metrics.mrr += state.mrr

    if (state.interval === 'monthly')
      metrics.paying_monthly++
    else if (state.interval === 'yearly')
      metrics.paying_yearly++

    if (!state.plan)
      continue

    if (state.plan === 'solo') {
      metrics.plan_solo++
      if (state.interval === 'monthly')
        metrics.plan_solo_monthly++
      else
        metrics.plan_solo_yearly++
      metrics.revenue_solo += state.mrr * 12
    }
    else if (state.plan === 'maker') {
      metrics.plan_maker++
      if (state.interval === 'monthly')
        metrics.plan_maker_monthly++
      else
        metrics.plan_maker_yearly++
      metrics.revenue_maker += state.mrr * 12
    }
    else if (state.plan === 'team') {
      metrics.plan_team++
      if (state.interval === 'monthly')
        metrics.plan_team_monthly++
      else
        metrics.plan_team_yearly++
      metrics.revenue_team += state.mrr * 12
    }
    else {
      metrics.plan_enterprise++
      if (state.interval === 'monthly')
        metrics.plan_enterprise_monthly++
      else
        metrics.plan_enterprise_yearly++
      metrics.revenue_enterprise += state.mrr * 12
    }
  }

  metrics.new_paying_orgs = daily.newCustomerIds.size
  metrics.canceled_orgs = daily.canceledCustomerIds.size
  metrics.churn_revenue = daily.churnRevenue
  metrics.paying = payingCustomerIds.size
  metrics.upgraded_orgs = daily.upgradedCustomerIds.size
  metrics.churn_revenue_solo = daily.churnRevenueByPlan.solo
  metrics.churn_revenue_maker = daily.churnRevenueByPlan.maker
  metrics.churn_revenue_team = daily.churnRevenueByPlan.team
  metrics.churn_revenue_enterprise = daily.churnRevenueByPlan.enterprise
  metrics.mrr = roundMoney(metrics.mrr)
  metrics.total_revenue = roundMoney(metrics.mrr * 12)
  metrics.revenue_solo = roundMoney(metrics.revenue_solo)
  metrics.revenue_maker = roundMoney(metrics.revenue_maker)
  metrics.revenue_team = roundMoney(metrics.revenue_team)
  metrics.revenue_enterprise = roundMoney(metrics.revenue_enterprise)
  metrics.churn_revenue = roundMoney(metrics.churn_revenue)
  metrics.churn_revenue_solo = roundMoney(metrics.churn_revenue_solo)
  metrics.churn_revenue_maker = roundMoney(metrics.churn_revenue_maker)
  metrics.churn_revenue_team = roundMoney(metrics.churn_revenue_team)
  metrics.churn_revenue_enterprise = roundMoney(metrics.churn_revenue_enterprise)

  return metrics
}

function valuesChanged(current: Partial<Record<keyof RevenueTrendMetricValues, number | null | undefined>>, next: RevenueTrendMetricValues) {
  for (const [key, value] of Object.entries(next) as Array<[keyof RevenueTrendMetricValues, number]>) {
    if (Math.abs(toMetricNumber(current[key]) - value) > 0.0001)
      return true
  }
  return false
}

export function buildRevenueTrendBackfillRows(
  existingRows: GlobalStatsRow[],
  options: BuildRevenueTrendRowsOptions,
): RevenueTrendBackfillRow[] {
  const existingRowsByDateId = new Map(existingRows.map(row => [row.date_id, row]))
  const priceLookup = buildPriceLookup(options.plans)
  const states = new Map<string, RevenueSubscriptionState>()
  const seenPaidCustomerIds = new Set<string>()
  const sortedEvents = sortStripeEvents(options.events)

  seedBaselineStatesFromSubscriptions(states, seenPaidCustomerIds, options.baselineSubscriptions ?? [], priceLookup, options.fromDateId, options.customerId)
  replayPreRangeEvents(states, seenPaidCustomerIds, sortedEvents, priceLookup, options.fromDateId, options.customerId)
  seedOpeningStateFromFirstRangeEvents(states, seenPaidCustomerIds, sortedEvents, priceLookup, options.fromDateId, options.toDateId, options.customerId)

  const eventsByDateId = new Map<string, Stripe.Event[]>()
  for (const event of sortedEvents) {
    const dateId = getEventDateId(event)
    if (compareDateIds(dateId, options.fromDateId) < 0 || compareDateIds(dateId, options.toDateId) > 0)
      continue

    const subscription = event.data.object as Stripe.Subscription
    const eventCustomerId = toStripeId(subscription.customer)
    if (options.customerId && eventCustomerId !== options.customerId)
      continue

    const eventsForDate = eventsByDateId.get(dateId) ?? []
    eventsForDate.push(event)
    eventsByDateId.set(dateId, eventsForDate)
  }

  const rows: RevenueTrendBackfillRow[] = []
  for (const dateId of getDateIdsBetween(options.fromDateId, options.toDateId)) {
    const daily = createDailyCounters()
    for (const event of eventsByDateId.get(dateId) ?? [])
      applySubscriptionEventToStates(states, seenPaidCustomerIds, event, priceLookup, daily)

    expireStatesForDate(states, dateId, daily)

    const next = summarizeRevenueSnapshot(states.values(), daily)
    const current = existingRowsByDateId.get(dateId) ?? null
    rows.push({
      ...next,
      changed: !current || valuesChanged(current, next),
      current: current
        ? Object.fromEntries(Object.keys(next).map(key => [key, toMetricNumber(current[key as keyof RevenueTrendMetricValues])]))
        : {},
      date_id: dateId,
    })
  }

  return rows
}

function normalizeStripeEventFromFile(event: unknown, index: number): Stripe.Event {
  if (typeof event !== 'object' || event === null)
    throw new Error(`--events-file contains malformed Stripe event at index ${index}: event must be an object`)

  const candidate = event as {
    created?: unknown
    data?: { object?: unknown }
    id?: unknown
    type?: unknown
  }
  if (typeof candidate.id !== 'string')
    throw new Error(`--events-file contains malformed Stripe event at index ${index}: missing string id`)
  if (typeof candidate.type !== 'string')
    throw new Error(`--events-file contains malformed Stripe event at index ${index}: missing string type`)
  if (!isSubscriptionEventType(candidate.type))
    throw new Error(`--events-file contains unsupported Stripe event type at index ${index}: ${candidate.type}`)

  const created = parseStripeEventCreatedSeconds(candidate.created)
  if (created === null)
    throw new Error(`--events-file contains malformed Stripe event at index ${index}: missing numeric or parseable created value`)

  const dataObject = candidate.data?.object
  if (typeof dataObject !== 'object' || dataObject === null)
    throw new Error(`--events-file contains malformed Stripe event at index ${index}: missing data.object`)

  if (!toStripeId((dataObject as { customer?: unknown }).customer))
    throw new Error(`--events-file contains malformed Stripe event at index ${index}: missing data.object.customer`)

  return {
    ...(event as Stripe.Event),
    created,
  }
}

async function loadEventsFile(filePath: string): Promise<Stripe.Event[]> {
  const payload = JSON.parse(await readFile(filePath, 'utf8')) as unknown
  const events = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { events?: unknown }).events)
        ? (payload as { events: unknown[] }).events
        : null

  if (!events)
    throw new Error('--events-file must contain a JSON array, or an object with data/events array')

  return sortStripeEvents(events.map(normalizeStripeEventFromFile))
}

async function fetchStripeEvents(stripe: Pick<ReturnType<typeof createStripeClient>, 'events'>, fromDateId: string, toDateId: string, limit: number | null) {
  const events: Stripe.Event[] = []
  const params = {
    created: {
      gte: dateIdToStartSeconds(fromDateId),
      lte: dateIdToEndSeconds(toDateId),
    },
    limit: STRIPE_PAGE_SIZE,
    types: [...SUBSCRIPTION_EVENT_TYPES],
  } as Stripe.EventListParams

  for await (const event of stripe.events.list(params)) {
    events.push(event)
    if (limit && events.length >= limit) {
      return {
        events: sortStripeEvents(events),
        reachedLimit: true,
      }
    }
  }

  return {
    events: sortStripeEvents(events),
    reachedLimit: false,
  }
}

async function fetchBaselineSubscriptions(stripe: Pick<ReturnType<typeof createStripeClient>, 'subscriptions'>, fromDateId: string, customerId?: string | null) {
  const subscriptions: Stripe.Subscription[] = []
  const params = {
    created: { lt: dateIdToStartSeconds(fromDateId) },
    customer: customerId ?? undefined,
    expand: ['data.items.data.price'],
    limit: STRIPE_PAGE_SIZE,
    status: 'all',
  } as Stripe.SubscriptionListParams

  for await (const subscription of stripe.subscriptions.list(params))
    subscriptions.push(subscription)

  return subscriptions
}

async function fetchPlans(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('plans')
    .select('name, price_m, price_y, price_m_id, price_y_id')
    .in('name', [...PLAN_NAMES])

  if (error)
    throw error

  return data ?? []
}

async function fetchGlobalStatsRows(supabase: SupabaseClient, fromDateId: string, toDateId: string) {
  const rows: GlobalStatsRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('global_stats')
      .select(`
        date_id,
        paying_yearly,
        paying_monthly,
        new_paying_orgs,
        canceled_orgs,
        paying,
        mrr,
        total_revenue,
        revenue_solo,
        revenue_maker,
        revenue_team,
        revenue_enterprise,
        plan_solo,
        plan_maker,
        plan_team,
        plan_enterprise,
        plan_solo_monthly,
        plan_solo_yearly,
        plan_maker_monthly,
        plan_maker_yearly,
        plan_team_monthly,
        plan_team_yearly,
        plan_enterprise_monthly,
        plan_enterprise_yearly,
        churn_revenue,
        churn_revenue_solo,
        churn_revenue_maker,
        churn_revenue_team,
        churn_revenue_enterprise,
        upgraded_orgs
      `)
      .gte('date_id', fromDateId)
      .lte('date_id', toDateId)
      .order('date_id', { ascending: true })
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

function toGlobalStatsUpdate(row: RevenueTrendBackfillRow): GlobalStatsUpdate {
  return {
    canceled_orgs: row.canceled_orgs,
    churn_revenue: row.churn_revenue,
    churn_revenue_enterprise: row.churn_revenue_enterprise,
    churn_revenue_maker: row.churn_revenue_maker,
    churn_revenue_solo: row.churn_revenue_solo,
    churn_revenue_team: row.churn_revenue_team,
    mrr: row.mrr,
    new_paying_orgs: row.new_paying_orgs,
    paying: row.paying,
    paying_monthly: row.paying_monthly,
    paying_yearly: row.paying_yearly,
    plan_enterprise: row.plan_enterprise,
    plan_enterprise_monthly: row.plan_enterprise_monthly,
    plan_enterprise_yearly: row.plan_enterprise_yearly,
    plan_maker: row.plan_maker,
    plan_maker_monthly: row.plan_maker_monthly,
    plan_maker_yearly: row.plan_maker_yearly,
    plan_solo: row.plan_solo,
    plan_solo_monthly: row.plan_solo_monthly,
    plan_solo_yearly: row.plan_solo_yearly,
    plan_team: row.plan_team,
    plan_team_monthly: row.plan_team_monthly,
    plan_team_yearly: row.plan_team_yearly,
    revenue_enterprise: row.revenue_enterprise,
    revenue_maker: row.revenue_maker,
    revenue_solo: row.revenue_solo,
    revenue_team: row.revenue_team,
    total_revenue: row.total_revenue,
    upgraded_orgs: row.upgraded_orgs,
  }
}

async function updateGlobalStatsRow(supabase: SupabaseClient, row: RevenueTrendBackfillRow) {
  const { error } = await supabase
    .from('global_stats')
    .update(toGlobalStatsUpdate(row))
    .eq('date_id', row.date_id)

  if (error)
    throw error
}

function printSampleRows(rows: RevenueTrendBackfillRow[]) {
  for (const row of rows.slice(0, 10)) {
    console.log(`${row.date_id}: paying=${row.paying}, monthly=${row.paying_monthly}, yearly=${row.paying_yearly}, mrr=$${row.mrr.toFixed(2)}, arr=$${row.total_revenue.toFixed(2)}, new=${row.new_paying_orgs}, canceled=${row.canceled_orgs}, upgraded=${row.upgraded_orgs}, churn=$${row.churn_revenue.toFixed(2)}, churn_plans=$${row.churn_revenue_solo.toFixed(2)}/$${row.churn_revenue_maker.toFixed(2)}/$${row.churn_revenue_team.toFixed(2)}/$${row.churn_revenue_enterprise.toFixed(2)}, plans=${row.plan_solo}/${row.plan_maker}/${row.plan_team}/${row.plan_enterprise}`)
  }
}

export async function main(args = process.argv.slice(2), runtimeEnv: Record<string, string | undefined> = process.env) {
  const apply = args.includes('--apply')
  const skipSubscriptionBaseline = args.includes('--skip-subscription-baseline')
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const eventsFile = getArgValue(args, '--events-file')
  const customerId = getArgValue(args, '--customer-id')
  const limit = getArgValue(args, '--limit')
  const concurrency = parsePositiveInteger(getArgValue(args, '--concurrency'), '--concurrency', DEFAULT_CONCURRENCY)
  const eventLimit = limit ? parsePositiveInteger(limit, '--limit', DEFAULT_PAGE_SIZE) : null
  const fromDateId = assertDateId(getArgValue(args, '--from') ?? getDefaultFromDateId(), '--from')
  const toDateId = assertDateId(getArgValue(args, '--to') ?? getDateId(), '--to')

  if (compareDateIds(fromDateId, toDateId) > 0)
    throw new Error('--from must be before or equal to --to')
  if (customerId && !customerId.startsWith('cus_'))
    throw new Error('--customer-id must be a Stripe customer id that starts with cus_')
  if (apply && customerId)
    throw new Error('--apply cannot be combined with --customer-id because global_stats metrics are global aggregates')

  const fileEnv = await loadEnv(envFile)
  const env = {
    ...fileEnv,
    ...runtimeEnv,
  }
  const supabase = createSupabaseServiceClient(env)

  console.log(`Backfill range: ${fromDateId}..${toDateId}`)
  console.log(`Env file: ${envFile}`)
  if (customerId)
    console.log(`Scoped to customer: ${customerId}`)
  if (!apply)
    console.log('Dry run only. Pass --apply to update global_stats.')

  let events: Stripe.Event[]
  let baselineSubscriptions: Stripe.Subscription[] = []
  let reachedEventFetchLimit = false

  if (eventsFile) {
    events = await loadEventsFile(eventsFile)
    console.log(`Loaded ${events.length} subscription events from ${eventsFile}`)
  }
  else {
    const stripeSecretKey = getRequiredEnv(env, 'STRIPE_SECRET_KEY')
    const stripe = createStripeClient(stripeSecretKey, env.STRIPE_API_BASE_URL?.trim())
    const oldestEventApiDateId = getDefaultFromDateId()
    const fetchFromDateId = compareDateIds(fromDateId, oldestEventApiDateId) > 0 ? oldestEventApiDateId : fromDateId
    const startsBeforeEventApiHistory = compareDateIds(fromDateId, oldestEventApiDateId) < 0

    if (startsBeforeEventApiHistory)
      console.warn('Stripe Events API only exposes recent events. Use --events-file for older archived Stripe events.')
    if (apply && startsBeforeEventApiHistory)
      throw new Error('--apply for ranges older than recent Stripe event history requires --events-file so daily subscription flow and churn are complete.')

    const fetchedEvents = await fetchStripeEvents(stripe, fetchFromDateId, toDateId, eventLimit)
    events = fetchedEvents.events
    reachedEventFetchLimit = fetchedEvents.reachedLimit
    console.log(`Fetched ${events.length} subscription events from Stripe`)
    if (fetchFromDateId !== fromDateId)
      console.log(`Fetched events from ${fetchFromDateId} to seed subscription changes before ${fromDateId}`)
    if (reachedEventFetchLimit)
      console.warn(`Stripe event fetch stopped at --limit=${eventLimit}`)

    if (!skipSubscriptionBaseline) {
      baselineSubscriptions = await fetchBaselineSubscriptions(stripe, fromDateId, customerId)
      console.log(`Fetched ${baselineSubscriptions.length} pre-range Stripe subscriptions for opening state`)
    }
  }

  if (apply && reachedEventFetchLimit)
    throw new Error('--apply cannot use a truncated Stripe event snapshot. Increase or remove --limit, or provide --events-file.')

  const [plans, globalStatsRows] = await Promise.all([
    fetchPlans(supabase),
    fetchGlobalStatsRows(supabase, fromDateId, toDateId),
  ])

  const rows = buildRevenueTrendBackfillRows(globalStatsRows, {
    baselineSubscriptions,
    customerId,
    events,
    fromDateId,
    plans,
    toDateId,
  })
  const rowsWithExistingGlobalStats = rows.filter(row => globalStatsRows.some(existing => existing.date_id === row.date_id))
  const missingGlobalStatsDates = rows.filter(row => !globalStatsRows.some(existing => existing.date_id === row.date_id)).map(row => row.date_id)
  const changedRows = rowsWithExistingGlobalStats.filter(row => row.changed)

  console.log(`Loaded ${plans.length} revenue plans`)
  console.log(`Loaded ${globalStatsRows.length} global_stats rows`)
  console.log(`Computed ${rows.length} revenue trend rows`)
  if (missingGlobalStatsDates.length > 0)
    console.warn(`Skipped ${missingGlobalStatsDates.length} dates with no global_stats row: ${missingGlobalStatsDates.slice(0, 10).join(', ')}${missingGlobalStatsDates.length > 10 ? ', ...' : ''}`)
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

  console.log(`Done. Updated ${updated}/${changedRows.length} revenue trend rows.`)
}

if (import.meta.main)
  await main()
