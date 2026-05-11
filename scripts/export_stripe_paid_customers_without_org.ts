/*
 * Export Stripe customers that are not attached to any Capgo org.
 *
 * Run:
 *   bun run stripe:export-paid-customers-without-org
 *
 * Optional:
 *   bun run stripe:export-paid-customers-without-org --output=./tmp/export.csv
 *   bun run stripe:export-paid-customers-without-org --customer-id=cus_...
 *   bun run stripe:export-paid-customers-without-org --env-file=./internal/cloudflare/.env.preprod
 */
import type Stripe from 'stripe'
import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import type { CustomerPaidSummary } from './stripe_paid_invoice_export_utils.ts'
import process from 'node:process'
import {
  asyncPool,
  createStripeClient,
  createSupabaseServiceClient,
  DEFAULT_ENV_FILE,
  getArgValue,
  getRequiredEnv,
  isActionableStripeCustomerId,
  loadEnv,
  parsePositiveInteger,
} from './admin_stripe_backfill_utils.ts'
import {
  buildPaidCustomerSummaries,
  collectPaidCoverageByCustomerId,
  escapeCsv,
  writeCsv,
} from './stripe_paid_invoice_export_utils.ts'

const DEFAULT_OUTPUT = './tmp/stripe_paid_customers_without_org.csv'
const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_CONCURRENCY = 8
const DEFAULT_STATUS_FILTER = 'paid'
const STATUS_FILTERS = ['paid', 'active', 'canceled', 'never_paid', 'all'] as const

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>
type OrgCustomerRow = Pick<Database['public']['Tables']['orgs']['Row'], 'customer_id' | 'id'>
type CustomerStatusFilter = typeof STATUS_FILTERS[number]
type CustomerBillingStatus = 'active' | 'canceled' | 'never_paid'

interface StripeCustomerProfile {
  deleted: boolean
  email: string | null
  name: string | null
}

interface StripeCustomerCandidate {
  customerId: string
  profile: StripeCustomerProfile
}

interface ExportRow {
  activePaying: boolean
  billingStatus: CustomerBillingStatus
  customerId: string
  deleted: boolean
  email: string | null
  name: string | null
  paidDurationMonths: number
}

function printHelp() {
  console.log(`Export Stripe customers that are not attached to any Capgo org.

Usage:
  bun run stripe:export-paid-customers-without-org [options]

Options:
  --output=PATH        CSV output path. Default: ${DEFAULT_OUTPUT}.
  --status=VALUE       One of: paid, active, canceled, never_paid, all. Default: ${DEFAULT_STATUS_FILTER}.
  --customer-id=ID    Limit export to one Stripe customer.
  --limit=N           Stop after N paid Stripe invoices. Only allowed for paid, active, canceled.
  --concurrency=N     Stripe customer profile fetch concurrency. Default: ${DEFAULT_CONCURRENCY}.
  --env-file=PATH     Env file to load. Default: ${DEFAULT_ENV_FILE}.
  --help              Show this help.

CSV columns:
  customer_id,email,name,billing_status,paid_duration_months,active_paying,deleted
`)
}

function parseStatusFilter(value: string | null): CustomerStatusFilter {
  if (!value)
    return DEFAULT_STATUS_FILTER

  if ((STATUS_FILTERS as readonly string[]).includes(value))
    return value as CustomerStatusFilter

  throw new Error(`--status must be one of: ${STATUS_FILTERS.join(', ')}`)
}

function normalizeStripeText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || null
}

function normalizeEmail(email: string | null | undefined) {
  return normalizeStripeText(email)?.toLowerCase() ?? null
}

async function fetchOrgCustomerIds(supabase: SupabaseClient, customerId: string | null) {
  const customerIds = new Set<string>()
  let lastSeenOrgId: string | null = null

  while (true) {
    let query = supabase
      .from('orgs')
      .select('id, customer_id')
      .not('customer_id', 'is', null)
      .order('id', { ascending: true })
      .limit(DEFAULT_PAGE_SIZE)

    if (customerId)
      query = query.eq('customer_id', customerId)
    else if (lastSeenOrgId)
      query = query.gt('id', lastSeenOrgId)

    const { data, error } = await query
    if (error)
      throw error
    if (!data?.length)
      break

    for (const row of data as OrgCustomerRow[]) {
      if (isActionableStripeCustomerId(row.customer_id))
        customerIds.add(row.customer_id!)
    }

    if (customerId || data.length < DEFAULT_PAGE_SIZE)
      break
    lastSeenOrgId = data.at(-1)?.id ?? null
  }

  return customerIds
}

function getCustomerProfile(customer: Stripe.Customer | Stripe.DeletedCustomer): StripeCustomerProfile {
  if (customer.deleted) {
    return {
      deleted: true,
      email: null,
      name: null,
    }
  }

  return {
    deleted: false,
    email: normalizeEmail(customer.email),
    name: normalizeStripeText(customer.name),
  }
}

async function fetchCustomerProfile(stripe: Stripe, customerId: string): Promise<StripeCustomerProfile> {
  try {
    return getCustomerProfile(await stripe.customers.retrieve(customerId))
  }
  catch (error) {
    console.warn(`Unable to retrieve Stripe customer ${customerId}:`, error)
    return {
      deleted: false,
      email: null,
      name: null,
    }
  }
}

async function fetchCustomerProfiles(
  stripe: Stripe,
  summaries: CustomerPaidSummary[],
  concurrency: number,
) {
  const profilesByCustomerId = new Map<string, StripeCustomerProfile>()

  await asyncPool(concurrency, summaries, async (summary) => {
    profilesByCustomerId.set(summary.customerId, await fetchCustomerProfile(stripe, summary.customerId))
  })

  return profilesByCustomerId
}

async function fetchStripeCustomersWithoutOrg(
  stripe: Stripe,
  orgCustomerIds: Set<string>,
  customerId: string | null,
) {
  const customers: StripeCustomerCandidate[] = []

  if (customerId) {
    if (orgCustomerIds.has(customerId))
      return customers

    customers.push({
      customerId,
      profile: await fetchCustomerProfile(stripe, customerId),
    })
    return customers
  }

  for await (const customer of stripe.customers.list({ limit: 100 })) {
    if (orgCustomerIds.has(customer.id))
      continue

    customers.push({
      customerId: customer.id,
      profile: getCustomerProfile(customer),
    })
  }

  return customers
}

function getBillingStatus(summary: CustomerPaidSummary): CustomerBillingStatus {
  if (summary.paidDurationMs <= 0)
    return 'never_paid'
  return summary.activePaying ? 'active' : 'canceled'
}

function filterPaidSummaries(summaries: CustomerPaidSummary[], statusFilter: CustomerStatusFilter) {
  if (statusFilter === 'active')
    return summaries.filter(summary => summary.activePaying)
  if (statusFilter === 'canceled')
    return summaries.filter(summary => !summary.activePaying)
  if (statusFilter === 'never_paid')
    return []
  return summaries
}

function buildNeverPaidSummaries(
  customersWithoutOrg: StripeCustomerCandidate[],
  paidCustomerIds: Set<string>,
) {
  return customersWithoutOrg
    .filter(customer => !paidCustomerIds.has(customer.customerId))
    .map((customer): CustomerPaidSummary => ({
      customerId: customer.customerId,
      paidDurationMs: 0,
      paidDurationMonths: 0,
      activePaying: false,
    }))
}

function getStatusSortValue(status: CustomerBillingStatus) {
  if (status === 'active')
    return 0
  if (status === 'canceled')
    return 1
  return 2
}

function buildExportRows(
  summaries: CustomerPaidSummary[],
  profilesByCustomerId: Map<string, StripeCustomerProfile>,
) {
  return summaries.map((summary): ExportRow => {
    const profile = profilesByCustomerId.get(summary.customerId) ?? {
      deleted: false,
      email: null,
      name: null,
    }

    return {
      customerId: summary.customerId,
      email: profile.email,
      name: profile.name,
      billingStatus: getBillingStatus(summary),
      paidDurationMonths: summary.paidDurationMonths,
      activePaying: summary.activePaying,
      deleted: profile.deleted,
    }
  }).sort((left, right) => {
    if (left.billingStatus !== right.billingStatus)
      return getStatusSortValue(left.billingStatus) - getStatusSortValue(right.billingStatus)
    if (left.activePaying !== right.activePaying)
      return left.activePaying ? -1 : 1
    if (left.paidDurationMonths !== right.paidDurationMonths)
      return right.paidDurationMonths - left.paidDurationMonths
    return left.customerId.localeCompare(right.customerId)
  })
}

function toCsv(rows: ExportRow[]) {
  const header = ['customer_id', 'email', 'name', 'billing_status', 'paid_duration_months', 'active_paying', 'deleted']
  const lines = rows.map(row => [
    row.customerId,
    row.email,
    row.name,
    row.billingStatus,
    row.paidDurationMonths.toFixed(2),
    row.activePaying,
    row.deleted,
  ].map(escapeCsv).join(','))

  return `${[header.join(','), ...lines].join('\n')}\n`
}

async function main(args = process.argv.slice(2), runtimeEnv: Record<string, string | undefined> = process.env) {
  if (args.includes('--help')) {
    printHelp()
    return
  }

  const envFile = getArgValue(args, '--env-file') ?? DEFAULT_ENV_FILE
  const outputPath = getArgValue(args, '--output') ?? DEFAULT_OUTPUT
  const statusFilter = parseStatusFilter(getArgValue(args, '--status'))
  const customerId = getArgValue(args, '--customer-id')
  const concurrency = parsePositiveInteger(getArgValue(args, '--concurrency'), '--concurrency', DEFAULT_CONCURRENCY)
  const invoiceLimit = getArgValue(args, '--limit')
    ? parsePositiveInteger(getArgValue(args, '--limit'), '--limit', 0)
    : null

  if (customerId && !isActionableStripeCustomerId(customerId))
    throw new Error('--customer-id must be a real Stripe customer id')
  if (invoiceLimit && (statusFilter === 'never_paid' || statusFilter === 'all'))
    throw new Error('--limit cannot be used with --status=never_paid or --status=all because it would misclassify paid customers')

  const fileEnv = await loadEnv(envFile)
  const env = {
    ...fileEnv,
    ...runtimeEnv,
  }
  const nowMs = Date.now()

  const supabase = createSupabaseServiceClient(env)
  const stripe = createStripeClient(
    getRequiredEnv(env, 'STRIPE_SECRET_KEY'),
    env.STRIPE_API_BASE_URL?.trim(),
  )

  const orgCustomerIds = await fetchOrgCustomerIds(supabase, customerId)
  console.log(`Loaded ${orgCustomerIds.size} org Stripe customer ids`)
  console.log(`Env file: ${envFile}`)
  console.log(`Status filter: ${statusFilter}`)
  if (customerId)
    console.log(`Scoped to customer: ${customerId}`)

  const coverageByCustomerId = await collectPaidCoverageByCustomerId(stripe, {
    customerId,
    excludeCustomerIds: orgCustomerIds,
    invoiceLimit,
    nowMs,
  })
  const paidSummaries = buildPaidCustomerSummaries(coverageByCustomerId, { nowMs })
  const paidCustomerIds = new Set(paidSummaries.map(summary => summary.customerId))
  const summaries = filterPaidSummaries(paidSummaries, statusFilter)
  const profilesByCustomerId = await fetchCustomerProfiles(stripe, summaries, concurrency)

  if (statusFilter === 'never_paid' || statusFilter === 'all') {
    const customersWithoutOrg = await fetchStripeCustomersWithoutOrg(stripe, orgCustomerIds, customerId)
    const neverPaidSummaries = buildNeverPaidSummaries(customersWithoutOrg, paidCustomerIds)
    summaries.push(...neverPaidSummaries)

    for (const customer of customersWithoutOrg)
      profilesByCustomerId.set(customer.customerId, customer.profile)
  }

  const rows = buildExportRows(summaries, profilesByCustomerId)

  await writeCsv(outputPath, toCsv(rows))
  console.log(`Wrote ${rows.length} Stripe customers without org to ${outputPath}`)
}

if (import.meta.main)
  await main()
