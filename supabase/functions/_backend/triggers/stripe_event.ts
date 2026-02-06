import type { Context } from 'hono'
import type Stripe from 'stripe'
import type { MiddlewareKeyVariablesStripe } from '../utils/hono_middleware_stripe.ts'
import type { StripeData } from '../utils/stripe.ts'
import type { Database } from '../utils/supabase.types.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { addTagBento, trackBentoEvent } from '../utils/bento.ts'
import { getFallbackCreditProductId } from '../utils/credits.ts'
import { BRES, quickError, simpleError } from '../utils/hono.ts'
import { middlewareStripeWebhook } from '../utils/hono_middleware_stripe.ts'
import { cloudlog } from '../utils/logging.ts'
import { logsnag } from '../utils/logsnag.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import * as schema from '../utils/postgres_schema.ts'
import { ensureCustomerMetadata, getStripe } from '../utils/stripe.ts'
import { customerToSegmentOrg, supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariablesStripe>()

interface Org {
  id: string
  management_email: string
  created_by: string
  customer_id?: string | null
}

const checkoutSessionEventTypes = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
])

function isCheckoutSessionEvent(event: Stripe.Event) {
  return checkoutSessionEventTypes.has(event.type)
}

async function getCreditTopUpProductIdFromCustomer(c: Context, customerId: string): Promise<string> {
  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    let stripeInfoError: unknown | null = null
    let stripeInfo: { product_id: string | null } | undefined
    try {
      [stripeInfo] = await drizzleClient
        .select({ product_id: schema.stripe_info.product_id })
        .from(schema.stripe_info)
        .where(eq(schema.stripe_info.customer_id, customerId))
        .limit(1)
    }
    catch (error) {
      stripeInfoError = error
    }

    if (stripeInfoError || !stripeInfo?.product_id) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'credit_plan_missing',
        customerId,
        error: stripeInfoError,
      })
      return await getFallbackCreditProductId(c, customerId, async () => {
        const [fallbackPlan] = await drizzleClient
          .select({ credit_id: schema.plans.credit_id })
          .from(schema.plans)
          .where(eq(schema.plans.name, 'Solo'))
          .limit(1)
        return fallbackPlan ?? null
      })
    }

    let planError: unknown | null = null
    let plan: { credit_id: string | null } | undefined
    try {
      [plan] = await drizzleClient
        .select({ credit_id: schema.plans.credit_id })
        .from(schema.plans)
        .where(eq(schema.plans.stripe_id, stripeInfo.product_id))
        .limit(1)
    }
    catch (error) {
      planError = error
    }

    if (planError || !plan?.credit_id) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'credit_top_up_product_missing',
        customerId,
        planStripeId: stripeInfo.product_id,
        error: planError,
      })
      return await getFallbackCreditProductId(c, customerId, async () => {
        const [fallbackPlan] = await drizzleClient
          .select({ credit_id: schema.plans.credit_id })
          .from(schema.plans)
          .where(eq(schema.plans.name, 'Solo'))
          .limit(1)
        return fallbackPlan ?? null
      })
    }

    return plan.credit_id
  }
  finally {
    closeClient(c, pgClient)
  }
}

async function handleCheckoutSessionCompleted(
  c: Context,
  stripeEvent: Stripe.Event,
  org: Org,
  customerId: string,
) {
  const session = stripeEvent.data.object as Stripe.Checkout.Session
  const sessionId = session.id

  if (session.mode !== 'payment') {
    cloudlog({ requestId: c.get('requestId'), message: 'Skipping non-payment checkout session', sessionId, mode: session.mode })
    return c.json(BRES)
  }

  if (session.payment_status !== 'paid') {
    cloudlog({ requestId: c.get('requestId'), message: 'Skipping unpaid checkout session', sessionId, paymentStatus: session.payment_status })
    return c.json(BRES)
  }

  if (session.status && session.status !== 'complete') {
    cloudlog({ requestId: c.get('requestId'), message: 'Skipping incomplete checkout session', sessionId, status: session.status })
    return c.json(BRES)
  }

  const clientReferenceId = typeof session.client_reference_id === 'string' ? session.client_reference_id : null
  if (clientReferenceId && clientReferenceId !== org.id) {
    throw simpleError('checkout_org_mismatch', 'Checkout session org does not match', {
      orgId: org.id,
      clientReferenceId,
      sessionId,
    })
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null

  const metadataProductId = typeof session.metadata?.productId === 'string'
    ? session.metadata?.productId
    : null

  const creditProductId = metadataProductId ?? await getCreditTopUpProductIdFromCustomer(c, customerId)

  const lineItems = await getStripe(c).checkout.sessions.listLineItems(sessionId, {
    expand: ['data.price.product'],
    limit: 100,
  })

  let creditQuantity = 0
  const itemsSummary = lineItems.data.map((item) => {
    const priceProduct = typeof item.price?.product === 'string'
      ? item.price?.product
      : (item.price?.product as { id?: string } | null)?.id ?? null
    if (priceProduct === creditProductId)
      creditQuantity += item.quantity ?? 0

    return {
      id: item.id,
      quantity: item.quantity,
      priceId: item.price?.id ?? null,
      productId: priceProduct,
    }
  })

  if (creditQuantity <= 0) {
    throw simpleError('credit_product_not_found', 'Checkout session does not include the credit product', {
      sessionId,
      creditProductId,
      itemsSummary,
    })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Completing credit top-up from webhook',
    orgId: org.id,
    sessionId,
    creditQuantity,
    itemsSummary,
  })

  const sourceRef = {
    sessionId,
    paymentIntentId,
    itemsSummary,
  }

  const { data: grant, error: rpcError } = await supabaseAdmin(c)
    .rpc('top_up_usage_credits', {
      p_org_id: org.id,
      p_amount: creditQuantity,
      p_source: 'stripe_top_up',
      p_notes: 'Stripe Checkout credit top-up',
      p_source_ref: sourceRef,
    })
    .single()

  if (rpcError) {
    const rpcErrorInfo = {
      code: rpcError.code ?? null,
      message: rpcError.message ?? null,
      details: (rpcError as any)?.details ?? null,
      hint: (rpcError as any)?.hint ?? null,
    }
    throw simpleError('top_up_failed', 'Failed to top up credits', { rpcError: rpcErrorInfo })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'credit_top_up_webhook_completed',
    orgId: org.id,
    sessionId,
    grantId: grant?.grant_id ?? null,
  })

  return c.json(BRES)
}

async function customerSourceCreated(c: Context, LogSnag: ReturnType<typeof logsnag>, org: Org, stripeEvent: Stripe.CustomerSourceCreatedEvent) {
  const card = stripeEvent.data.object as any
  const expirationDate = card.exp_month && card.exp_year ? `${card.exp_month}/${card.exp_year}` : 'unknown'
  await trackBentoEvent(c, org.management_email, { expiration_date: expirationDate }, 'org:card_added')
  await LogSnag.track({
    channel: 'usage',
    event: 'Credit Card Added',
    icon: '💳',
    user_id: org.id,
    notify: false,
  }).catch()
  return c.json(BRES)
}

async function customerSourceExpiring(c: Context, LogSnag: ReturnType<typeof logsnag>, org: Org) {
  await trackBentoEvent(c, org.management_email, {}, 'org:card_expiring')
  await LogSnag.track({
    channel: 'usage',
    event: 'Credit Card Expiring',
    icon: '⚠️',
    user_id: org.id,
    notify: false,
  }).catch()
  return c.json(BRES)
}

async function invoiceUpcoming(c: Context, LogSnag: ReturnType<typeof logsnag>, org: Org, stripeEvent: Stripe.InvoiceUpcomingEvent, stripeData: StripeData) {
  const invoice = stripeEvent.data.object as any
  let planName = null
  let planType = 'monthly'
  if (stripeData.data.product_id) {
    const { data: plan } = await supabaseAdmin(c)
      .from('plans')
      .select('name, price_y_id')
      .eq('stripe_id', stripeData.data.product_id)
      .single()
    if (!plan) {
      throw simpleError('failed_to_get_plan', 'failed to get plan', { stripeData })
    }
    planName = plan.name
    if (plan.price_y_id === stripeData.data.price_id) {
      planType = 'yearly'
    }
  }
  const price = invoice.total ? invoice.total / 100 : 0
  await trackBentoEvent(c, org.management_email, { plan_name: planName, price, plan_type: planType }, 'org:invoice_upcoming')
  await LogSnag.track({
    channel: 'usage',
    event: 'Invoice Upcoming',
    icon: '📄',
    user_id: org.id,
    notify: false,
  }).catch()
  return c.json(BRES)
}

async function createdOrUpdated(c: Context, stripeData: StripeData, org: Org, LogSnag: ReturnType<typeof logsnag>, originalStatus?: string) {
  const status = originalStatus ?? stripeData.data.status
  let statusName: string = status ?? ''
  const { data: plan } = await supabaseAdmin(c)
    .from('plans')
    .select()
    .eq('stripe_id', stripeData.data.product_id)
    .single()
  if (plan) {
    // Filter out undefined values to avoid FK constraint violations
    const updateData = Object.fromEntries(
      Object.entries(stripeData.data).filter(([_, v]) => v !== undefined),
    )
    const { error: dbError2 } = await supabaseAdmin(c)
      .from('stripe_info')
      .update(updateData)
      .eq('customer_id', stripeData.data.customer_id)
    if (stripeData.isUpgrade && stripeData.previousProductId) {
      statusName = 'upgraded'
      const previousProduct = await supabaseAdmin(c)
        .from('plans')
        .select()
        .eq('stripe_id', stripeData.previousProductId)
        .single()
      await trackBentoEvent(c, org.management_email, {
        plan_name: plan.name,
        previous_plan_name: previousProduct.data?.name ?? '',
      }, 'user:plan_change')
      await LogSnag.track({
        channel: 'usage',
        event: 'User Upgraded',
        icon: '💰',
        user_id: org.id,
        notify: true,
        tags: {
          plan_name: plan.name,
          previous_plan_name: previousProduct.data?.name ?? '',
        },
      }).catch()
    }

    if (dbError2) {
      return quickError(404, 'succeeded_customer_id_not_found', `succeeded: customer_id not found`, { dbError2, stripeData })
    }

    const segment = await customerToSegmentOrg(c, org.id, stripeData.data.price_id, plan)
    const isMonthly = plan.price_m_id === stripeData.data.price_id
    const eventName = `user:subscribe_${statusName}:${isMonthly ? 'monthly' : 'yearly'}`
    await trackBentoEvent(c, org.management_email, { plan_name: plan.name }, eventName)
    await addTagBento(c, org.management_email, segment)
    const isNewSubscription = status === 'created'
    await LogSnag.track({
      channel: 'usage',
      event: isNewSubscription ? 'User subscribe' : 'User update subscribe',
      icon: '💰',
      user_id: org.id,
      notify: isNewSubscription,
      tags: {
        plan_name: plan.name,
      },
    }).catch()
  }
  else {
    const segment = await customerToSegmentOrg(c, org.id, stripeData.data.price_id)
    await addTagBento(c, org.management_email, segment)
  }
}

async function updateStripeInfo(c: Context, stripeData: StripeData) {
  // Filter out undefined values to avoid FK constraint violations
  const updateData = Object.fromEntries(
    Object.entries(stripeData.data).filter(([_, v]) => v !== undefined),
  )
  const { error: dbError2 } = await supabaseAdmin(c)
    .from('stripe_info')
    .update(updateData)
    .eq('customer_id', stripeData.data.customer_id)
  if (dbError2) {
    return quickError(404, 'canceled_customer_id_not_found', `canceled:  customer_id not found`, { dbError2, stripeData })
  }
  return false
}

async function didCancel(c: Context, org: Org, LogSnag: ReturnType<typeof logsnag>) {
  const segment = await customerToSegmentOrg(c, org.id, 'canceled')
  await addTagBento(c, org.management_email, segment)
  await trackBentoEvent(c, org.management_email, {}, 'user:cancel')
  await LogSnag.track({
    channel: 'usage',
    event: 'User cancel',
    icon: '⚠️',
    user_id: org.id,
    notify: true,
  }).catch()
}

async function getOrg(c: Context, stripeData: StripeData) {
  const { error: dbError, data: org } = await supabaseAdmin(c)
    .from('orgs')
    .select('id, management_email, created_by')
    .eq('customer_id', stripeData.data.customer_id)
    .single()
  if (dbError) {
    throw simpleError('webhook_error_no_org_found', 'Webhook Error: no org found')
  }
  if (!org) {
    throw simpleError('webhook_error_no_org_found', 'Webhook Error: no org found')
  }
  return org
}

async function cancelingOrFinished(c: Context, stripeEvent: Stripe.Event, stripeData: Database['public']['Tables']['stripe_info']['Insert']) {
  const previousAttributes = stripeEvent.data.previous_attributes ?? {} as any
  if (stripeEvent.data.object.object === 'subscription' && stripeEvent.data.object.cancel_at_period_end === true && typeof previousAttributes.cancel_at_period_end === 'boolean' && previousAttributes.cancel_at_period_end === false) {
    // cloudlog('USER CANCELLED!!!!!!!!!!!!!!!')
    const { error: dbError2 } = await supabaseAdmin(c)
      .from('stripe_info')
      .update({ canceled_at: new Date().toISOString() })
      .eq('customer_id', stripeData.customer_id)
    if (dbError2) {
      return quickError(404, 'user_cancelled_customer_id_not_found', `USER CANCELLED, customer_id not found`, { dbError2, stripeData })
    }
  }
  else if (stripeEvent.data.object.object === 'subscription' && stripeEvent.data.object.cancel_at_period_end === false && typeof previousAttributes.cancel_at_period_end === 'boolean' && previousAttributes.cancel_at_period_end === true) {
    // cloudlog('USER UNCANCELED')
    const { error: dbError2 } = await supabaseAdmin(c)
      .from('stripe_info')
      .update({ canceled_at: null })
      .eq('customer_id', stripeData.customer_id)
    if (dbError2) {
      return quickError(404, 'user_uncancelled_customer_id_not_found', `USER UNCANCELED, customer_id not found`, { dbError2, stripeData })
    }
  }
  return c.json(BRES)
}

app.post('/', middlewareStripeWebhook(), async (c) => {
  const LogSnag = logsnag(c)
  const stripeData = c.get('stripeData')!
  const stripeEvent = c.get('stripeEvent')!
  const isCheckoutSession = isCheckoutSessionEvent(stripeEvent)

  // find email from user with customer_id
  const org = await getOrg(c, stripeData)

  await ensureCustomerMetadata(c, stripeData.data.customer_id, org.id, org.created_by)

  if (isCheckoutSession) {
    return handleCheckoutSessionCompleted(c, stripeEvent, org, stripeData.data.customer_id)
  }

  const { data: customer } = await supabaseAdmin(c)
    .from('stripe_info')
    .select()
    .eq('customer_id', stripeData.data.customer_id)
    .single()

  if (!customer) {
    throw simpleError('no_customer_found', 'no customer found', { stripeData })
  }

  if (stripeEvent.type === 'customer.source.expiring') {
    return customerSourceExpiring(c, LogSnag, org)
  }
  else if (stripeEvent.type === 'customer.source.created') {
    return customerSourceCreated(c, LogSnag, org, stripeEvent)
  }
  else if (stripeEvent.type === 'invoice.upcoming') {
    return invoiceUpcoming(c, LogSnag, org, stripeEvent, stripeData)
  }

  if (['created', 'succeeded', 'updated'].includes(stripeData.data.status ?? '') && stripeData.data.price_id && stripeData.data.product_id) {
    const originalStatus = stripeData.data.status
    stripeData.data.status = 'succeeded'
    await createdOrUpdated(c, stripeData, org, LogSnag, originalStatus!)
  }
  else if (stripeData.data.status === 'failed') {
    await trackBentoEvent(c, org.management_email, {}, 'org:failed_payment')
    // Update the database with failed status
    await updateStripeInfo(c, stripeData)
  }
  else if (['created', 'succeeded', 'updated'].includes(stripeData.data.status ?? '') && (!stripeData.data.price_id || !stripeData.data.product_id)) {
    // Subscription event without price/product data - log warning but don't process
    cloudlog({ requestId: c.get('requestId'), message: 'Subscription webhook missing price_id or product_id', stripeData, subscriptionId: stripeData.data.subscription_id })
  }
  else if (['canceled', 'deleted'].includes(stripeData.data.status ?? '')) {
    // Check if this is the subscription currently in the database
    if (customer && customer.subscription_id === stripeData.data.subscription_id) {
      // This is the known subscription being cancelled
      await didCancel(c, org, LogSnag)
      // Only mark as 'succeeded' if subscription is still active until period end
      // Check if subscription_anchor_end is in the future
      if (stripeData.data.subscription_anchor_end && new Date(stripeData.data.subscription_anchor_end) > new Date()) {
        stripeData.data.status = 'succeeded'
      }
      // Otherwise keep it as 'canceled' since the period has ended
      await updateStripeInfo(c, stripeData)
    }
    // If it's a different subscription (not the one in DB), ignore it
    // This prevents old subscription webhooks from overwriting newer active subscriptions
    else {
      cloudlog({ requestId: c.get('requestId'), message: 'Ignoring canceled/deleted webhook for subscription not in database', subscriptionInDb: customer?.subscription_id, webhookSubscription: stripeData.data.subscription_id })
    }
  }
  return cancelingOrFinished(c, stripeEvent, stripeData.data)
})
