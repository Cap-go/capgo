import type Stripe from 'stripe'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_MONTH_MS = 30 * ONE_DAY_MS
const MERGE_TOLERANCE_MS = ONE_DAY_MS

export interface PaidInterval {
  endMs: number
  startMs: number
}

export interface CustomerPaidCoverage {
  activePaying: boolean
  intervals: PaidInterval[]
}

export interface CustomerPaidSummary {
  activePaying: boolean
  customerId: string
  paidDurationMonths: number
  paidDurationMs: number
}

export interface CustomerPaidCoverageResult {
  coverageByCustomerId: Map<string, CustomerPaidCoverage>
  customerIdsWithPositivePaidInvoices: Set<string>
}

interface CollectPaidCoverageOptions {
  customerId?: string | null
  excludeCustomerIds?: Set<string>
  includeCustomerIds?: Set<string>
  invoiceLimit?: number | null
  nowMs: number
}

export function toStripeId(value: string | { id?: string } | null | undefined) {
  if (typeof value === 'string')
    return value
  return value?.id ?? null
}

function getInvoiceAmountPaid(invoice: Stripe.Invoice) {
  const amountPaid = (invoice as { amount_paid?: number | null }).amount_paid
  return typeof amountPaid === 'number' ? amountPaid : 0
}

function isPaidSubscriptionInvoice(invoice: Stripe.Invoice) {
  if (invoice.status !== 'paid' || getInvoiceAmountPaid(invoice) <= 0)
    return false

  const billingReason = (invoice as { billing_reason?: string | null }).billing_reason
  if (billingReason?.startsWith('subscription'))
    return true

  return !!(invoice as { subscription?: string | Stripe.Subscription | null }).subscription
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

function getLineInterval(line: Stripe.InvoiceLineItem) {
  const amount = (line as { amount?: number | null }).amount
  const period = (line as { period?: { end?: number | null, start?: number | null } | null }).period
  const start = period?.start
  const end = period?.end

  if (typeof amount === 'number' && amount <= 0)
    return null
  if (typeof start !== 'number' || typeof end !== 'number' || end <= start)
    return null

  return {
    startMs: start * 1000,
    endMs: end * 1000,
  }
}

function getInvoiceFallbackInterval(invoice: Stripe.Invoice) {
  const periodStart = (invoice as { period_start?: number | null }).period_start
  const periodEnd = (invoice as { period_end?: number | null }).period_end

  if (typeof periodStart !== 'number' || typeof periodEnd !== 'number' || periodEnd <= periodStart)
    return null

  return {
    startMs: periodStart * 1000,
    endMs: periodEnd * 1000,
  }
}

async function getInvoiceLines(stripe: Stripe, invoice: Stripe.Invoice) {
  const lines = [...invoice.lines.data]
  if (!invoice.lines.has_more)
    return lines

  const params: Stripe.InvoiceListLineItemsParams = { limit: 100 }
  const startingAfter = lines.at(-1)?.id
  if (startingAfter)
    params.starting_after = startingAfter

  for await (const line of stripe.invoices.listLineItems(invoice.id, params))
    lines.push(line)

  return lines
}

async function getInvoicePaidIntervals(stripe: Stripe, invoice: Stripe.Invoice) {
  if (!isPaidSubscriptionInvoice(invoice))
    return []

  const lines = await getInvoiceLines(stripe, invoice)
  const subscriptionIntervals = lines
    .filter(isSubscriptionLine)
    .map(getLineInterval)
    .filter((interval): interval is PaidInterval => !!interval)

  if (subscriptionIntervals.length > 0)
    return subscriptionIntervals

  const positiveLineIntervals = lines
    .map(getLineInterval)
    .filter((interval): interval is PaidInterval => !!interval)
  if (positiveLineIntervals.length > 0)
    return positiveLineIntervals

  const fallback = getInvoiceFallbackInterval(invoice)
  return fallback ? [fallback] : []
}

function addPaidCoverage(
  coverageByCustomerId: Map<string, CustomerPaidCoverage>,
  customerId: string,
  intervals: PaidInterval[],
  nowMs: number,
) {
  const current = coverageByCustomerId.get(customerId) ?? {
    activePaying: false,
    intervals: [],
  }

  current.intervals.push(...intervals)
  current.activePaying = current.activePaying
    || intervals.some(interval => interval.startMs <= nowMs && interval.endMs > nowMs)
  coverageByCustomerId.set(customerId, current)
}

function shouldIncludeCustomer(customerId: string, options: CollectPaidCoverageOptions) {
  if (options.customerId && customerId !== options.customerId)
    return false
  if (options.includeCustomerIds && !options.includeCustomerIds.has(customerId))
    return false
  if (options.excludeCustomerIds?.has(customerId))
    return false
  return true
}

export async function collectPaidCoverageByCustomerId(
  stripe: Stripe,
  options: CollectPaidCoverageOptions,
): Promise<CustomerPaidCoverageResult> {
  const coverageByCustomerId = new Map<string, CustomerPaidCoverage>()
  const customerIdsWithPositivePaidInvoices = new Set<string>()
  const invoiceListParams: Stripe.InvoiceListParams = {
    limit: 100,
    status: 'paid',
  }

  if (options.customerId)
    invoiceListParams.customer = options.customerId

  let checkedInvoices = 0
  let matchedInvoices = 0
  for await (const invoice of stripe.invoices.list(invoiceListParams)) {
    checkedInvoices++

    const customerId = toStripeId(invoice.customer)
    if (customerId && shouldIncludeCustomer(customerId, options)) {
      if (getInvoiceAmountPaid(invoice) > 0)
        customerIdsWithPositivePaidInvoices.add(customerId)

      const intervals = await getInvoicePaidIntervals(stripe, invoice)
      if (intervals.length > 0) {
        addPaidCoverage(coverageByCustomerId, customerId, intervals, options.nowMs)
        matchedInvoices++
      }
    }

    if (checkedInvoices % 500 === 0)
      console.log(`Checked ${checkedInvoices} paid Stripe invoices (${matchedInvoices} matched subscription invoices)`)

    if (options.invoiceLimit && checkedInvoices >= options.invoiceLimit)
      break
  }

  console.log(`Checked ${checkedInvoices} paid Stripe invoices (${matchedInvoices} matched subscription invoices)`)
  return {
    coverageByCustomerId,
    customerIdsWithPositivePaidInvoices,
  }
}

function mergeElapsedIntervals(intervals: PaidInterval[], nowMs: number) {
  const elapsedIntervals = intervals
    .map(interval => ({
      startMs: interval.startMs,
      endMs: Math.min(interval.endMs, nowMs),
    }))
    .filter(interval => interval.endMs > interval.startMs)
    .sort((left, right) => left.startMs - right.startMs)

  const merged: PaidInterval[] = []
  for (const interval of elapsedIntervals) {
    const previous = merged.at(-1)
    if (!previous || interval.startMs > previous.endMs + MERGE_TOLERANCE_MS) {
      merged.push({ ...interval })
      continue
    }

    previous.endMs = Math.max(previous.endMs, interval.endMs)
  }

  return merged
}

export function getPaidDurationMs(intervals: PaidInterval[], nowMs: number) {
  return mergeElapsedIntervals(intervals, nowMs)
    .reduce((total, interval) => total + interval.endMs - interval.startMs, 0)
}

export function toPaidDurationMonths(paidDurationMs: number) {
  return Number((paidDurationMs / ONE_MONTH_MS).toFixed(2))
}

export function buildPaidCustomerSummaries(
  coverageByCustomerId: Map<string, CustomerPaidCoverage>,
  options: {
    minMonths?: number
    nowMs: number
  },
) {
  const minPaidDurationMs = (options.minMonths ?? 0) * ONE_MONTH_MS
  const summaries: CustomerPaidSummary[] = []

  for (const [customerId, coverage] of coverageByCustomerId.entries()) {
    const paidDurationMs = getPaidDurationMs(coverage.intervals, options.nowMs)
    if (paidDurationMs < minPaidDurationMs)
      continue

    summaries.push({
      activePaying: coverage.activePaying,
      customerId,
      paidDurationMs,
      paidDurationMonths: toPaidDurationMonths(paidDurationMs),
    })
  }

  return summaries.sort((left, right) => {
    if (left.activePaying !== right.activePaying)
      return left.activePaying ? -1 : 1
    return right.paidDurationMs - left.paidDurationMs
  })
}

export function escapeCsv(value: string | number | boolean | null) {
  const rawText = String(value ?? '')
  const text = typeof value === 'string' && /^[=+\-@]/.test(rawText)
    ? `'${rawText}`
    : rawText
  if (!/[",\n\r]/.test(text))
    return text
  return `"${text.replaceAll('"', '""')}"`
}

export async function writeCsv(outputPath: string, csv: string) {
  const resolvedOutputPath = resolve(outputPath)
  await mkdir(dirname(resolvedOutputPath), { recursive: true })
  await writeFile(resolvedOutputPath, csv, { mode: 0o600 })
  await chmod(resolvedOutputPath, 0o600)
}
