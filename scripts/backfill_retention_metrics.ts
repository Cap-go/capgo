/*
 * Backfill daily Stripe revenue movement metrics used by admin NRR and churn charts.
 *
 * Dry run, defaulting to the last 30 UTC calendar days:
 *   bun run stripe:backfill-retention-metrics
 *
 * Apply new, unprocessed Stripe subscription events:
 *   bun run stripe:backfill-retention-metrics --apply --from=2026-04-01 --to=2026-04-23
 *
 * Rebuild an exact date range:
 *   bun run stripe:backfill-retention-metrics --apply --reset --from=2026-04-01 --to=2026-04-23
 *
 * Older history requires an exported Stripe events JSON file:
 *   bun run stripe:backfill-retention-metrics --events-file=./tmp/stripe-events.json --from=2026-01-01 --to=2026-04-23
 */
import type Stripe from 'stripe'
import type { RevenueMovement, RevenuePlanRow, StripeInfoRevenueState } from '../supabase/functions/_backend/utils/revenue_metrics.ts'
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import StripeClient from 'stripe'
import { calculateChurnRevenue, calculateNrr, classifyRevenueMovement, getEventDateId, getPreviousDateId, getSubscriptionMrr, hasRevenueMovement } from '../supabase/functions/_backend/utils/revenue_metrics.ts'

const DEFAULT_ENV_FILE = './internal/cloudflare/.env.prod'
const DEFAULT_LOOKBACK_DAYS = 30
const EVENT_FETCH_PAGE_SIZE = 100
const DB_CHUNK_SIZE = 500
const FAILURE_OUTPUT = './tmp/retention_metric_backfill_failures.json'
const DATE_ID_REGEX = /^\d{4}-\d{2}-\d{2}$/
const SUBSCRIPTION_EVENT_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const

type SupabaseClient = ReturnType<typeof createClient<Database>>
type DailyRevenueMetricRow = Database['public']['Tables']['daily_revenue_metrics']['Row']
type DailyRevenueMetricInsert = Database['public']['Tables']['daily_revenue_metrics']['Insert']
type ProcessedStripeEventInsert = Database['public']['Tables']['processed_stripe_events']['Insert']
type StripeStatus = Database['public']['Enums']['stripe_status']
type SubscriptionEventType = typeof SUBSCRIPTION_EVENT_TYPES[number]

interface CustomerRevenueBaselineRow {
  customer_id: string
  paid_at: string | null
  subscription_id: string | null
}

interface TrackedSubscriptionState {
  customer_id: string
  is_good_plan: boolean
  paid_at: string | null
  price_id: string | null
  product_id: string | null
  status: StripeStatus | null
  subscription_id: string | null
}

export interface BackfillRevenueMovementEvent {
  event_id: string
  event_type: SubscriptionEventType
  date_id: string
  customer_id: string
  opening_mrr: number
  current_mrr: number
  next_mrr: number
  new_business_mrr: number
  expansion_mrr: number
  contraction_mrr: number
  churn_mrr: number
}

export interface BackfillSummary {
  rows: number
  opening_mrr: number
  new_business_mrr: number
  expansion_mrr: number
  contraction_mrr: number
  churn_mrr: number
}

interface BuildRevenueMovementEventsOptions {
  customerId?: string | null
  fromDateId: string
  initialPaidAtByCustomerId?: Map<string, string | null>
  initialSubscriptionIdByCustomerId?: Map<string, string | null>
  toDateId: string
}

interface BuildRevenueMovementEventsResult {
  movements: BackfillRevenueMovementEvent[]
  skipped: {
    missingCustomer: number
    missingPlan: number
    noMovement: number
    outOfRange: number
    subscriptionMismatch: number
    unsupportedEvent: number
  }
}

interface RefreshRetentionMetricsResult {
  skippedMissingGlobalStats: string[]
  updated: number
}

function getArgValue(args: string[], prefix: string): string | null {
  const arg = args.find(value => value.startsWith(`${prefix}=`))
  if (!arg)
    return null
  return arg.slice(prefix.length + 1)
}

async function loadEnv(filePath: string) {
  if (!existsSync(filePath))
    return {}

  const text = await readFile(filePath, 'utf8')
  const env: Record<string, string> = {}

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0)
      continue

    const key = trimmed.slice(0, separatorIndex)
    let value = trimmed.slice(separatorIndex + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
      value = value.slice(1, -1)
    env[key] = value
  }

  return env
}

function getRequiredEnv(env: Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim()
  if (!value)
    throw new Error(`Missing ${key}`)
  return value
}

function createStripeClient(secretKey: string, apiBaseUrl?: string) {
  let hostConfig: Partial<Pick<NonNullable<ConstructorParameters<typeof StripeClient>[1]>, 'host' | 'port' | 'protocol'>> = {}

  if (apiBaseUrl?.trim()) {
    const parsed = new URL(apiBaseUrl)
    hostConfig = {
      host: parsed.hostname,
      port: Number.parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'), 10),
      protocol: parsed.protocol.replace(':', '') as 'http' | 'https',
    }
  }

  type StripeApiVersion = NonNullable<ConstructorParameters<typeof StripeClient>[1]>['apiVersion']
  return new StripeClient(secretKey, {
    apiVersion: '2026-03-25.dahlia' as StripeApiVersion,
    httpClient: StripeClient.createFetchHttpClient(),
    ...hostConfig,
  })
}

export function parseDateId(value: string, name: string) {
  if (!DATE_ID_REGEX.test(value))
    throw new Error(`${name} must use YYYY-MM-DD`)

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(`${name} must be a valid UTC date`)

  return value
}

function todayDateId() {
  return new Date().toISOString().slice(0, 10)
}

function dateIdDaysAgo(days: number) {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return start.toISOString().slice(0, 10)
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

function getDateIdsBetween(fromDateId: string, toDateId: string) {
  const dates: string[] = []
  const cursor = new Date(`${fromDateId}T00:00:00.000Z`)
  const end = new Date(`${toDateId}T00:00:00.000Z`)

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

export function isSubscriptionEventType(type: string): type is SubscriptionEventType {
  return SUBSCRIPTION_EVENT_TYPES.includes(type as SubscriptionEventType)
}

function getEventCreatedIso(event: Stripe.Event) {
  return new Date(event.created * 1000).toISOString()
}

function sortStripeEvents(events: Stripe.Event[]) {
  return [...events].sort((left, right) => {
    if (left.created !== right.created)
      return left.created - right.created
    return left.id.localeCompare(right.id)
  })
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
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

function getLicensedSubscriptionItem(items: Stripe.SubscriptionItem[] | undefined) {
  return items?.find(item => item.plan?.usage_type === 'licensed') ?? items?.[0] ?? null
}

function getItemPriceId(item: Stripe.SubscriptionItem | null | undefined) {
  if (!item)
    return null

  return item.plan?.id ?? toStripeId(item.price) ?? null
}

function getItemProductId(item: Stripe.SubscriptionItem | null | undefined) {
  if (!item)
    return null

  return toStripeId(item.plan?.product) ?? toStripeId(item.price?.product) ?? null
}

function getSubscriptionItems(subscription: Stripe.Subscription) {
  return subscription.items?.data as Stripe.SubscriptionItem[] | undefined
}

function getPreviousSubscriptionItems(event: Stripe.Event) {
  const previousAttributes = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined
  return previousAttributes?.items?.data as Stripe.SubscriptionItem[] | undefined
}

function toRevenueState(state: TrackedSubscriptionState | StripeInfoRevenueState): StripeInfoRevenueState {
  if (!state)
    return state

  return {
    is_good_plan: state.is_good_plan,
    paid_at: state.paid_at,
    price_id: state.price_id,
    product_id: state.product_id,
    status: state.status,
  }
}

function getKnownPaidAtBefore(
  customerId: string,
  eventOccurredAtIso: string,
  trackedPaidAt: string | null | undefined,
  initialPaidAtByCustomerId?: Map<string, string | null>,
) {
  const paidAt = trackedPaidAt ?? initialPaidAtByCustomerId?.get(customerId) ?? null
  if (!paidAt)
    return null

  if (new Date(paidAt).getTime() < new Date(eventOccurredAtIso).getTime())
    return paidAt

  return null
}

function buildTrackedState(
  customerId: string,
  subscriptionId: string | null,
  status: StripeStatus | null,
  priceId: string | null,
  productId: string | null,
  paidAt: string | null,
): TrackedSubscriptionState {
  return {
    customer_id: customerId,
    is_good_plan: true,
    paid_at: paidAt,
    price_id: priceId,
    product_id: productId,
    status,
    subscription_id: subscriptionId,
  }
}

function toMovementEvent(
  event: Stripe.Event,
  customerId: string,
  dateId: string,
  movement: RevenueMovement,
): BackfillRevenueMovementEvent {
  return {
    event_id: event.id,
    event_type: event.type as SubscriptionEventType,
    date_id: dateId,
    customer_id: customerId,
    opening_mrr: movement.currentMrr,
    current_mrr: movement.currentMrr,
    next_mrr: movement.nextMrr,
    new_business_mrr: movement.newBusinessMrr,
    expansion_mrr: movement.expansionMrr,
    contraction_mrr: movement.contractionMrr,
    churn_mrr: movement.churnMrr,
  }
}

export function buildRevenueMovementEvents(
  events: Stripe.Event[],
  plans: RevenuePlanRow[],
  options: BuildRevenueMovementEventsOptions,
): BuildRevenueMovementEventsResult {
  const movements: BackfillRevenueMovementEvent[] = []
  const customerStates = new Map<string, TrackedSubscriptionState>()
  const skipped = {
    missingCustomer: 0,
    missingPlan: 0,
    noMovement: 0,
    outOfRange: 0,
    subscriptionMismatch: 0,
    unsupportedEvent: 0,
  }

  for (const event of sortStripeEvents(events)) {
    if (!isSubscriptionEventType(event.type)) {
      skipped.unsupportedEvent++
      continue
    }

    const eventOccurredAtIso = getEventCreatedIso(event)
    const dateId = getEventDateId(eventOccurredAtIso)
    if (compareDateIds(dateId, options.fromDateId) < 0 || compareDateIds(dateId, options.toDateId) > 0) {
      skipped.outOfRange++
      continue
    }

    const subscription = event.data.object as Stripe.Subscription
    const customerId = toStripeId(subscription.customer)
    if (!customerId) {
      skipped.missingCustomer++
      continue
    }
    if (options.customerId && customerId !== options.customerId) {
      skipped.outOfRange++
      continue
    }

    const subscriptionId = subscription.id ?? null
    const currentItem = getLicensedSubscriptionItem(getSubscriptionItems(subscription))
    const currentPriceId = getItemPriceId(currentItem)
    const currentProductId = getItemProductId(currentItem)
    if (!currentPriceId || !currentProductId) {
      skipped.missingPlan++
      continue
    }

    const trackedState = customerStates.get(customerId)
    const previousItem = getLicensedSubscriptionItem(getPreviousSubscriptionItems(event))
    const previousPriceId = getItemPriceId(previousItem) ?? trackedState?.price_id ?? currentPriceId
    const previousProductId = getItemProductId(previousItem) ?? trackedState?.product_id ?? currentProductId
    const previousMrr = getSubscriptionMrr(plans, {
      is_good_plan: true,
      paid_at: trackedState?.paid_at ?? eventOccurredAtIso,
      price_id: previousPriceId,
      product_id: previousProductId,
      status: 'succeeded',
    })
    const knownPaidAt = getKnownPaidAtBefore(customerId, eventOccurredAtIso, trackedState?.paid_at, options.initialPaidAtByCustomerId)
    const activePaidAt = trackedState?.paid_at ?? knownPaidAt ?? (previousMrr > 0 ? eventOccurredAtIso : null)

    let currentState: TrackedSubscriptionState
    let nextState: TrackedSubscriptionState

    if (event.type === 'customer.subscription.created') {
      currentState = buildTrackedState(customerId, null, 'created', null, null, knownPaidAt)
      nextState = buildTrackedState(customerId, subscriptionId, 'succeeded', currentPriceId, currentProductId, knownPaidAt ?? eventOccurredAtIso)
    }
    else if (event.type === 'customer.subscription.updated') {
      currentState = buildTrackedState(customerId, subscriptionId, previousMrr > 0 ? 'succeeded' : 'updated', previousPriceId, previousProductId, activePaidAt)
      nextState = buildTrackedState(customerId, subscriptionId, 'succeeded', currentPriceId, currentProductId, activePaidAt ?? eventOccurredAtIso)
    }
    else {
      const baselineSubscriptionId = trackedState?.subscription_id ?? options.initialSubscriptionIdByCustomerId?.get(customerId) ?? null
      if (baselineSubscriptionId && baselineSubscriptionId !== subscriptionId) {
        skipped.subscriptionMismatch++
        continue
      }

      currentState = buildTrackedState(customerId, subscriptionId, 'succeeded', trackedState?.price_id ?? currentPriceId, trackedState?.product_id ?? currentProductId, activePaidAt ?? eventOccurredAtIso)
      nextState = buildTrackedState(customerId, subscriptionId, 'deleted', currentPriceId, currentProductId, activePaidAt ?? eventOccurredAtIso)
    }

    const movement = classifyRevenueMovement(toRevenueState(currentState), toRevenueState(nextState), plans)
    customerStates.set(customerId, nextState)

    if (!hasRevenueMovement(movement)) {
      skipped.noMovement++
      continue
    }

    movements.push(toMovementEvent(event, customerId, dateId, movement))
  }

  return { movements, skipped }
}

export function aggregateRevenueMovementEvents(movements: BackfillRevenueMovementEvent[]): DailyRevenueMetricInsert[] {
  const metricsByKey = new Map<string, DailyRevenueMetricInsert>()

  for (const movement of movements) {
    const key = `${movement.date_id}:${movement.customer_id}`
    const existing = metricsByKey.get(key)
    if (!existing) {
      metricsByKey.set(key, {
        date_id: movement.date_id,
        customer_id: movement.customer_id,
        opening_mrr: movement.opening_mrr,
        new_business_mrr: movement.new_business_mrr,
        expansion_mrr: movement.expansion_mrr,
        contraction_mrr: movement.contraction_mrr,
        churn_mrr: movement.churn_mrr,
      })
      continue
    }

    existing.new_business_mrr = Number(existing.new_business_mrr) + movement.new_business_mrr
    existing.expansion_mrr = Number(existing.expansion_mrr) + movement.expansion_mrr
    existing.contraction_mrr = Number(existing.contraction_mrr) + movement.contraction_mrr
    existing.churn_mrr = Number(existing.churn_mrr) + movement.churn_mrr
  }

  return [...metricsByKey.values()].sort((left, right) => {
    const dateCompare = left.date_id.localeCompare(right.date_id)
    if (dateCompare !== 0)
      return dateCompare
    return left.customer_id.localeCompare(right.customer_id)
  })
}

export function summarizeDailyRevenueMetrics(rows: Pick<DailyRevenueMetricInsert, 'churn_mrr' | 'contraction_mrr' | 'expansion_mrr' | 'new_business_mrr' | 'opening_mrr'>[]): BackfillSummary {
  return rows.reduce<BackfillSummary>((summary, row) => {
    summary.rows++
    summary.opening_mrr += Number(row.opening_mrr) || 0
    summary.new_business_mrr += Number(row.new_business_mrr) || 0
    summary.expansion_mrr += Number(row.expansion_mrr) || 0
    summary.contraction_mrr += Number(row.contraction_mrr) || 0
    summary.churn_mrr += Number(row.churn_mrr) || 0
    return summary
  }, {
    rows: 0,
    opening_mrr: 0,
    new_business_mrr: 0,
    expansion_mrr: 0,
    contraction_mrr: 0,
    churn_mrr: 0,
  })
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

  return sortStripeEvents(events as Stripe.Event[])
}

async function fetchStripeEvents(stripe: StripeClient, fromDateId: string, toDateId: string, limit: number | null) {
  const events: Stripe.Event[] = []
  for (const type of SUBSCRIPTION_EVENT_TYPES) {
    const params = {
      created: {
        gte: dateIdToStartSeconds(fromDateId),
        lte: dateIdToEndSeconds(toDateId),
      },
      limit: EVENT_FETCH_PAGE_SIZE,
      type,
    } as Stripe.EventListParams

    for await (const event of stripe.events.list(params)) {
      events.push(event)
      if (limit && events.length >= limit)
        return sortStripeEvents(events)
    }
  }

  return sortStripeEvents(events)
}

function getCustomerIdsFromEvents(events: Stripe.Event[], customerId?: string | null) {
  if (customerId)
    return [customerId]

  return [...new Set(events.flatMap((event) => {
    if (!isSubscriptionEventType(event.type))
      return []
    const subscription = event.data.object as Stripe.Subscription
    const id = toStripeId(subscription.customer)
    return id ? [id] : []
  }))].sort()
}

async function fetchRevenuePlans(supabase: SupabaseClient): Promise<RevenuePlanRow[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('stripe_id, price_m, price_y, price_m_id, price_y_id')
    .in('name', ['Solo', 'Maker', 'Team', 'Enterprise'])

  if (error)
    throw error

  return data ?? []
}

async function fetchInitialCustomerRevenueBaseline(supabase: SupabaseClient, customerIds: string[]) {
  const paidAtByCustomerId = new Map<string, string | null>()
  const subscriptionIdByCustomerId = new Map<string, string | null>()
  for (const chunk of chunkArray(customerIds, DB_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('stripe_info')
      .select('customer_id, paid_at, subscription_id')
      .in('customer_id', chunk)

    if (error)
      throw error

    for (const row of (data ?? []) as CustomerRevenueBaselineRow[]) {
      paidAtByCustomerId.set(row.customer_id, row.paid_at)
      subscriptionIdByCustomerId.set(row.customer_id, row.subscription_id)
    }
  }
  return { paidAtByCustomerId, subscriptionIdByCustomerId }
}

async function fetchExistingProcessedEventIds(supabase: SupabaseClient, eventIds: string[]) {
  const existing = new Set<string>()
  for (const chunk of chunkArray(eventIds, DB_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('processed_stripe_events')
      .select('event_id')
      .in('event_id', chunk)

    if (error)
      throw error

    for (const row of data ?? [])
      existing.add(row.event_id)
  }
  return existing
}

async function resetBackfillRange(supabase: SupabaseClient, fromDateId: string, toDateId: string, customerId?: string | null) {
  let processedDelete = supabase
    .from('processed_stripe_events')
    .delete()
    .gte('date_id', fromDateId)
    .lte('date_id', toDateId)
  let metricsDelete = supabase
    .from('daily_revenue_metrics')
    .delete()
    .gte('date_id', fromDateId)
    .lte('date_id', toDateId)

  if (customerId) {
    processedDelete = processedDelete.eq('customer_id', customerId)
    metricsDelete = metricsDelete.eq('customer_id', customerId)
  }

  const [processedResult, metricsResult] = await Promise.all([processedDelete, metricsDelete])
  if (processedResult.error)
    throw processedResult.error
  if (metricsResult.error)
    throw metricsResult.error
}

async function insertProcessedEvents(supabase: SupabaseClient, movements: BackfillRevenueMovementEvent[]) {
  const rows: ProcessedStripeEventInsert[] = movements.map(movement => ({
    event_id: movement.event_id,
    customer_id: movement.customer_id,
    date_id: movement.date_id,
  }))

  for (const chunk of chunkArray(rows, DB_CHUNK_SIZE)) {
    if (chunk.length === 0)
      continue

    const { error } = await supabase
      .from('processed_stripe_events')
      .insert(chunk)

    if (error)
      throw error
  }
}

async function fetchExistingDailyRevenueMetrics(
  supabase: SupabaseClient,
  fromDateId: string,
  toDateId: string,
  customerId?: string | null,
) {
  let query = supabase
    .from('daily_revenue_metrics')
    .select('*')
    .gte('date_id', fromDateId)
    .lte('date_id', toDateId)

  if (customerId)
    query = query.eq('customer_id', customerId)

  const { data, error } = await query
  if (error)
    throw error

  return data ?? []
}

export function mergeMetricRows(existingRows: DailyRevenueMetricRow[], rowsToAdd: DailyRevenueMetricInsert[]) {
  const existingByKey = new Map(existingRows.map(row => [`${row.date_id}:${row.customer_id}`, row]))

  return rowsToAdd.map((row) => {
    const existing = existingByKey.get(`${row.date_id}:${row.customer_id}`)
    if (!existing)
      return row

    return {
      date_id: row.date_id,
      customer_id: row.customer_id,
      opening_mrr: existing.opening_mrr ?? row.opening_mrr ?? 0,
      new_business_mrr: (Number(existing.new_business_mrr) || 0) + (Number(row.new_business_mrr) || 0),
      expansion_mrr: (Number(existing.expansion_mrr) || 0) + (Number(row.expansion_mrr) || 0),
      contraction_mrr: (Number(existing.contraction_mrr) || 0) + (Number(row.contraction_mrr) || 0),
      churn_mrr: (Number(existing.churn_mrr) || 0) + (Number(row.churn_mrr) || 0),
    }
  })
}

async function upsertDailyRevenueMetrics(supabase: SupabaseClient, rows: DailyRevenueMetricInsert[]) {
  for (const chunk of chunkArray(rows, DB_CHUNK_SIZE)) {
    if (chunk.length === 0)
      continue

    const { error } = await supabase
      .from('daily_revenue_metrics')
      .upsert(chunk, { onConflict: 'date_id,customer_id' })

    if (error)
      throw error
  }
}

async function fetchDailyRevenueMetricsForDate(supabase: SupabaseClient, dateId: string) {
  const { data, error } = await supabase
    .from('daily_revenue_metrics')
    .select('opening_mrr, churn_mrr, contraction_mrr, expansion_mrr')
    .eq('date_id', dateId)

  if (error)
    throw error

  return data ?? []
}

async function fetchPreviousMrr(supabase: SupabaseClient, dateId: string) {
  const { data, error } = await supabase
    .from('global_stats')
    .select('mrr')
    .eq('date_id', getPreviousDateId(dateId))
    .maybeSingle()

  if (error)
    throw error

  return Number(data?.mrr) || 0
}

async function refreshGlobalRetentionMetrics(supabase: SupabaseClient, dateIds: string[]): Promise<RefreshRetentionMetricsResult> {
  const skippedMissingGlobalStats: string[] = []
  let updated = 0

  for (const dateId of dateIds) {
    const [rows, previousMrr] = await Promise.all([
      fetchDailyRevenueMetricsForDate(supabase, dateId),
      fetchPreviousMrr(supabase, dateId),
    ])
    const retainedChanges = rows.reduce((summary, row) => {
      if ((Number(row.opening_mrr) || 0) <= 0)
        return summary

      summary.churnMrr += Number(row.churn_mrr) || 0
      summary.contractionMrr += Number(row.contraction_mrr) || 0
      summary.expansionMrr += Number(row.expansion_mrr) || 0
      return summary
    }, { churnMrr: 0, contractionMrr: 0, expansionMrr: 0 })
    const totalLostRevenue = rows.reduce((summary, row) => {
      summary.churnMrr += Number(row.churn_mrr) || 0
      summary.contractionMrr += Number(row.contraction_mrr) || 0
      return summary
    }, { churnMrr: 0, contractionMrr: 0, expansionMrr: 0 })

    const { data: globalStats, error: globalStatsError } = await supabase
      .from('global_stats')
      .select('date_id')
      .eq('date_id', dateId)
      .maybeSingle()

    if (globalStatsError)
      throw globalStatsError
    if (!globalStats) {
      skippedMissingGlobalStats.push(dateId)
      continue
    }

    const { error } = await supabase
      .from('global_stats')
      .update({
        churn_revenue: calculateChurnRevenue(totalLostRevenue),
        nrr: calculateNrr(previousMrr, retainedChanges),
      })
      .eq('date_id', dateId)

    if (error)
      throw error

    updated++
  }

  return { skippedMissingGlobalStats, updated }
}

async function writeFailures(failures: unknown[]) {
  if (failures.length === 0)
    return

  await mkdir('./tmp', { recursive: true })
  await writeFile(FAILURE_OUTPUT, `${JSON.stringify(failures, null, 2)}\n`)
}

function printSummary(label: string, summary: BackfillSummary) {
  console.log(`${label}: rows=${summary.rows}, opening_mrr=${summary.opening_mrr.toFixed(2)}, new_business_mrr=${summary.new_business_mrr.toFixed(2)}, expansion_mrr=${summary.expansion_mrr.toFixed(2)}, contraction_mrr=${summary.contraction_mrr.toFixed(2)}, churn_mrr=${summary.churn_mrr.toFixed(2)}`)
}

async function main(args = process.argv.slice(2), runtimeEnv: Record<string, string | undefined> = process.env) {
  const apply = args.includes('--apply')
  const reset = args.includes('--reset')
  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const eventsFile = getArgValue(args, '--events-file')
  const customerId = getArgValue(args, '--customer-id')
  const limitArg = getArgValue(args, '--limit')
  const limit = limitArg ? Number.parseInt(limitArg, 10) : null
  const fromDateId = parseDateId(getArgValue(args, '--from') ?? dateIdDaysAgo(DEFAULT_LOOKBACK_DAYS), '--from')
  const toDateId = parseDateId(getArgValue(args, '--to') ?? todayDateId(), '--to')

  if (compareDateIds(fromDateId, toDateId) > 0)
    throw new Error('--from must be before or equal to --to')
  if (limit !== null && (!Number.isInteger(limit) || limit < 1))
    throw new Error('--limit must be a positive integer')

  const fileEnv = await loadEnv(envFile)
  const env = {
    ...fileEnv,
    ...runtimeEnv,
  }
  const supabaseUrl = getRequiredEnv(env, 'SUPABASE_URL')
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.SUPABASE_SERVICE_KEY?.trim()
  if (!supabaseServiceRoleKey)
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient<Database>(
    supabaseUrl,
    supabaseServiceRoleKey,
    { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } },
  )

  console.log(`Backfill range: ${fromDateId}..${toDateId}`)
  console.log(`Env file: ${envFile}`)
  if (customerId)
    console.log(`Scoped to customer: ${customerId}`)
  if (!apply)
    console.log('Dry run only. Pass --apply to write rows.')
  if (reset)
    console.log('Reset enabled. Existing processed_stripe_events and daily_revenue_metrics rows in range will be rebuilt.')

  let events: Stripe.Event[]
  if (eventsFile) {
    events = await loadEventsFile(eventsFile)
    console.log(`Loaded ${events.length} events from ${eventsFile}`)
  }
  else {
    const oldestEventApiDateId = dateIdDaysAgo(DEFAULT_LOOKBACK_DAYS)
    if (compareDateIds(fromDateId, oldestEventApiDateId) < 0)
      console.warn('Stripe Events API only exposes recent events. Use --events-file for older archived Stripe events.')

    const stripeSecretKey = getRequiredEnv(env, 'STRIPE_SECRET_KEY')
    const stripe = createStripeClient(stripeSecretKey, env.STRIPE_API_BASE_URL?.trim())
    events = await fetchStripeEvents(stripe, fromDateId, toDateId, limit)
    console.log(`Fetched ${events.length} subscription events from Stripe`)
  }

  const customerIds = getCustomerIdsFromEvents(events, customerId)
  const [plans, initialCustomerRevenueBaseline] = await Promise.all([
    fetchRevenuePlans(supabase),
    fetchInitialCustomerRevenueBaseline(supabase, customerIds),
  ])
  const { movements, skipped } = buildRevenueMovementEvents(events, plans, {
    customerId,
    fromDateId,
    initialPaidAtByCustomerId: initialCustomerRevenueBaseline.paidAtByCustomerId,
    initialSubscriptionIdByCustomerId: initialCustomerRevenueBaseline.subscriptionIdByCustomerId,
    toDateId,
  })
  const movementSummary = summarizeDailyRevenueMetrics(movements.map(movement => ({
    opening_mrr: movement.opening_mrr,
    new_business_mrr: movement.new_business_mrr,
    expansion_mrr: movement.expansion_mrr,
    contraction_mrr: movement.contraction_mrr,
    churn_mrr: movement.churn_mrr,
  })))
  printSummary('Detected revenue movements', movementSummary)
  console.log(`Skipped: ${JSON.stringify(skipped)}`)

  let movementsToApply = movements
  if (!reset) {
    const existingEventIds = await fetchExistingProcessedEventIds(supabase, movements.map(movement => movement.event_id))
    movementsToApply = movements.filter(movement => !existingEventIds.has(movement.event_id))
    console.log(`Existing processed events skipped: ${movements.length - movementsToApply.length}`)
  }

  const metricRowsToApply = aggregateRevenueMovementEvents(movementsToApply)
  printSummary('Daily metrics to apply', summarizeDailyRevenueMetrics(metricRowsToApply))

  if (!apply) {
    console.log('Sample metric rows:')
    for (const row of metricRowsToApply.slice(0, 10))
      console.log(row)
    return
  }

  if (reset)
    await resetBackfillRange(supabase, fromDateId, toDateId, customerId)

  const existingMetrics = reset
    ? []
    : await fetchExistingDailyRevenueMetrics(supabase, fromDateId, toDateId, customerId)
  const mergedMetricRows = reset
    ? metricRowsToApply
    : mergeMetricRows(existingMetrics, metricRowsToApply)

  const failures: unknown[] = []
  try {
    await insertProcessedEvents(supabase, movementsToApply)
    await upsertDailyRevenueMetrics(supabase, mergedMetricRows)
    const retentionDates = reset
      ? getDateIdsBetween(fromDateId, toDateId)
      : [...new Set(metricRowsToApply.map(row => row.date_id))].sort()
    const refreshResult = await refreshGlobalRetentionMetrics(supabase, retentionDates)
    console.log(`Updated global_stats retention metrics for ${refreshResult.updated} dates`)
    if (refreshResult.skippedMissingGlobalStats.length > 0)
      console.log(`Skipped missing global_stats rows: ${refreshResult.skippedMissingGlobalStats.join(', ')}`)
  }
  catch (error) {
    failures.push({
      error: error instanceof Error ? error.message : String(error),
      fromDateId,
      toDateId,
      customerId,
      reset,
    })
  }

  await writeFailures(failures)
  if (failures.length > 0)
    throw new Error(`Retention metric backfill failed. Details written to ${FAILURE_OUTPUT}`)

  console.log(`Done. Processed movements: ${movementsToApply.length}. Daily metric rows: ${mergedMetricRows.length}.`)
}

if (import.meta.main)
  await main()
