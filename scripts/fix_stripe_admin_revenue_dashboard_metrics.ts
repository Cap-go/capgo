/*
 * Rebuild admin revenue dashboard metrics from Stripe for every day since 2022.
 *
 * This script has no dry-run/apply mode by design:
 *   bun run stripe:backfill-admin-revenue-dashboard
 */
import type Stripe from 'stripe'
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import process from 'node:process'
import {
  asyncPool,
  createStripeClient,
  createSupabaseServiceClient,
  DEFAULT_ENV_FILE,
  getRequiredEnv,
  loadEnv,
} from './admin_stripe_backfill_utils.ts'

const BACKFILL_FROM_DATE_ID = '2022-01-01'
const DEFAULT_CONCURRENCY = 10
const DEFAULT_PAGE_SIZE = 1000
const STRIPE_PAGE_SIZE = 100
const PLAN_KEYS = ['solo', 'maker', 'team', 'enterprise'] as const
const PLAN_NAMES = ['Solo', 'Maker', 'Team', 'Enterprise'] as const
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_MONTH_MS = (365.2425 / 12) * ONE_DAY_MS

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>
type PlanKey = typeof PLAN_KEYS[number]
type BillingInterval = 'monthly' | 'yearly'
type GlobalStatsUpdate = Database['public']['Tables']['global_stats']['Update']
type GlobalStatsInsert = Database['public']['Tables']['global_stats']['Insert']
type PlanRow = Pick<
  Database['public']['Tables']['plans']['Row'],
  'name' | 'price_m' | 'price_m_id' | 'price_y' | 'price_y_id' | 'stripe_id'
>
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

export interface StripePriceLookupEntry {
  interval: BillingInterval | null
  mrr: number
  plan: PlanKey | null
  priceId: string
  productId: string | null
}

export interface StripeRevenueInterval {
  customerId: string
  endMs: number
  interval: BillingInterval | null
  mrr: number
  plan: PlanKey | null
  priceId: string | null
  sourceId: string
  startMs: number
  subscriptionId: string
}

interface RevenueSubscriptionState {
  customerId: string
  interval: BillingInterval | null
  mrr: number
  plan: PlanKey | null
  subscriptionId: string
}

interface DailyCounters {
  canceledCustomerIds: Set<string>
  churnRevenue: number
  churnRevenueByPlan: Record<PlanKey, number>
  newCustomerIds: Set<string>
  upgradedCustomerIds: Set<string>
}

export interface StripeRevenueMetricValues {
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

export interface StripeRevenueBackfillRow extends StripeRevenueMetricValues {
  changed: boolean
  current: Partial<StripeRevenueMetricValues>
  date_id: string
  exists: boolean
}

export interface BuildStripeInvoiceRevenueRowsOptions {
  fromDateId: string
  intervals: StripeRevenueInterval[]
  toDateId: string
}

function getDateId(targetDate = new Date()) {
  return new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())).toISOString().slice(0, 10)
}

function dateIdToStartMs(dateId: string) {
  return new Date(`${dateId}T00:00:00.000Z`).getTime()
}

function dateIdToEndMs(dateId: string) {
  return new Date(`${dateId}T23:59:59.999Z`).getTime()
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

function toMetricNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
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

function createEmptyMetrics(): StripeRevenueMetricValues {
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

function getPlanKey(name: string | null | undefined): PlanKey | null {
  const normalized = name?.trim().toLowerCase()
  if (normalized === 'solo' || normalized === 'maker' || normalized === 'team' || normalized === 'enterprise')
    return normalized
  return null
}

export function classifyPlanKeyFromText(...values: Array<string | null | undefined>) {
  const text = values
    .filter((value): value is string => !!value)
    .join(' ')
    .toLowerCase()
  const normalized = text.replace(/[^a-z0-9]+/g, ' ')

  for (const planKey of PLAN_KEYS) {
    if (new RegExp(`(^|\\s)${planKey}(\\s|$)`).test(normalized))
      return planKey
  }

  return null
}

function getProductName(product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined) {
  if (!product || typeof product === 'string')
    return null
  if ('deleted' in product && product.deleted)
    return null
  return product.name ?? null
}

function getProductId(product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined) {
  return toStripeId(product)
}

function getStripePriceAmount(price: Stripe.Price) {
  if (typeof price.unit_amount === 'number')
    return price.unit_amount / 100
  if (price.unit_amount_decimal) {
    const amount = Number(price.unit_amount_decimal)
    return Number.isFinite(amount) ? amount / 100 : 0
  }
  return 0
}

function getNormalizedMonthlyAmount(amount: number, interval: string | null | undefined, intervalCount: number | null | undefined) {
  const count = intervalCount && intervalCount > 0 ? intervalCount : 1
  if (interval === 'month')
    return amount / count
  if (interval === 'year')
    return amount / (12 * count)
  if (interval === 'week')
    return (amount * 52) / (12 * count)
  if (interval === 'day')
    return (amount * 365.2425) / (12 * count)
  return 0
}

function getBillingInterval(interval: string | null | undefined): BillingInterval | null {
  if (interval === 'month')
    return 'monthly'
  if (interval === 'year')
    return 'yearly'
  return null
}

function buildDbPlanLookup(plans: PlanRow[]) {
  const byPriceId = new Map<string, StripePriceLookupEntry>()
  const byProductId = new Map<string, PlanKey>()

  for (const plan of plans) {
    const planKey = getPlanKey(plan.name)
    if (!planKey)
      continue

    if (plan.stripe_id)
      byProductId.set(plan.stripe_id, planKey)

    if (plan.price_m_id) {
      byPriceId.set(plan.price_m_id, {
        interval: 'monthly',
        mrr: Number(plan.price_m) || 0,
        plan: planKey,
        priceId: plan.price_m_id,
        productId: plan.stripe_id ?? null,
      })
    }

    if (plan.price_y_id) {
      byPriceId.set(plan.price_y_id, {
        interval: 'yearly',
        mrr: (Number(plan.price_y) || 0) / 12,
        plan: planKey,
        priceId: plan.price_y_id,
        productId: plan.stripe_id ?? null,
      })
    }
  }

  return { byPriceId, byProductId }
}

export function buildStripePriceLookup(prices: Stripe.Price[], plans: PlanRow[]) {
  const dbLookup = buildDbPlanLookup(plans)
  const lookup = new Map<string, StripePriceLookupEntry>(dbLookup.byPriceId)

  for (const price of prices) {
    const recurring = price.recurring
    const interval = getBillingInterval(recurring?.interval)
    const productId = getProductId(price.product)
    const productName = getProductName(price.product)
    const existing = lookup.get(price.id)
    let plan = existing?.plan ?? null
    plan ??= productId ? dbLookup.byProductId.get(productId) ?? null : null
    plan ??= getPlanKey(price.metadata?.plan)
    plan ??= getPlanKey(price.metadata?.plan_name)
    plan ??= classifyPlanKeyFromText(price.lookup_key, price.nickname, productName)
    const mrr = existing?.mrr
      ?? getNormalizedMonthlyAmount(getStripePriceAmount(price), recurring?.interval, recurring?.interval_count)

    lookup.set(price.id, {
      interval: existing?.interval ?? interval,
      mrr: roundMoney(mrr),
      plan,
      priceId: price.id,
      productId,
    })
  }

  return lookup
}

function getLinePriceId(line: Stripe.InvoiceLineItem) {
  const typedLine = line as Stripe.InvoiceLineItem & {
    plan?: Stripe.Plan | null
    price?: Stripe.Price | null
    pricing?: { price_details?: { price?: string | null } | null } | null
  }

  return toStripeId(typedLine.price)
    ?? toStripeId(typedLine.plan)
    ?? typedLine.pricing?.price_details?.price
    ?? null
}

function getLineProductId(line: Stripe.InvoiceLineItem) {
  const typedLine = line as Stripe.InvoiceLineItem & {
    plan?: Stripe.Plan | null
    price?: Stripe.Price | null
    pricing?: { price_details?: { product?: string | null } | null } | null
  }
  const priceProduct = typeof typedLine.price === 'object' && typedLine.price !== null
    ? toStripeId(typedLine.price.product)
    : null
  const planProduct = typeof typedLine.plan === 'object' && typedLine.plan !== null
    ? toStripeId(typedLine.plan.product)
    : null

  return priceProduct
    ?? planProduct
    ?? typedLine.pricing?.price_details?.product
    ?? null
}

function getLineSubscriptionId(line: Stripe.InvoiceLineItem, invoice: Stripe.Invoice) {
  const typedLine = line as Stripe.InvoiceLineItem & {
    parent?: {
      subscription_item_details?: { subscription?: string | null } | null
    } | null
    subscription?: string | Stripe.Subscription | null
  }
  const typedInvoice = invoice as Stripe.Invoice & {
    parent?: { subscription_details?: { subscription?: string | null } | null } | null
    subscription?: string | Stripe.Subscription | null
  }

  return typedLine.parent?.subscription_item_details?.subscription
    ?? toStripeId(typedLine.subscription)
    ?? typedInvoice.parent?.subscription_details?.subscription
    ?? toStripeId(typedInvoice.subscription)
    ?? null
}

function getLineQuantity(line: Stripe.InvoiceLineItem) {
  const quantity = (line as { quantity?: number | null }).quantity
  return typeof quantity === 'number' && quantity > 0 ? quantity : 1
}

function getLineAmount(line: Stripe.InvoiceLineItem) {
  const amount = (line as { amount?: number | null }).amount
  return typeof amount === 'number' ? amount / 100 : 0
}

function isSubscriptionLine(line: Stripe.InvoiceLineItem) {
  const typedLine = line as Stripe.InvoiceLineItem & {
    parent?: {
      subscription_item_details?: {
        subscription?: string | null
        subscription_item?: string | null
      }
      type?: string | null
    } | null
    subscription?: string | null
    subscription_item?: string | null
    type?: string | null
  }

  return typedLine.type === 'subscription'
    || !!typedLine.subscription
    || !!typedLine.subscription_item
    || typedLine.parent?.type === 'subscription_item_details'
    || !!typedLine.parent?.subscription_item_details?.subscription
    || !!typedLine.parent?.subscription_item_details?.subscription_item
}

function getLinePeriod(line: Stripe.InvoiceLineItem) {
  const period = (line as { period?: { end?: number | null, start?: number | null } | null }).period
  if (typeof period?.start !== 'number' || typeof period.end !== 'number' || period.end <= period.start)
    return null

  return {
    startMs: period.start * 1000,
    endMs: period.end * 1000,
  }
}

function getPeriodBillingInterval(startMs: number, endMs: number): BillingInterval | null {
  const durationMonths = (endMs - startMs) / ONE_MONTH_MS
  if (durationMonths > 10)
    return 'yearly'
  if (durationMonths > 0)
    return 'monthly'
  return null
}

function getLineFallbackMrr(line: Stripe.InvoiceLineItem, startMs: number, endMs: number) {
  const amount = getLineAmount(line)
  if (amount <= 0)
    return 0

  const durationMonths = (endMs - startMs) / ONE_MONTH_MS
  if (durationMonths <= 0)
    return 0

  return amount / durationMonths
}

function getLineRevenueInfo(line: Stripe.InvoiceLineItem, lookup: Map<string, StripePriceLookupEntry>) {
  const priceId = getLinePriceId(line)
  const entry = priceId ? lookup.get(priceId) : null
  const period = getLinePeriod(line)
  const quantity = getLineQuantity(line)
  const mrr = entry?.mrr
    ? entry.mrr * quantity
    : period
      ? getLineFallbackMrr(line, period.startMs, period.endMs)
      : 0

  return {
    interval: entry?.interval ?? (period ? getPeriodBillingInterval(period.startMs, period.endMs) : null),
    mrr: roundMoney(mrr),
    plan: entry?.plan ?? classifyPlanKeyFromText(line.description, getLineProductId(line)),
    priceId,
  }
}

function getInvoiceAmountPaid(invoice: Stripe.Invoice) {
  const amountPaid = (invoice as { amount_paid?: number | null }).amount_paid
  return typeof amountPaid === 'number' ? amountPaid : 0
}

function shouldUseInvoice(invoice: Stripe.Invoice) {
  return invoice.status === 'paid' && getInvoiceAmountPaid(invoice) > 0
}

function addInterval(intervalsByKey: Map<string, StripeRevenueInterval>, interval: StripeRevenueInterval) {
  if (interval.endMs <= interval.startMs)
    return
  if (interval.mrr < 0)
    return

  const key = `${interval.subscriptionId}:${interval.priceId ?? 'unknown'}:${interval.startMs}:${interval.endMs}`
  if (!intervalsByKey.has(key))
    intervalsByKey.set(key, interval)
}

function addInvoiceLineInterval(
  intervalsByKey: Map<string, StripeRevenueInterval>,
  invoice: Stripe.Invoice,
  line: Stripe.InvoiceLineItem,
  priceLookup: Map<string, StripePriceLookupEntry>,
  options: { fromStartMs: number, toEndMs: number },
) {
  if (!isSubscriptionLine(line))
    return
  if (getLineAmount(line) <= 0)
    return

  const period = getLinePeriod(line)
  if (!period)
    return
  if (period.endMs <= options.fromStartMs || period.startMs > options.toEndMs)
    return

  const customerId = toStripeId(invoice.customer)
  if (!customerId)
    return

  const revenueInfo = getLineRevenueInfo(line, priceLookup)
  const subscriptionId = getLineSubscriptionId(line, invoice) ?? `${customerId}:${line.id}`
  addInterval(intervalsByKey, {
    customerId,
    endMs: period.endMs,
    interval: revenueInfo.interval,
    mrr: revenueInfo.mrr,
    plan: revenueInfo.plan,
    priceId: revenueInfo.priceId,
    sourceId: invoice.id,
    startMs: period.startMs,
    subscriptionId,
  })
}

function isRevenueActiveSubscription(subscription: Stripe.Subscription) {
  return subscription.status === 'active'
    || subscription.status === 'trialing'
    || subscription.status === 'past_due'
    || subscription.status === 'unpaid'
}

function getSubscriptionItems(subscription: Stripe.Subscription) {
  return subscription.items?.data as Stripe.SubscriptionItem[] | undefined
}

function getLicensedSubscriptionItems(subscription: Stripe.Subscription) {
  return (getSubscriptionItems(subscription) ?? []).filter(item => item.plan?.usage_type !== 'metered')
}

function getSubscriptionItemPriceId(item: Stripe.SubscriptionItem) {
  return toStripeId(item.price) ?? item.plan?.id ?? null
}

function getSubscriptionItemPeriod(item: Stripe.SubscriptionItem, subscription: Stripe.Subscription) {
  const typedItem = item as Stripe.SubscriptionItem & {
    current_period_end?: number | null
    current_period_start?: number | null
  }
  const typedSubscription = subscription as Stripe.Subscription & {
    current_period_end?: number | null
    current_period_start?: number | null
  }
  const start = typedItem.current_period_start ?? typedSubscription.current_period_start
  const end = typedItem.current_period_end ?? typedSubscription.current_period_end

  if (typeof start !== 'number' || typeof end !== 'number' || end <= start)
    return null

  return {
    startMs: start * 1000,
    endMs: end * 1000,
  }
}

function addCurrentSubscriptionInterval(
  intervalsByKey: Map<string, StripeRevenueInterval>,
  subscription: Stripe.Subscription,
  priceLookup: Map<string, StripePriceLookupEntry>,
  options: { fromStartMs: number, toEndMs: number },
) {
  if (!isRevenueActiveSubscription(subscription))
    return

  const customerId = toStripeId(subscription.customer)
  if (!customerId)
    return

  for (const item of getLicensedSubscriptionItems(subscription)) {
    const period = getSubscriptionItemPeriod(item, subscription)
    if (!period || period.endMs <= options.fromStartMs || period.startMs > options.toEndMs)
      continue

    const priceId = getSubscriptionItemPriceId(item)
    const price = priceId ? priceLookup.get(priceId) : null
    if (!price)
      continue

    addInterval(intervalsByKey, {
      customerId,
      endMs: period.endMs,
      interval: price.interval,
      mrr: roundMoney(price.mrr * (item.quantity ?? 1)),
      plan: price.plan,
      priceId,
      sourceId: subscription.id,
      startMs: period.startMs,
      subscriptionId: subscription.id,
    })
  }
}

async function getInvoiceLines(stripe: Stripe, invoice: Stripe.Invoice) {
  const lines = [...invoice.lines.data]
  if (!invoice.lines.has_more)
    return lines

  const params = { limit: STRIPE_PAGE_SIZE } as Stripe.InvoiceListLineItemsParams
  const startingAfter = lines.at(-1)?.id
  if (startingAfter)
    params.starting_after = startingAfter

  for await (const line of stripe.invoices.listLineItems(invoice.id, params))
    lines.push(line)

  return lines
}

async function fetchStripePrices(stripe: Stripe) {
  const pricesById = new Map<string, Stripe.Price>()
  for (const active of [true, false]) {
    const params = { active, expand: ['data.product'], limit: STRIPE_PAGE_SIZE } as Stripe.PriceListParams
    for await (const price of stripe.prices.list(params))
      pricesById.set(price.id, price)
  }
  return [...pricesById.values()]
}

async function fetchStripeRevenueIntervals(
  stripe: Stripe,
  priceLookup: Map<string, StripePriceLookupEntry>,
  options: { fromDateId: string, toDateId: string },
) {
  const intervalsByKey = new Map<string, StripeRevenueInterval>()
  const fromStartMs = dateIdToStartMs(options.fromDateId)
  const toEndMs = dateIdToEndMs(options.toDateId)

  let checkedInvoices = 0
  let matchedLines = 0
  const invoiceParams = {
    limit: STRIPE_PAGE_SIZE,
    status: 'paid',
  } as Stripe.InvoiceListParams

  for await (const invoice of stripe.invoices.list(invoiceParams)) {
    checkedInvoices++
    if (shouldUseInvoice(invoice)) {
      const lines = await getInvoiceLines(stripe, invoice)
      for (const line of lines) {
        const before = intervalsByKey.size
        addInvoiceLineInterval(intervalsByKey, invoice, line, priceLookup, { fromStartMs, toEndMs })
        if (intervalsByKey.size > before)
          matchedLines++
      }
    }

    if (checkedInvoices % 500 === 0)
      console.log(`Checked ${checkedInvoices} paid Stripe invoices (${matchedLines} subscription lines matched)`)
  }

  let checkedSubscriptions = 0
  const subscriptionParams = {
    limit: STRIPE_PAGE_SIZE,
    status: 'all',
  } as Stripe.SubscriptionListParams

  for await (const subscription of stripe.subscriptions.list(subscriptionParams)) {
    checkedSubscriptions++
    addCurrentSubscriptionInterval(intervalsByKey, subscription, priceLookup, { fromStartMs, toEndMs })
    if (checkedSubscriptions % 500 === 0)
      console.log(`Checked ${checkedSubscriptions} Stripe subscriptions`)
  }

  console.log(`Checked ${checkedInvoices} paid Stripe invoices (${matchedLines} subscription lines matched)`)
  console.log(`Checked ${checkedSubscriptions} Stripe subscriptions`)
  return [...intervalsByKey.values()].sort((left, right) => {
    if (left.startMs !== right.startMs)
      return left.startMs - right.startMs
    return left.sourceId.localeCompare(right.sourceId)
  })
}

function getStateForDate(intervals: StripeRevenueInterval[], dateId: string) {
  const dayEndMs = dateIdToEndMs(dateId)
  const activeBySubscriptionId = new Map<string, StripeRevenueInterval>()

  for (const interval of intervals) {
    if (interval.startMs > dayEndMs || interval.endMs <= dayEndMs)
      continue

    const existing = activeBySubscriptionId.get(interval.subscriptionId)
    if (!existing || interval.startMs > existing.startMs || (interval.startMs === existing.startMs && interval.endMs > existing.endMs))
      activeBySubscriptionId.set(interval.subscriptionId, interval)
  }

  return new Map([...activeBySubscriptionId.entries()].map(([subscriptionId, interval]) => [subscriptionId, {
    customerId: interval.customerId,
    interval: interval.interval,
    mrr: interval.mrr,
    plan: interval.plan,
    subscriptionId,
  } satisfies RevenueSubscriptionState]))
}

function recordDailyTransitions(
  previousState: Map<string, RevenueSubscriptionState>,
  currentState: Map<string, RevenueSubscriptionState>,
  seenPaidCustomerIds: Set<string>,
) {
  const daily = createDailyCounters()
  const previousActiveCustomers = new Set([...previousState.values()].map(state => state.customerId))
  const currentActiveCustomers = new Set([...currentState.values()].map(state => state.customerId))

  for (const customerId of currentActiveCustomers) {
    if (!seenPaidCustomerIds.has(customerId)) {
      daily.newCustomerIds.add(customerId)
      seenPaidCustomerIds.add(customerId)
    }
  }

  for (const [subscriptionId, previous] of previousState.entries()) {
    const current = currentState.get(subscriptionId) ?? null
    if (!current) {
      daily.canceledCustomerIds.add(previous.customerId)
      daily.churnRevenue += previous.mrr
      if (previous.plan)
        daily.churnRevenueByPlan[previous.plan] += previous.mrr
      continue
    }

    if (
      (previous.interval === 'monthly' && current.interval === 'yearly')
      || (previous.mrr > 0 && current.mrr > previous.mrr)
    ) {
      daily.upgradedCustomerIds.add(current.customerId)
    }

    if (current.mrr < previous.mrr) {
      const lostMrr = previous.mrr - current.mrr
      daily.churnRevenue += lostMrr
      if (previous.plan)
        daily.churnRevenueByPlan[previous.plan] += lostMrr
    }
  }

  for (const customerId of previousActiveCustomers) {
    if (!currentActiveCustomers.has(customerId))
      daily.canceledCustomerIds.add(customerId)
  }

  return daily
}

function summarizeRevenueSnapshot(states: Iterable<RevenueSubscriptionState>, daily: DailyCounters): StripeRevenueMetricValues {
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
      else if (state.interval === 'yearly')
        metrics.plan_solo_yearly++
      metrics.revenue_solo += state.mrr * 12
    }
    else if (state.plan === 'maker') {
      metrics.plan_maker++
      if (state.interval === 'monthly')
        metrics.plan_maker_monthly++
      else if (state.interval === 'yearly')
        metrics.plan_maker_yearly++
      metrics.revenue_maker += state.mrr * 12
    }
    else if (state.plan === 'team') {
      metrics.plan_team++
      if (state.interval === 'monthly')
        metrics.plan_team_monthly++
      else if (state.interval === 'yearly')
        metrics.plan_team_yearly++
      metrics.revenue_team += state.mrr * 12
    }
    else {
      metrics.plan_enterprise++
      if (state.interval === 'monthly')
        metrics.plan_enterprise_monthly++
      else if (state.interval === 'yearly')
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

function valuesChanged(current: Partial<Record<keyof StripeRevenueMetricValues, number | null | undefined>>, next: StripeRevenueMetricValues) {
  for (const [key, value] of Object.entries(next) as Array<[keyof StripeRevenueMetricValues, number]>) {
    if (Math.abs(toMetricNumber(current[key]) - value) > 0.0001)
      return true
  }
  return false
}

export function buildStripeInvoiceRevenueBackfillRows(
  existingRows: GlobalStatsRow[],
  options: BuildStripeInvoiceRevenueRowsOptions,
): StripeRevenueBackfillRow[] {
  const existingRowsByDateId = new Map(existingRows.map(row => [row.date_id, row]))
  const rows: StripeRevenueBackfillRow[] = []
  const seenPaidCustomerIds = new Set<string>()
  const previousDate = new Date(`${options.fromDateId}T00:00:00.000Z`)
  previousDate.setUTCDate(previousDate.getUTCDate() - 1)
  let previousState = getStateForDate(options.intervals, getDateId(previousDate))

  for (const state of previousState.values())
    seenPaidCustomerIds.add(state.customerId)

  for (const dateId of getDateIdsBetween(options.fromDateId, options.toDateId)) {
    const currentState = getStateForDate(options.intervals, dateId)
    const daily = recordDailyTransitions(previousState, currentState, seenPaidCustomerIds)
    const next = summarizeRevenueSnapshot(currentState.values(), daily)
    const current = existingRowsByDateId.get(dateId) ?? null
    rows.push({
      ...next,
      changed: !current || valuesChanged(current, next),
      current: current
        ? Object.fromEntries(Object.keys(next).map(key => [key, toMetricNumber(current[key as keyof StripeRevenueMetricValues])]))
        : {},
      date_id: dateId,
      exists: !!current,
    })
    previousState = currentState
  }

  return rows
}

async function fetchPlans(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('plans')
    .select('name, stripe_id, price_m, price_y, price_m_id, price_y_id')
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

function toGlobalStatsUpdate(row: StripeRevenueBackfillRow): GlobalStatsUpdate {
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

function toGlobalStatsInsert(row: StripeRevenueBackfillRow): GlobalStatsInsert {
  return {
    apps: 0,
    date_id: row.date_id,
    stars: 0,
    updates: 0,
    ...toGlobalStatsUpdate(row),
  }
}

async function writeGlobalStatsRow(supabase: SupabaseClient, row: StripeRevenueBackfillRow) {
  if (row.exists) {
    const { error } = await supabase
      .from('global_stats')
      .update(toGlobalStatsUpdate(row))
      .eq('date_id', row.date_id)

    if (error)
      throw error
    return
  }

  const { error } = await supabase
    .from('global_stats')
    .insert(toGlobalStatsInsert(row))

  if (error)
    throw error
}

function printSampleRows(rows: StripeRevenueBackfillRow[]) {
  for (const row of rows.slice(0, 10)) {
    console.log(`${row.date_id}: paying=${row.paying}, monthly=${row.paying_monthly}, yearly=${row.paying_yearly}, mrr=$${row.mrr.toFixed(2)}, arr=$${row.total_revenue.toFixed(2)}, new=${row.new_paying_orgs}, canceled=${row.canceled_orgs}, upgraded=${row.upgraded_orgs}, churn=$${row.churn_revenue.toFixed(2)}, churn_plans=$${row.churn_revenue_solo.toFixed(2)}/$${row.churn_revenue_maker.toFixed(2)}/$${row.churn_revenue_team.toFixed(2)}/$${row.churn_revenue_enterprise.toFixed(2)}, plans=${row.plan_solo}/${row.plan_maker}/${row.plan_team}/${row.plan_enterprise}`)
  }
}

export async function main(runtimeEnv: Record<string, string | undefined> = process.env) {
  const envFile = DEFAULT_ENV_FILE
  const fileEnv = await loadEnv(envFile)
  const env = {
    ...fileEnv,
    ...runtimeEnv,
  }
  const supabase = createSupabaseServiceClient(env)
  const stripe = createStripeClient(getRequiredEnv(env, 'STRIPE_SECRET_KEY'), env.STRIPE_API_BASE_URL?.trim())
  const fromDateId = BACKFILL_FROM_DATE_ID
  const toDateId = getDateId()

  console.log(`Fixing Stripe admin revenue dashboard metrics: ${fromDateId}..${toDateId}`)
  console.log(`Env file: ${envFile}`)

  const [plans, prices, globalStatsRows] = await Promise.all([
    fetchPlans(supabase),
    fetchStripePrices(stripe),
    fetchGlobalStatsRows(supabase, fromDateId, toDateId),
  ])
  const priceLookup = buildStripePriceLookup(prices, plans)
  console.log(`Loaded ${plans.length} DB revenue plans`)
  console.log(`Loaded ${prices.length} Stripe prices`)
  console.log(`Loaded ${globalStatsRows.length} global_stats rows`)

  const intervals = await fetchStripeRevenueIntervals(stripe, priceLookup, { fromDateId, toDateId })
  const rows = buildStripeInvoiceRevenueBackfillRows(globalStatsRows, {
    fromDateId,
    intervals,
    toDateId,
  })
  const changedRows = rows.filter(row => row.changed)
  const missingRows = changedRows.filter(row => !row.exists)

  console.log(`Loaded ${intervals.length} Stripe revenue intervals`)
  console.log(`Computed ${rows.length} daily revenue rows`)
  console.log(`Rows needing write: ${changedRows.length} (${missingRows.length} missing global_stats rows will be inserted)`)

  if (changedRows.length > 0) {
    console.log('Sample writes:')
    printSampleRows(changedRows)
  }

  let written = 0
  await asyncPool(DEFAULT_CONCURRENCY, changedRows, async (row) => {
    await writeGlobalStatsRow(supabase, row)
    written++
    if (written % 100 === 0 || written === changedRows.length)
      console.log(`Wrote ${written}/${changedRows.length}`)
  })

  console.log(`Done. Wrote ${written}/${changedRows.length} Stripe revenue dashboard rows.`)
}

if (import.meta.main)
  await main()
