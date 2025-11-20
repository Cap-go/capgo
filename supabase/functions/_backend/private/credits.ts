import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { StripeEnvironment } from '../utils/stripe.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { createOneTimeCheckout, getStripe, resolveStripeEnvironment } from '../utils/stripe.ts'
import { hasOrgRight, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

interface CreditStep {
  id: number
  step_min: number
  step_max: number
  price_per_unit: number
  type: string
  unit_factor: number
  org_id?: string | null
  created_at: string
  updated_at: string
}

interface CostCalculationRequest {
  mau: number
  bandwidth: number // in bytes
  storage: number // in bytes
}

interface TierUsage {
  tier_id: number
  step_min: number
  step_max: number
  unit_factor: number
  units_used: number // billing units (GB for bandwidth/storage, count for MAU)
  price_per_unit: number // Price per billing unit
  cost: number
}

interface MetricBreakdown {
  cost: number
  tiers: TierUsage[]
}

interface CostCalculationResponse {
  total_cost: number
  breakdown: {
    mau: MetricBreakdown
    bandwidth: MetricBreakdown
    storage: MetricBreakdown
  }
  usage: {
    mau: number
    bandwidth: number
    storage: number
  }
}

interface StartTopUpRequest {
  orgId: string
  quantity?: number
}

interface CompleteTopUpRequest {
  orgId: string
  sessionId: string
}

const DEFAULT_TOP_UP_QUANTITY = 100
const MAX_TOP_UP_QUANTITY = 100000
const CREDIT_TOP_UP_SLUG = 'credit_top_up'

type AppContext = Context<MiddlewareKeyVariables, any, any>

async function getCreditTopUpProductId(c: AppContext): Promise<{ productId: string, environment: StripeEnvironment }> {
  const environment = resolveStripeEnvironment(c)
  const { data, error } = await supabaseAdmin(c)
    .from('capgo_credit_products')
    .select('product_id')
    .eq('slug', CREDIT_TOP_UP_SLUG)
    .eq('environment', environment)
    .single()

  if (error || !data?.product_id) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'credit_top_up_product_missing',
      environment,
      error,
    })
    throw simpleError('credit_product_not_configured', 'Credit product is not configured for this environment')
  }

  return { productId: data.product_id, environment }
}

async function resolveOrgStripeContext(c: AppContext, orgId: string) {
  const rawAuthHeader = c.req.header('authorization')
    ?? c.req.header('Authorization')
    ?? c.get('authorization')
  const tokenMatch = rawAuthHeader?.match(/^\s*Bearer\s+(\S+)\s*$/i)
  const token = tokenMatch?.[1]

  if (!token)
    throw simpleError('not_authorized', 'Not authorized')

  const { data: auth, error } = await supabaseAdmin(c).auth.getUser(token)

  if (error || !auth?.user?.id)
    throw simpleError('not_authorized', 'Not authorized')

  const userId = auth.user.id

  if (!await hasOrgRight(c, orgId, userId, 'super_admin'))
    throw simpleError('not_authorized', 'Not authorized')

  const { data: org, error: orgError } = await supabaseAdmin(c)
    .from('orgs')
    .select('customer_id')
    .eq('id', orgId)
    .single()

  const customerId = org?.customer_id

  if (orgError || !customerId)
    throw simpleError('stripe_customer_missing', 'Organization does not have a Stripe customer')

  return { customerId, userId }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', async (c) => {
  try {
    const { data: credits } = await supabaseAdmin(c)
      .from('capgo_credits_steps')
      .select()
      .order('price_per_unit')
    return c.json(credits ?? [])
  }
  catch (e) {
    return simpleError('failed_to_fetch_pricing_data', 'Failed to fetch pricing data', {}, e)
  }
})

app.post('/', async (c) => {
  const body = await parseBody<CostCalculationRequest>(c)
  const { mau, bandwidth, storage } = body

  // Validate inputs
  if (mau === undefined || bandwidth === undefined || storage === undefined) {
    return simpleError('missing_required_fields', 'Missing required fields: mau, bandwidth, storage')
  }

  // Get pricing steps from database
  const { data: credits, error } = await supabaseAdmin(c)
    .from('capgo_credits_steps')
    .select()
    .order('type, step_min')

  if (error || !credits) {
    return simpleError('failed_to_fetch_pricing_data', 'Failed to fetch pricing data')
  }

  // Type assertion for credits
  const typedCredits = credits as CreditStep[]

  // Calculate cost for each metric type with tier breakdown
  const calculateMetricCost = (value: number, type: string): MetricBreakdown => {
    if (value <= 0)
      return { cost: 0, tiers: [] }

    const applicableSteps = typedCredits.filter(credit => credit.type === type)
    const tiersUsed: TierUsage[] = []
    let remainingValue = value
    let totalCost = 0

    for (const step of applicableSteps) {
      const stepMin = step.step_min
      const stepMax = step.step_max
      const unitFactor = step.unit_factor || 1

      if (remainingValue > 0 && value >= stepMin) {
        const tierUsageBytes = Math.min(remainingValue, stepMax - stepMin)

        // Convert using unit_factor and round up for pricing
        const tierUsage = Math.ceil(tierUsageBytes / unitFactor)
        const tierCost = tierUsage * step.price_per_unit

        tiersUsed.push({
          tier_id: step.id,
          step_min: stepMin,
          step_max: stepMax,
          unit_factor: step.unit_factor || 1,
          units_used: tierUsage,
          price_per_unit: step.price_per_unit,
          cost: tierCost,
        })

        totalCost += tierCost
        remainingValue -= tierUsageBytes

        if (remainingValue <= 0)
          break
      }
    }

    // If there's still remaining value, use the highest tier
    if (remainingValue > 0) {
      const highestStep = applicableSteps[applicableSteps.length - 1]
      if (highestStep) {
        const unitFactor = highestStep.unit_factor || 1

        // Convert using unit_factor and round up
        const tierUsage = Math.ceil(remainingValue / unitFactor)
        const tierCost = tierUsage * highestStep.price_per_unit

        const stepMin = highestStep.step_min

        tiersUsed.push({
          tier_id: highestStep.id,
          step_min: stepMin,
          step_max: highestStep.step_max,
          unit_factor: highestStep.unit_factor || 1,
          units_used: tierUsage,
          price_per_unit: highestStep.price_per_unit,
          cost: tierCost,
        })

        totalCost += tierCost
      }
    }

    return { cost: totalCost, tiers: tiersUsed }
  }

  // Calculate costs
  const mauResult = calculateMetricCost(mau, 'mau')
  const bandwidthResult = calculateMetricCost(bandwidth, 'bandwidth')
  const storageResult = calculateMetricCost(storage, 'storage')

  const totalCost = mauResult.cost + bandwidthResult.cost + storageResult.cost

  const response: CostCalculationResponse = {
    total_cost: totalCost,
    breakdown: {
      mau: mauResult,
      bandwidth: bandwidthResult,
      storage: storageResult,
    },
    usage: {
      mau,
      bandwidth,
      storage,
    },
  }

  return c.json(response)
})

app.post('/start-top-up', middlewareAuth, async (c) => {
  const body = await parseBody<StartTopUpRequest>(c)
  const parsedQuantity = Number.isFinite(body.quantity) ? Math.floor(body.quantity!) : undefined
  const quantity = parsedQuantity
    ? Math.min(Math.max(parsedQuantity, 1), MAX_TOP_UP_QUANTITY)
    : DEFAULT_TOP_UP_QUANTITY
  if (!body.orgId)
    throw simpleError('missing_org_id', 'Organization id is required')

  const { customerId, userId } = await resolveOrgStripeContext(c, body.orgId)

  const baseUrl = getEnv(c, 'WEBAPP_URL')
  const successUrl = `${baseUrl}/settings/organization/credits?creditCheckout=success&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${baseUrl}/settings/organization/credits?creditCheckout=cancelled`

  const { productId, environment } = await getCreditTopUpProductId(c)

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Starting credit top-up checkout',
    orgId: body.orgId,
    quantity,
    productId,
    environment,
    userId,
  })

  const checkout = await createOneTimeCheckout(
    c,
    customerId,
    productId,
    quantity,
    successUrl,
    cancelUrl,
    body.orgId,
  )

  return c.json({ url: checkout.url })
})

app.post('/complete-top-up', middlewareAuth, async (c) => {
  const body = await parseBody<CompleteTopUpRequest>(c)
  if (!body.orgId || !body.sessionId)
    throw simpleError('missing_parameters', 'orgId and sessionId are required')

  const { customerId } = await resolveOrgStripeContext(c, body.orgId)

  const stripe = getStripe(c)
  const session = await stripe.checkout.sessions.retrieve(body.sessionId)

  if (!session || session.customer !== customerId)
    throw simpleError('invalid_session_customer', 'Checkout session does not belong to this organization')

  if (session.mode !== 'payment')
    throw simpleError('invalid_session_mode', 'Checkout session is not a payment session')

  if (session.payment_status !== 'paid' || session.status !== 'complete')
    throw simpleError('session_not_paid', 'Checkout session is not paid')

  const { productId, environment } = await getCreditTopUpProductId(c)
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null

  const lineItems = await stripe.checkout.sessions.listLineItems(body.sessionId, {
    expand: ['data.price.product'],
    limit: 100,
  })

  let creditQuantity = 0
  const itemsSummary = lineItems.data.map((item) => {
    const priceProduct = typeof item.price?.product === 'string'
      ? item.price?.product
      : (item.price?.product as { id?: string } | null)?.id ?? null
    if (priceProduct === productId)
      creditQuantity += item.quantity ?? 0

    return {
      id: item.id,
      quantity: item.quantity,
      priceId: item.price?.id ?? null,
      productId: priceProduct,
    }
  })

  if (creditQuantity <= 0)
    throw simpleError('credit_product_not_found', 'Checkout session does not include the credit product')

  const sourceMatchFilters = [`source_ref->>sessionId.eq.${body.sessionId}`]
  if (paymentIntentId)
    sourceMatchFilters.push(`source_ref->>paymentIntentId.eq.${paymentIntentId}`)

  const { data: existingTx, error: existingTxError } = await supabaseAdmin(c)
    .from('usage_credit_transactions')
    .select('id, grant_id, balance_after')
    .eq('org_id', body.orgId)
    .eq('transaction_type', 'purchase')
    .or(sourceMatchFilters.join(','))
    .limit(1)

  if (existingTxError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'credit_top_up_idempotency_check_failed',
      error: existingTxError,
      orgId: body.orgId,
      sessionId: body.sessionId,
    })
  }

  const matchedTx = existingTx?.[0]

  if (matchedTx) {
    const { data: balance } = await supabaseAdmin(c)
      .from('usage_credit_balances')
      .select('total_credits, available_credits, next_expiration')
      .eq('org_id', body.orgId)
      .single()

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Skipping credit top-up RPC due to existing transaction',
      orgId: body.orgId,
      sessionId: body.sessionId,
      transactionId: matchedTx.id,
    })

    return c.json({
      grant: {
        grant_id: matchedTx.grant_id,
        transaction_id: matchedTx.id,
        available_credits: balance?.available_credits ?? matchedTx.balance_after ?? 0,
        total_credits: balance?.total_credits ?? matchedTx.balance_after ?? 0,
        next_expiration: balance?.next_expiration ?? null,
      },
    })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Completing credit top-up',
    orgId: body.orgId,
    sessionId: body.sessionId,
    creditQuantity,
    environment,
    itemsSummary,
  })

  const sourceRef = {
    sessionId: body.sessionId,
    paymentIntentId,
    itemsSummary,
  }

  const { data: grant, error: rpcError } = await supabaseAdmin(c)
    .rpc('top_up_usage_credits', {
      p_org_id: body.orgId,
      p_amount: creditQuantity,
      p_source: 'stripe_top_up',
      p_notes: 'Stripe Checkout credit top-up',
      p_source_ref: sourceRef,
    })
    .single()

  if (rpcError)
    throw simpleError('top_up_failed', 'Failed to top up credits', {}, rpcError)

  return c.json({ grant })
})
