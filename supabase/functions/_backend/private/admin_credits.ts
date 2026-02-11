import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { z } from 'zod/mini'
import { BRES, createHono, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { version } from '../utils/version.ts'

type AppContext = Context<MiddlewareKeyVariables, any, any>

const grantSchema = z.object({
  org_id: z.string().check(z.minLength(1)),
  amount: z.number().check(z.minimum(1)),
  notes: z.optional(z.string().check(z.minLength(1))),
  expires_at: z.optional(z.string()),
})

interface GrantRequest {
  org_id: string
  amount: number
  notes?: string
  expires_at?: string
}

interface SearchOrgsQuery {
  q?: string
}

async function verifyAdmin(c: AppContext): Promise<{ isAdmin: boolean, userId: string | null }> {
  const auth = c.get('auth')
  if (!auth || !auth.userId) {
    cloudlog({ requestId: c.get('requestId'), message: 'admin_verify_no_auth' })
    return { isAdmin: false, userId: null }
  }

  const userId = auth.userId
  const adminSupabase = supabaseAdmin(c)

  // Use admin client to check if user is admin (using the is_admin(userid) variant)
  const { data: isAdmin, error: adminError } = await adminSupabase.rpc('is_admin', { userid: userId })

  if (adminError) {
    cloudlog({ requestId: c.get('requestId'), message: 'is_admin_error', error: adminError })
    return { isAdmin: false, userId }
  }

  return { isAdmin: !!isAdmin, userId }
}

export const app = createHono('', version)

app.use('*', useCors)
app.options('*', c => c.json(BRES))

// Grant credits to an organization (admin only)
app.post('/grant', middlewareV2(['all']), async (c) => {
  const { isAdmin, userId } = await verifyAdmin(c)

  if (!isAdmin) {
    cloudlog({ requestId: c.get('requestId'), message: 'not_admin_grant_attempt', userId })
    throw simpleError('not_admin', 'Only admin users can grant credits')
  }

  const body = await parseBody<GrantRequest>(c)
  const parsedBodyResult = grantSchema.safeParse(body)

  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid request body', { body, parsedBodyResult })
  }

  const { org_id, amount, notes, expires_at } = parsedBodyResult.data

  cloudlog({
    requestId: c.get('requestId'),
    message: 'admin_credit_grant_request',
    adminUserId: userId,
    org_id,
    amount,
    notes,
    expires_at,
  })

  // Verify org exists using admin client
  const adminSupabase = supabaseAdmin(c)
  const { data: org, error: orgError } = await adminSupabase
    .from('orgs')
    .select('id, name, management_email')
    .eq('id', org_id)
    .single()

  if (orgError || !org) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'admin_grant_org_not_found',
      org_id,
      error: orgError,
    })
    throw simpleError('org_not_found', 'Organization not found')
  }

  const sourceRef = {
    admin_user_id: userId,
    granted_via: 'admin_ui',
    org_name: org.name,
  }

  const { data: grant, error: rpcError } = await adminSupabase
    .rpc('top_up_usage_credits', {
      p_org_id: org_id,
      p_amount: amount,
      p_expires_at: expires_at || undefined,
      p_source: 'manual',
      p_notes: notes || `Admin grant by ${userId}`,
      p_source_ref: sourceRef,
    })

  if (rpcError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'admin_credit_grant_failed',
      org_id,
      amount,
      adminUserId: userId,
      error: rpcError,
    })
    throw simpleError('grant_failed', 'Failed to grant credits', { error: rpcError })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'admin_credit_grant_success',
    adminUserId: userId,
    org_id,
    org_name: org.name,
    amount,
    grant,
  })

  return c.json({
    success: true,
    grant,
    org: {
      id: org.id,
      name: org.name,
    },
  })
})

// Search organizations (admin only)
app.get('/search-orgs', middlewareV2(['all']), async (c) => {
  const { isAdmin } = await verifyAdmin(c)

  if (!isAdmin) {
    throw simpleError('not_admin', 'Only admin users can search organizations')
  }

  const query = c.req.query() as SearchOrgsQuery
  const searchTerm = query.q?.trim() || ''

  if (searchTerm.length < 2) {
    return c.json({ orgs: [] })
  }

  const adminSupabase = supabaseAdmin(c)

  // Escape special characters to avoid breaking the PostgREST filter grammar
  const sanitizedSearchTerm = searchTerm.replace(/[%_,()]/g, c => `\\${c}`)
  const ilikePattern = `%${sanitizedSearchTerm}%`

  // Check if searchTerm is a valid UUID for id.eq filter
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isValidUuid = uuidRegex.test(searchTerm)

  // Build filter: always search by name and email, only add id.eq if it's a valid UUID
  const filterParts = [
    `name.ilike.${ilikePattern}`,
    `management_email.ilike.${ilikePattern}`,
  ]
  if (isValidUuid) {
    filterParts.push(`id.eq.${searchTerm}`)
  }

  // Search by name, email, or exact ID match (only if valid UUID)
  const { data: orgs, error } = await adminSupabase
    .from('orgs')
    .select('id, name, management_email, created_at')
    .or(filterParts.join(','))
    .order('name')
    .limit(20)

  if (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'admin_search_orgs_failed',
      searchTerm,
      error,
    })
    throw simpleError('search_failed', 'Failed to search organizations')
  }

  return c.json({ orgs: orgs || [] })
})

// Get org credit balance (admin only)
app.get('/org-balance/:orgId', middlewareV2(['all']), async (c) => {
  const { isAdmin } = await verifyAdmin(c)

  if (!isAdmin) {
    throw simpleError('not_admin', 'Only admin users can view organization balances')
  }

  const orgId = c.req.param('orgId')

  if (!orgId) {
    throw simpleError('missing_org_id', 'Organization ID is required')
  }

  const adminSupabase = supabaseAdmin(c)

  const { data: balance, error } = await adminSupabase
    .from('usage_credit_balances')
    .select('total_credits, available_credits, next_expiration')
    .eq('org_id', orgId)
    .single()

  if (error && error.code !== 'PGRST116') {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'admin_get_balance_failed',
      orgId,
      error,
    })
    throw simpleError('balance_fetch_failed', 'Failed to fetch balance')
  }

  return c.json({
    balance: balance || { total_credits: 0, available_credits: 0, next_expiration: null },
  })
})

interface OrgCreditTransaction {
  transaction_type: 'grant' | 'purchase' | 'manual_grant' | 'deduction' | 'expiry' | 'refund'
  amount: number
  occurred_at: string
}

interface OrgCreditConsumption {
  credits_used: number
  metric: 'mau' | 'bandwidth' | 'storage' | 'build_time'
  applied_at: string
}

interface CreditStatsAggregate {
  purchased: number
  granted: number
  used: number
  expired: number
  deducted: number
  refunded: number
  net: number
}

interface UsageMetricStats {
  used_total: number
  last_30_days: number
  events: number
}

function roundCredits(value: number): number {
  return Math.round(value * 100) / 100
}

function isWithinWindow(dateInput: string | null | undefined, sinceMs: number): boolean {
  if (!dateInput)
    return false
  const parsed = Date.parse(dateInput)
  if (Number.isNaN(parsed))
    return false
  return parsed >= sinceMs
}

function createEmptyAggregate(): CreditStatsAggregate {
  return {
    purchased: 0,
    granted: 0,
    used: 0,
    expired: 0,
    deducted: 0,
    refunded: 0,
    net: 0,
  }
}

function createBaseMetricStats(): Record<string, UsageMetricStats> {
  return {
    mau: { used_total: 0, last_30_days: 0, events: 0 },
    bandwidth: { used_total: 0, last_30_days: 0, events: 0 },
    storage: { used_total: 0, last_30_days: 0, events: 0 },
    build_time: { used_total: 0, last_30_days: 0, events: 0 },
  }
}

function roundAggregate(aggregate: CreditStatsAggregate): CreditStatsAggregate {
  return {
    purchased: roundCredits(aggregate.purchased),
    granted: roundCredits(aggregate.granted),
    used: roundCredits(aggregate.used),
    expired: roundCredits(aggregate.expired),
    deducted: roundCredits(aggregate.deducted),
    refunded: roundCredits(aggregate.refunded),
    net: roundCredits(aggregate.net),
  }
}

function roundMetrics(metrics: Record<string, UsageMetricStats>): Record<string, UsageMetricStats> {
  const result: Record<string, UsageMetricStats> = {}
  for (const [metric, values] of Object.entries(metrics)) {
    result[metric] = {
      used_total: roundCredits(values.used_total),
      last_30_days: roundCredits(values.last_30_days),
      events: values.events,
    }
  }
  return result
}

// Get org credit statistics (admin only)
app.get('/org-stats/:orgId', middlewareV2(['all']), async (c) => {
  const { isAdmin } = await verifyAdmin(c)

  if (!isAdmin) {
    throw simpleError('not_admin', 'Only admin users can view organization credit stats')
  }

  const orgId = c.req.param('orgId')

  if (!orgId) {
    throw simpleError('missing_org_id', 'Organization ID is required')
  }

  const adminSupabase = supabaseAdmin(c)
  const sinceMs = Date.now() - (30 * 24 * 60 * 60 * 1000)

  const [transactionsResult, consumptionsResult] = await Promise.all([
    adminSupabase
      .from('usage_credit_transactions')
      .select('transaction_type, amount, occurred_at')
      .eq('org_id', orgId),
    adminSupabase
      .from('usage_credit_consumptions')
      .select('credits_used, metric, applied_at')
      .eq('org_id', orgId),
  ])

  if (transactionsResult.error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'admin_get_org_credit_stats_transactions_failed',
      orgId,
      error: transactionsResult.error,
    })
    throw simpleError('org_stats_fetch_failed', 'Failed to fetch organization credit stats')
  }

  if (consumptionsResult.error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'admin_get_org_credit_stats_consumptions_failed',
      orgId,
      error: consumptionsResult.error,
    })
    throw simpleError('org_stats_fetch_failed', 'Failed to fetch organization credit stats')
  }

  const transactions = (transactionsResult.data || []) as OrgCreditTransaction[]
  const consumptions = (consumptionsResult.data || []) as OrgCreditConsumption[]

  const totals = createEmptyAggregate()
  const last30Days = createEmptyAggregate()
  const usageByMetric = createBaseMetricStats()

  for (const transaction of transactions) {
    const amount = Number(transaction.amount || 0)
    const isRecent = isWithinWindow(transaction.occurred_at, sinceMs)

    totals.net += amount
    if (isRecent)
      last30Days.net += amount

    if (transaction.transaction_type === 'purchase') {
      const value = Math.max(amount, 0)
      totals.purchased += value
      if (isRecent)
        last30Days.purchased += value
      continue
    }

    if (transaction.transaction_type === 'grant' || transaction.transaction_type === 'manual_grant') {
      const value = Math.max(amount, 0)
      totals.granted += value
      if (isRecent)
        last30Days.granted += value
      continue
    }

    if (transaction.transaction_type === 'refund') {
      const value = Math.max(amount, 0)
      totals.refunded += value
      if (isRecent)
        last30Days.refunded += value
      continue
    }

    if (transaction.transaction_type === 'expiry') {
      const value = Math.abs(Math.min(amount, 0))
      totals.expired += value
      if (isRecent)
        last30Days.expired += value
      continue
    }

    if (transaction.transaction_type === 'deduction') {
      const value = Math.abs(Math.min(amount, 0))
      totals.deducted += value
      if (isRecent)
        last30Days.deducted += value
    }
  }

  for (const consumption of consumptions) {
    const used = Number(consumption.credits_used || 0)
    const isRecent = isWithinWindow(consumption.applied_at, sinceMs)
    const metric = consumption.metric || 'unknown'

    totals.used += used
    if (isRecent)
      last30Days.used += used

    if (!usageByMetric[metric]) {
      usageByMetric[metric] = {
        used_total: 0,
        last_30_days: 0,
        events: 0,
      }
    }

    usageByMetric[metric].used_total += used
    usageByMetric[metric].events += 1
    if (isRecent)
      usageByMetric[metric].last_30_days += used
  }

  return c.json({
    stats: {
      totals: roundAggregate(totals),
      last_30_days: roundAggregate(last30Days),
      usage_by_metric: roundMetrics(usageByMetric),
    },
  })
})

// Get recent admin grants (admin only)
app.get('/grants-history', middlewareV2(['all']), async (c) => {
  const { isAdmin } = await verifyAdmin(c)

  if (!isAdmin) {
    throw simpleError('not_admin', 'Only admin users can view grant history')
  }

  const adminSupabase = supabaseAdmin(c)

  // Query grants with source='manual' and admin_user_id in source_ref (admin UI grants)
  const { data: grants, error } = await adminSupabase
    .from('usage_credit_grants')
    .select(`
      id,
      org_id,
      credits_total,
      notes,
      source_ref,
      granted_at,
      expires_at,
      orgs!inner (
        name,
        management_email
      )
    `)
    .eq('source', 'manual')
    .not('source_ref->admin_user_id', 'is', null)
    .order('granted_at', { ascending: false })
    .limit(50)

  if (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'admin_grants_history_failed',
      error,
    })
    throw simpleError('history_fetch_failed', 'Failed to fetch grant history')
  }

  return c.json({ grants: grants || [] })
})
