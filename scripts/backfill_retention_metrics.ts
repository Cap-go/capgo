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
 *   --apply uses one Postgres transaction for metric writes, global_stats refresh,
 *   processed-event markers, and optional --reset deletes.
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
import { Client as PgClient } from 'pg'
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
type StripeStatus = Database['public']['Enums']['stripe_status']
type SubscriptionEventType = typeof SUBSCRIPTION_EVENT_TYPES[number]

interface CustomerRevenueBaselineRow {
  customer_id: string
  paid_at: string | null
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

interface ApplyBackfillTransactionOptions {
  customerId?: string | null
  databaseUrl: string
  fromDateId: string
  mergedMetricRows: DailyRevenueMetricInsert[]
  movementsToApply: BackfillRevenueMovementEvent[]
  reset: boolean
  retentionDates: string[]
  toDateId: string
}

interface RetentionMetricSummaryRow {
  has_global_stats: boolean
  lost_churn_mrr: number | string | null
  lost_contraction_mrr: number | string | null
  previous_mrr: number | string | null
  retained_churn_mrr: number | string | null
  retained_contraction_mrr: number | string | null
  retained_expansion_mrr: number | string | null
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

function getRequiredDatabaseUrl(env: Record<string, string | undefined>) {
  const value = getDatabaseUrl(env)
  if (!value)
    throw new Error('--apply requires DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL, SUPABASE_DB_DIRECT_URL, or DIRECT_URL so metric writes and processed-event markers are committed atomically')
  return value
}

function getDatabaseUrl(env: Record<string, string | undefined>) {
  return env.DATABASE_URL?.trim()
    || env.POSTGRES_URL?.trim()
    || env.SUPABASE_DB_URL?.trim()
    || env.SUPABASE_DB_DIRECT_URL?.trim()
    || env.DIRECT_URL?.trim()
    || null
}

function createPgClient(databaseUrl: string) {
  const host = new URL(databaseUrl).hostname
  const usesLocalDatabase = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  return new PgClient({
    connectionString: databaseUrl,
    ssl: usesLocalDatabase ? false : { rejectUnauthorized: false },
  })
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

function getLicensedSubscriptionItem(items: Stripe.SubscriptionItem[] | undefined) {
  const licensedItem = items?.find(item => item.plan?.usage_type === 'licensed') ?? null
  if (licensedItem)
    return licensedItem

  if (items?.length)
    console.warn(`No licensed subscription item found; ignoring ${items.length} subscription item(s). First item usage_type=${items[0]?.plan?.usage_type ?? 'unknown'}`)

  return null
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

function toBackfillStripeStatus(status: unknown): StripeStatus | null {
  if (status === 'active' || status === 'trialing' || status === 'succeeded')
    return 'succeeded'
  if (status === 'created' || status === 'updated' || status === 'failed' || status === 'deleted' || status === 'canceled')
    return status
  return null
}

function getPreviousSubscriptionStatus(event: Stripe.Event) {
  const previousAttributes = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined
  if (!previousAttributes || !Object.hasOwn(previousAttributes, 'status'))
    return { hasStatus: false, status: null as StripeStatus | null }

  return {
    hasStatus: true,
    status: toBackfillStripeStatus(previousAttributes.status),
  }
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
    const isBeforeRange = compareDateIds(dateId, options.fromDateId) < 0
    if (compareDateIds(dateId, options.toDateId) > 0) {
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
    const previousStatusChange = getPreviousSubscriptionStatus(event)
    const shouldReuseCurrentPlanForPreviousState = !trackedState && !previousItem && previousStatusChange.status === 'succeeded'
    const previousPriceId = getItemPriceId(previousItem) ?? trackedState?.price_id ?? (shouldReuseCurrentPlanForPreviousState ? currentPriceId : null)
    const previousProductId = getItemProductId(previousItem) ?? trackedState?.product_id ?? (shouldReuseCurrentPlanForPreviousState ? currentProductId : null)
    const previousStatus = trackedState?.status ?? (previousItem ? 'succeeded' : previousStatusChange.status)
    const previousMrr = getSubscriptionMrr(plans, {
      is_good_plan: true,
      paid_at: trackedState?.paid_at ?? eventOccurredAtIso,
      price_id: previousPriceId,
      product_id: previousProductId,
      status: previousStatus,
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
      const hasPreviousRevenueState = Boolean(trackedState || previousItem || previousStatusChange.hasStatus)
      currentState = buildTrackedState(customerId, subscriptionId, previousMrr > 0 ? 'succeeded' : 'updated', previousPriceId, previousProductId, activePaidAt)
      nextState = buildTrackedState(customerId, subscriptionId, 'succeeded', currentPriceId, currentProductId, activePaidAt ?? eventOccurredAtIso)
      if (!hasPreviousRevenueState) {
        customerStates.set(customerId, nextState)
        if (isBeforeRange)
          skipped.outOfRange++
        else
          skipped.noMovement++
        continue
      }
    }
    else {
      const baselineSubscriptionId = trackedState?.subscription_id ?? null
      if (baselineSubscriptionId && baselineSubscriptionId !== subscriptionId) {
        skipped.subscriptionMismatch++
        continue
      }

      currentState = buildTrackedState(customerId, subscriptionId, 'succeeded', trackedState?.price_id ?? currentPriceId, trackedState?.product_id ?? currentProductId, activePaidAt ?? eventOccurredAtIso)
      nextState = buildTrackedState(customerId, subscriptionId, 'deleted', currentPriceId, currentProductId, activePaidAt ?? eventOccurredAtIso)
    }

    const movement = classifyRevenueMovement(toRevenueState(currentState), toRevenueState(nextState), plans)
    customerStates.set(customerId, nextState)

    if (isBeforeRange) {
      skipped.outOfRange++
      continue
    }

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

  return sortStripeEvents(events.map(normalizeStripeEventFromFile))
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
  for (const chunk of chunkArray(customerIds, DB_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('stripe_info')
      .select('customer_id, paid_at')
      .in('customer_id', chunk)

    if (error)
      throw error

    for (const row of (data ?? []) as CustomerRevenueBaselineRow[]) {
      paidAtByCustomerId.set(row.customer_id, row.paid_at)
    }
  }
  return { paidAtByCustomerId }
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

async function withPgTransaction<T>(databaseUrl: string, action: (client: PgClient) => Promise<T>) {
  const client = createPgClient(databaseUrl)
  await client.connect()

  try {
    await client.query('BEGIN')
    const result = await action(client)
    await client.query('COMMIT')
    return result
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
  finally {
    await client.end()
  }
}

async function resetBackfillRangePg(client: PgClient, fromDateId: string, toDateId: string, customerId?: string | null) {
  const values = [fromDateId, toDateId]
  const predicates = ['date_id >= $1', 'date_id <= $2']
  if (customerId) {
    values.push(customerId)
    predicates.push(`customer_id = $${values.length}`)
  }

  await client.query(`DELETE FROM public.processed_stripe_events WHERE ${predicates.join(' AND ')}`, values)
  await client.query(`DELETE FROM public.daily_revenue_metrics WHERE ${predicates.join(' AND ')}`, values)
}

async function upsertDailyRevenueMetricsPg(client: PgClient, rows: DailyRevenueMetricInsert[]) {
  for (const chunk of chunkArray(rows, DB_CHUNK_SIZE)) {
    if (chunk.length === 0)
      continue

    const values: Array<number | string> = []
    const placeholders = chunk.map((row, index) => {
      const offset = index * 7
      values.push(
        row.date_id,
        row.customer_id,
        Number(row.opening_mrr) || 0,
        Number(row.new_business_mrr) || 0,
        Number(row.expansion_mrr) || 0,
        Number(row.contraction_mrr) || 0,
        Number(row.churn_mrr) || 0,
      )
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
    })

    await client.query(`
      INSERT INTO public.daily_revenue_metrics (
        date_id,
        customer_id,
        opening_mrr,
        new_business_mrr,
        expansion_mrr,
        contraction_mrr,
        churn_mrr
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (date_id, customer_id) DO UPDATE
      SET
        updated_at = now(),
        opening_mrr = EXCLUDED.opening_mrr,
        new_business_mrr = EXCLUDED.new_business_mrr,
        expansion_mrr = EXCLUDED.expansion_mrr,
        contraction_mrr = EXCLUDED.contraction_mrr,
        churn_mrr = EXCLUDED.churn_mrr
    `, values)
  }
}

async function insertProcessedEventsPg(client: PgClient, movements: BackfillRevenueMovementEvent[]) {
  for (const chunk of chunkArray(movements, DB_CHUNK_SIZE)) {
    if (chunk.length === 0)
      continue

    const values: string[] = []
    const placeholders = chunk.map((movement, index) => {
      const offset = index * 3
      values.push(movement.event_id, movement.customer_id, movement.date_id)
      return `($${offset + 1}, $${offset + 2}, $${offset + 3})`
    })

    await client.query(`
      INSERT INTO public.processed_stripe_events (
        event_id,
        customer_id,
        date_id
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (event_id) DO NOTHING
    `, values)
  }
}

async function refreshGlobalRetentionMetricsPg(client: PgClient, dateIds: string[]): Promise<RefreshRetentionMetricsResult> {
  const skippedMissingGlobalStats: string[] = []
  let updated = 0

  for (const dateId of dateIds) {
    const { rows } = await client.query<RetentionMetricSummaryRow>(`
      SELECT
        EXISTS (
          SELECT 1
          FROM public.global_stats
          WHERE date_id = $1
        ) AS has_global_stats,
        COALESCE((
          SELECT mrr
          FROM public.global_stats
          WHERE date_id = $2
        ), 0) AS previous_mrr,
        COALESCE(SUM(CASE WHEN opening_mrr > 0 THEN churn_mrr ELSE 0 END), 0) AS retained_churn_mrr,
        COALESCE(SUM(CASE WHEN opening_mrr > 0 THEN contraction_mrr ELSE 0 END), 0) AS retained_contraction_mrr,
        COALESCE(SUM(CASE WHEN opening_mrr > 0 THEN expansion_mrr ELSE 0 END), 0) AS retained_expansion_mrr,
        COALESCE(SUM(churn_mrr), 0) AS lost_churn_mrr,
        COALESCE(SUM(contraction_mrr), 0) AS lost_contraction_mrr
      FROM public.daily_revenue_metrics
      WHERE date_id = $1
    `, [dateId, getPreviousDateId(dateId)])
    const row = rows[0]

    if (!row?.has_global_stats) {
      skippedMissingGlobalStats.push(dateId)
      continue
    }

    await client.query(`
      UPDATE public.global_stats
      SET
        churn_revenue = $2,
        nrr = $3
      WHERE date_id = $1
    `, [
      dateId,
      calculateChurnRevenue({
        churnMrr: Number(row.lost_churn_mrr) || 0,
        contractionMrr: Number(row.lost_contraction_mrr) || 0,
        expansionMrr: 0,
      }),
      calculateNrr(Number(row.previous_mrr) || 0, {
        churnMrr: Number(row.retained_churn_mrr) || 0,
        contractionMrr: Number(row.retained_contraction_mrr) || 0,
        expansionMrr: Number(row.retained_expansion_mrr) || 0,
      }),
    ])
    updated++
  }

  return { skippedMissingGlobalStats, updated }
}

async function applyBackfillTransaction(options: ApplyBackfillTransactionOptions) {
  return withPgTransaction(options.databaseUrl, async (client) => {
    if (options.reset)
      await resetBackfillRangePg(client, options.fromDateId, options.toDateId, options.customerId)

    await upsertDailyRevenueMetricsPg(client, options.mergedMetricRows)
    const refreshResult = await refreshGlobalRetentionMetricsPg(client, options.retentionDates)
    await insertProcessedEventsPg(client, options.movementsToApply)
    return refreshResult
  })
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
    console.warn('reset=true: existing processed_stripe_events and daily_revenue_metrics rows are deleted inside the apply transaction before rebuilding the range.')

  const databaseUrl = apply ? getRequiredDatabaseUrl(env) : ''

  let events: Stripe.Event[]
  if (eventsFile) {
    events = await loadEventsFile(eventsFile)
    console.log(`Loaded ${events.length} events from ${eventsFile}`)
  }
  else {
    const oldestEventApiDateId = dateIdDaysAgo(DEFAULT_LOOKBACK_DAYS)
    if (compareDateIds(fromDateId, oldestEventApiDateId) < 0) {
      if (apply && reset)
        throw new Error('Cannot use --apply --reset with Stripe Events API for a range older than recent event history. Provide --events-file for archived events.')
      console.warn('Stripe Events API only exposes recent events. Use --events-file for older archived Stripe events.')
    }

    const stripeSecretKey = getRequiredEnv(env, 'STRIPE_SECRET_KEY')
    const stripe = createStripeClient(stripeSecretKey, env.STRIPE_API_BASE_URL?.trim())
    const fetchFromDateId = !limit && compareDateIds(fromDateId, oldestEventApiDateId) > 0
      ? oldestEventApiDateId
      : fromDateId
    events = await fetchStripeEvents(stripe, fetchFromDateId, toDateId, limit)
    if (fetchFromDateId !== fromDateId)
      console.log(`Fetched recent Stripe events from ${fetchFromDateId} to seed subscription state before ${fromDateId}`)
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

  const existingMetrics = reset
    ? []
    : await fetchExistingDailyRevenueMetrics(supabase, fromDateId, toDateId, customerId)
  const mergedMetricRows = reset
    ? metricRowsToApply
    : mergeMetricRows(existingMetrics, metricRowsToApply)
  const retentionDates = reset
    ? getDateIdsBetween(fromDateId, toDateId)
    : [...new Set(metricRowsToApply.map(row => row.date_id))].sort()

  const failures: unknown[] = []
  try {
    const refreshResult = await applyBackfillTransaction({
      customerId,
      databaseUrl,
      fromDateId,
      mergedMetricRows,
      movementsToApply,
      reset,
      retentionDates,
      toDateId,
    })
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
