import type { Context } from 'hono'
import type Stripe from 'stripe'
import type { MiddlewareKeyVariablesStripe } from '../utils/hono_middleware_stripe.ts'
import type { StripeData } from '../utils/stripe.ts'
import type { Database } from '../utils/supabase.types.ts'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { addTagBento, trackBentoEvent } from '../utils/bento.ts'
import { getFallbackCreditProductId } from '../utils/credits.ts'
import { BRES, quickError, simpleError } from '../utils/hono.ts'
import { middlewareStripeWebhook } from '../utils/hono_middleware_stripe.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import * as schema from '../utils/postgres_schema.ts'
import { groupIdentifyPosthog } from '../utils/posthog.ts'
import { ensureCustomerMetadata, getCreditCheckoutDetails, syncStripeCustomerCountry } from '../utils/stripe.ts'
import { customerToSegmentOrg, supabaseAdmin } from '../utils/supabase.ts'
import { sendEventToTracking } from '../utils/tracking.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariablesStripe>()

interface Org {
  id: string
  management_email: string
  created_by: string
  customer_id?: string | null
}

type StripeInfoRow = Database['public']['Tables']['stripe_info']['Row']
type StripeInfoUpdate = Database['public']['Tables']['stripe_info']['Update']
type PlanRow = Database['public']['Tables']['plans']['Row']
type StripeInfoRevenueState = {
  is_good_plan?: boolean | null
  paid_at?: string | null
  price_id?: string | null
  product_id?: string | null
  status?: Database['public']['Enums']['stripe_status'] | null
} | null | undefined
type RevenuePlanRow = Pick<PlanRow, 'price_m' | 'price_m_id' | 'price_y' | 'price_y_id' | 'stripe_id'>

interface RevenueMovement {
  currentMrr: number
  nextMrr: number
  newBusinessMrr: number
  expansionMrr: number
  contractionMrr: number
  churnMrr: number
}

const ZERO_REVENUE_MOVEMENT: RevenueMovement = {
  currentMrr: 0,
  nextMrr: 0,
  newBusinessMrr: 0,
  expansionMrr: 0,
  contractionMrr: 0,
  churnMrr: 0,
}
const STRIPE_INFO_TRANSACTION_COLUMNS = [
  'bandwidth_exceeded',
  'build_time_exceeded',
  'canceled_at',
  'customer_country',
  'is_good_plan',
  'mau_exceeded',
  'paid_at',
  'plan_calculated_at',
  'plan_usage',
  'price_id',
  'product_id',
  'status',
  'storage_exceeded',
  'subscription_anchor_end',
  'subscription_anchor_start',
  'subscription_id',
  'trial_at',
  'upgraded_at',
] as const
const STRIPE_INFO_TRANSACTION_COLUMN_SET = new Set<string>(STRIPE_INFO_TRANSACTION_COLUMNS)

const checkoutSessionEventTypes = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
])

const customerProfileEventTypes = new Set([
  'customer.created',
  'customer.updated',
])

function isCheckoutSessionEvent(event: Stripe.Event) {
  return checkoutSessionEventTypes.has(event.type)
}

function isCustomerProfileEvent(event: Stripe.Event) {
  return customerProfileEventTypes.has(event.type)
}

function getPaidAtUpdate(
  currentStripeInfo: Pick<StripeInfoRow, 'paid_at' | 'status'> | null | undefined,
  nextStatus: Database['public']['Enums']['stripe_status'] | null | undefined,
  eventOccurredAtIso: string = new Date().toISOString(),
) {
  if (!nextStatus || !['created', 'succeeded'].includes(nextStatus))
    return undefined

  if (currentStripeInfo?.paid_at)
    return undefined

  if (currentStripeInfo?.status === 'succeeded')
    return undefined

  return eventOccurredAtIso
}

function toStripeInfoUpdate(data: StripeData['data']): StripeInfoUpdate {
  return Object.fromEntries(
    Object.entries(data).filter(([_, value]) => value !== undefined),
  ) as StripeInfoUpdate
}

function compactMetadata(metadata: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([_, value]) => value !== undefined),
  ) as Record<string, string>
}

function getPlanType(
  plan: Pick<PlanRow, 'price_m_id' | 'price_y_id'>,
  priceId: string | null | undefined,
) {
  if (!priceId)
    return undefined
  if (plan.price_m_id === priceId)
    return 'monthly'
  if (plan.price_y_id === priceId)
    return 'yearly'
  return undefined
}

function getSubscriptionTrackingState(
  stripeData: Pick<StripeData, 'data' | 'isUpgrade' | 'previousPriceId' | 'previousProductId'>,
  originalStatus: Database['public']['Enums']['stripe_status'] | null | undefined,
) {
  return {
    shouldSendPlanChange: Boolean(
      stripeData.previousProductId
      && stripeData.data.product_id
      && stripeData.previousProductId !== stripeData.data.product_id,
    ),
    statusName: stripeData.isUpgrade ? 'upgraded' : originalStatus ?? '',
  }
}

function buildSubscriptionEventMetadata(
  stripeData: Pick<StripeData, 'data' | 'previousPriceId' | 'previousProductId'>,
  currentPlan: Pick<PlanRow, 'name' | 'price_m_id' | 'price_y_id' | 'stripe_id'>,
  previousPlan?: Pick<PlanRow, 'name' | 'price_m_id' | 'price_y_id' | 'stripe_id'> | null,
) {
  const currentPlanType = getPlanType(currentPlan, stripeData.data.price_id)
  const fallbackPreviousPlan = stripeData.previousProductId === currentPlan.stripe_id ? currentPlan : previousPlan
  const previousPlanType = fallbackPreviousPlan
    ? getPlanType(fallbackPreviousPlan, stripeData.previousPriceId)
    : undefined

  return compactMetadata({
    plan_name: currentPlan.name,
    plan_type: currentPlanType,
    previous_plan_name: fallbackPreviousPlan?.name,
    previous_plan_type: previousPlanType,
  })
}

function getPlanChangeTrackingEventName(statusName: string) {
  return statusName === 'upgraded' ? 'User Upgraded' : 'User Plan Changed'
}

function getEventDateId(eventOccurredAtIso: string) {
  return new Date(eventOccurredAtIso).toISOString().slice(0, 10)
}

function getPlanMrr(plan: RevenuePlanRow | null | undefined, priceId: string | null | undefined) {
  if (!plan || !priceId)
    return 0

  if (plan.price_m_id === priceId)
    return Number(plan.price_m) || 0

  if (plan.price_y_id === priceId)
    return (Number(plan.price_y) || 0) / 12

  return 0
}

function getPlanByProductId(plans: RevenuePlanRow[], productId: string | null | undefined) {
  if (!productId)
    return null

  return plans.find(plan => plan.stripe_id === productId) ?? null
}

function getSubscriptionMrr(plans: RevenuePlanRow[], stripeInfo: StripeInfoRevenueState) {
  if (!stripeInfo || stripeInfo.status !== 'succeeded' || stripeInfo.is_good_plan === false)
    return 0

  return getPlanMrr(getPlanByProductId(plans, stripeInfo.product_id), stripeInfo.price_id)
}

function classifyRevenueMovement(
  currentStripeInfo: StripeInfoRevenueState,
  nextStripeInfo: StripeInfoRevenueState,
  plans: RevenuePlanRow[],
): RevenueMovement {
  const currentMrr = getSubscriptionMrr(plans, currentStripeInfo)
  const nextMrr = getSubscriptionMrr(plans, nextStripeInfo)

  if (currentMrr === 0 && nextMrr === 0)
    return { ...ZERO_REVENUE_MOVEMENT }

  if (currentMrr === 0 && nextMrr > 0) {
    if (!currentStripeInfo?.paid_at) {
      return {
        ...ZERO_REVENUE_MOVEMENT,
        currentMrr,
        nextMrr,
        newBusinessMrr: nextMrr,
      }
    }

    return {
      ...ZERO_REVENUE_MOVEMENT,
      currentMrr,
      nextMrr,
      expansionMrr: nextMrr,
    }
  }

  if (currentMrr > 0 && nextMrr === 0) {
    return {
      ...ZERO_REVENUE_MOVEMENT,
      currentMrr,
      nextMrr,
      churnMrr: currentMrr,
    }
  }

  if (nextMrr > currentMrr) {
    return {
      ...ZERO_REVENUE_MOVEMENT,
      currentMrr,
      nextMrr,
      expansionMrr: nextMrr - currentMrr,
    }
  }

  if (currentMrr > nextMrr) {
    return {
      ...ZERO_REVENUE_MOVEMENT,
      currentMrr,
      nextMrr,
      contractionMrr: currentMrr - nextMrr,
    }
  }

  return {
    ...ZERO_REVENUE_MOVEMENT,
    currentMrr,
    nextMrr,
  }
}

function hasRevenueMovement(movement: RevenueMovement) {
  return movement.newBusinessMrr > 0
    || movement.expansionMrr > 0
    || movement.contractionMrr > 0
    || movement.churnMrr > 0
}

function isStaleStripeEvent(
  currentStripeInfo: Pick<StripeInfoRow, 'updated_at'> | null | undefined,
  eventOccurredAtIso: string,
) {
  if (!currentStripeInfo?.updated_at)
    return false

  return new Date(currentStripeInfo.updated_at).getTime() > new Date(eventOccurredAtIso).getTime()
}

async function getRevenuePlans(c: Context): Promise<RevenuePlanRow[]> {
  const { data: plans, error } = await supabaseAdmin(c)
    .from('plans')
    .select('stripe_id, price_m, price_y, price_m_id, price_y_id')
    .in('name', ['Solo', 'Maker', 'Team', 'Enterprise'])

  if (error) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Failed to load revenue plans for Stripe revenue movement tracking',
      error,
    })
    return []
  }

  return plans ?? []
}

function buildStripeInfoUpdateStatement(customerId: string, updateData: StripeInfoUpdate) {
  const entries = Object.entries(updateData)
    .filter(([key, value]) => value !== undefined && STRIPE_INFO_TRANSACTION_COLUMN_SET.has(key))

  if (entries.length === 0)
    return null

  const values: unknown[] = [customerId]
  const assignments = entries.map(([key, value]) => {
    values.push(value)
    return `"${key}" = $${values.length}`
  })

  return {
    text: `UPDATE public.stripe_info SET ${assignments.join(', ')} WHERE customer_id = $1`,
    values,
  }
}

async function persistStripeInfoAndRevenueMovement(
  c: Context,
  customerId: string,
  updateData: StripeInfoUpdate,
  eventOccurredAtIso: string,
  movement: RevenueMovement,
) {
  const updateStatement = buildStripeInfoUpdateStatement(customerId, updateData)
  const shouldRecordMovement = hasRevenueMovement(movement)

  if (!updateStatement && !shouldRecordMovement)
    return true

  const pgClient = getPgClient(c, false)

  try {
    await pgClient.query('BEGIN')

    if (updateStatement) {
      const result = await pgClient.query(updateStatement.text, updateStatement.values)
      if ((result.rowCount ?? 0) === 0) {
        await pgClient.query('ROLLBACK')
        return false
      }
    }

    if (shouldRecordMovement) {
      await pgClient.query(`
        INSERT INTO public.daily_revenue_metrics (
          date_id,
          customer_id,
          opening_mrr,
          new_business_mrr,
          expansion_mrr,
          contraction_mrr,
          churn_mrr
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (date_id, customer_id)
        DO UPDATE SET
          updated_at = now(),
          new_business_mrr = public.daily_revenue_metrics.new_business_mrr + EXCLUDED.new_business_mrr,
          expansion_mrr = public.daily_revenue_metrics.expansion_mrr + EXCLUDED.expansion_mrr,
          contraction_mrr = public.daily_revenue_metrics.contraction_mrr + EXCLUDED.contraction_mrr,
          churn_mrr = public.daily_revenue_metrics.churn_mrr + EXCLUDED.churn_mrr
      `, [
        getEventDateId(eventOccurredAtIso),
        customerId,
        movement.currentMrr,
        movement.newBusinessMrr,
        movement.expansionMrr,
        movement.contractionMrr,
        movement.churnMrr,
      ])
    }

    await pgClient.query('COMMIT')
    return true
  }
  catch (error) {
    try {
      await pgClient.query('ROLLBACK')
    }
    catch {
      // Ignore rollback failures and rethrow the original error.
    }
    throw error
  }
  finally {
    closeClient(c, pgClient)
  }
}

async function writePaidAtAtomically(c: Context, customerId: string, eventOccurredAtIso: string) {
  const pgClient = getPgClient(c, false)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    await drizzleClient.execute(sql`
      UPDATE public.stripe_info
      SET paid_at = LEAST(
        COALESCE(paid_at, ${new Date(eventOccurredAtIso)}),
        ${new Date(eventOccurredAtIso)}
      )
      WHERE customer_id = ${customerId}
    `)
  }
  finally {
    closeClient(c, pgClient)
  }
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

  const { creditQuantity, itemsSummary } = await getCreditCheckoutDetails(c, session, creditProductId)

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

async function customerSourceCreated(c: Context, org: Org, stripeEvent: Stripe.CustomerSourceCreatedEvent) {
  const card = stripeEvent.data.object as any
  const expirationDate = card.exp_month && card.exp_year ? `${card.exp_month}/${card.exp_year}` : 'unknown'
  await sendEventToTracking(c, {
    bento: {
      cron: '* * * * *',
      data: { expiration_date: expirationDate },
      event: 'org:card_added',
      preferenceKey: 'credit_usage',
      uniqId: 'org:card_added',
    },
    channel: 'usage',
    event: 'Credit Card Added',
    icon: '💳',
    sentToBento: true,
    user_id: org.id,
    groups: { organization: org.id },
    notify: false,
  })
  return c.json(BRES)
}

async function customerSourceExpiring(c: Context, org: Org) {
  await sendEventToTracking(c, {
    bento: {
      cron: '* * * * *',
      data: {},
      event: 'org:card_expiring',
      preferenceKey: 'credit_usage',
      uniqId: 'org:card_expiring',
    },
    channel: 'usage',
    event: 'Credit Card Expiring',
    icon: '⚠️',
    sentToBento: true,
    user_id: org.id,
    groups: { organization: org.id },
    notify: false,
  })
  return c.json(BRES)
}

async function invoiceUpcoming(c: Context, org: Org, stripeEvent: Stripe.InvoiceUpcomingEvent, stripeData: StripeData) {
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
  await sendEventToTracking(c, {
    bento: {
      cron: '* * * * *',
      data: { plan_name: planName, price, plan_type: planType },
      event: 'org:invoice_upcoming',
      preferenceKey: 'credit_usage',
      uniqId: 'org:invoice_upcoming',
    },
    channel: 'usage',
    event: 'Invoice Upcoming',
    icon: '📄',
    sentToBento: true,
    user_id: org.id,
    groups: { organization: org.id },
    notify: false,
  })
  return c.json(BRES)
}

async function createdOrUpdated(
  c: Context,
  stripeData: StripeData,
  org: Org,
  currentStripeInfo: StripeInfoRow | null | undefined,
  eventOccurredAtIso: string,
  originalStatus?: Database['public']['Enums']['stripe_status'] | null,
) {
  const status = originalStatus ?? stripeData.data.status
  let statusName: string = status ?? ''
  if (isStaleStripeEvent(currentStripeInfo, eventOccurredAtIso)) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Skipping stale Stripe subscription event',
      customerId: stripeData.data.customer_id,
      eventOccurredAtIso,
      currentStripeInfoUpdatedAt: currentStripeInfo?.updated_at,
      subscriptionId: stripeData.data.subscription_id,
    })
    return
  }
  const { data: plan } = await supabaseAdmin(c)
    .from('plans')
    .select()
    .eq('stripe_id', stripeData.data.product_id)
    .single()
  if (plan) {
    const trackingState = getSubscriptionTrackingState(stripeData, status)
    statusName = trackingState.statusName
    const updateData = toStripeInfoUpdate(stripeData.data)
    const paidAt = getPaidAtUpdate(currentStripeInfo, status, eventOccurredAtIso)
    if (paidAt)
      updateData.paid_at = paidAt
    const revenuePlans = await getRevenuePlans(c)
    const revenueMovement = classifyRevenueMovement(currentStripeInfo, updateData, revenuePlans)
    if (revenueMovement.currentMrr > 0 && revenueMovement.nextMrr > revenueMovement.currentMrr)
      updateData.upgraded_at = eventOccurredAtIso
    const didPersist = await persistStripeInfoAndRevenueMovement(
      c,
      stripeData.data.customer_id,
      updateData,
      eventOccurredAtIso,
      revenueMovement,
    )
    if (!didPersist)
      return quickError(404, 'succeeded_customer_id_not_found', `succeeded: customer_id not found`, { stripeData })

    let previousPlan: PlanRow | null = null
    if (trackingState.shouldSendPlanChange && stripeData.previousProductId) {
      const previousProduct = await supabaseAdmin(c)
        .from('plans')
        .select()
        .eq('stripe_id', stripeData.previousProductId)
        .single()
      previousPlan = previousProduct.data
      const planChangeMetadata = buildSubscriptionEventMetadata(stripeData, plan, previousPlan)
      const planChangeEventName = getPlanChangeTrackingEventName(trackingState.statusName)
      await sendEventToTracking(c, {
        bento: {
          cron: '* * * * *',
          data: planChangeMetadata,
          event: 'user:plan_change',
          preferenceKey: 'credit_usage',
          uniqId: 'user:plan_change',
        },
        channel: 'usage',
        event: planChangeEventName,
        icon: '💰',
        sentToBento: true,
        user_id: org.id,
        groups: { organization: org.id },
        notify: true,
        tags: planChangeMetadata,
      })
    }

    if (paidAt) {
      await writePaidAtAtomically(c, stripeData.data.customer_id, paidAt)
    }

    const segment = await customerToSegmentOrg(c, org.id, stripeData.data.price_id, plan)
    const isMonthly = plan.price_m_id === stripeData.data.price_id
    const eventName = `user:subscribe_${statusName}:${isMonthly ? 'monthly' : 'yearly'}`
    const subscriptionMetadata = buildSubscriptionEventMetadata(stripeData, plan, previousPlan)
    await addTagBento(c, org.management_email, segment)
    const isNewSubscription = status === 'created'
    await sendEventToTracking(c, {
      bento: {
        cron: '* * * * *',
        data: subscriptionMetadata,
        event: eventName,
        preferenceKey: 'credit_usage',
        uniqId: `subscription:${eventName}:${plan.name}`,
      },
      channel: 'usage',
      event: isNewSubscription ? 'User subscribe' : 'User update subscribe',
      icon: '💰',
      sentToBento: true,
      user_id: org.id,
      groups: { organization: org.id },
      notify: isNewSubscription,
      tags: subscriptionMetadata,
    })

    await backgroundTask(c, groupIdentifyPosthog(c, {
      groupType: 'organization',
      groupKey: org.id,
      properties: {
        plan_name: plan.name,
        plan_status: status,
        plan_type: isMonthly ? 'monthly' : 'yearly',
        subscription_status_name: statusName,
      },
    }))
  }
  else {
    const segment = await customerToSegmentOrg(c, org.id, stripeData.data.price_id)
    await addTagBento(c, org.management_email, segment)
  }
}

async function updateStripeInfo(c: Context, stripeData: StripeData) {
  const updateData = toStripeInfoUpdate(stripeData.data)
  const { error: dbError2 } = await supabaseAdmin(c)
    .from('stripe_info')
    .update(updateData)
    .eq('customer_id', stripeData.data.customer_id)
  if (dbError2) {
    return quickError(404, 'canceled_customer_id_not_found', `canceled:  customer_id not found`, { dbError2, stripeData })
  }
  return false
}

async function didCancel(c: Context, org: Org) {
  const segment = await customerToSegmentOrg(c, org.id, 'canceled')
  await addTagBento(c, org.management_email, segment)
  await sendEventToTracking(c, {
    bento: {
      cron: '* * * * *',
      data: {},
      event: 'user:cancel',
      preferenceKey: 'credit_usage',
      uniqId: 'user:cancel',
    },
    channel: 'usage',
    event: 'User cancel',
    icon: '⚠️',
    sentToBento: true,
    user_id: org.id,
    groups: { organization: org.id },
    notify: true,
  })

  await backgroundTask(c, groupIdentifyPosthog(c, {
    groupType: 'organization',
    groupKey: org.id,
    properties: {
      plan_status: 'canceled',
      canceled_at: new Date().toISOString(),
    },
  }))
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
  const stripeData = c.get('stripeData')!
  const stripeEvent = c.get('stripeEvent')!
  const isCheckoutSession = isCheckoutSessionEvent(stripeEvent)

  if (isCustomerProfileEvent(stripeEvent)) {
    await syncStripeCustomerCountry(c, stripeData.data.customer_id)
    return c.json(BRES)
  }

  // find email from user with customer_id
  const org = await getOrg(c, stripeData)

  await ensureCustomerMetadata(c, stripeData.data.customer_id, org.id, org.created_by)
  stripeData.data.customer_country = await syncStripeCustomerCountry(c, stripeData.data.customer_id)

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
    return customerSourceExpiring(c, org)
  }
  else if (stripeEvent.type === 'customer.source.created') {
    return customerSourceCreated(c, org, stripeEvent)
  }
  else if (stripeEvent.type === 'invoice.upcoming') {
    return invoiceUpcoming(c, org, stripeEvent, stripeData)
  }

  if (['created', 'succeeded', 'updated'].includes(stripeData.data.status ?? '') && stripeData.data.price_id && stripeData.data.product_id) {
    const originalStatus = stripeData.data.status
    const eventOccurredAtIso = new Date(stripeEvent.created * 1000).toISOString()
    stripeData.data.status = 'succeeded'
    await createdOrUpdated(c, stripeData, org, customer, eventOccurredAtIso, originalStatus!)
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
    const eventOccurredAtIso = new Date(stripeEvent.created * 1000).toISOString()
    if (isStaleStripeEvent(customer, eventOccurredAtIso)) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Skipping stale Stripe cancellation event',
        customerId: stripeData.data.customer_id,
        eventOccurredAtIso,
        currentStripeInfoUpdatedAt: customer?.updated_at,
        subscriptionId: stripeData.data.subscription_id,
      })
      return c.json(BRES)
    }
    // Check if this is the subscription currently in the database
    if (customer && customer.subscription_id === stripeData.data.subscription_id) {
      // This is the known subscription being cancelled
      await didCancel(c, org)
      // Only mark as 'succeeded' if subscription is still active until period end
      // Check if subscription_anchor_end is in the future
      if (stripeData.data.subscription_anchor_end && new Date(stripeData.data.subscription_anchor_end) > new Date()) {
        stripeData.data.status = 'succeeded'
      }
      const revenuePlans = await getRevenuePlans(c)
      const revenueMovement = classifyRevenueMovement(customer, stripeData.data, revenuePlans)
      // Otherwise keep it as 'canceled' since the period has ended
      const didPersist = await persistStripeInfoAndRevenueMovement(
        c,
        stripeData.data.customer_id,
        toStripeInfoUpdate(stripeData.data),
        eventOccurredAtIso,
        revenueMovement,
      )
      if (!didPersist)
        return quickError(404, 'canceled_customer_id_not_found', `canceled: customer_id not found`, { stripeData })
    }
    // If it's a different subscription (not the one in DB), ignore it
    // This prevents old subscription webhooks from overwriting newer active subscriptions
    else {
      cloudlog({ requestId: c.get('requestId'), message: 'Ignoring canceled/deleted webhook for subscription not in database', subscriptionInDb: customer?.subscription_id, webhookSubscription: stripeData.data.subscription_id })
    }
  }
  return cancelingOrFinished(c, stripeEvent, stripeData.data)
})

export const stripeEventTestUtils = {
  buildSubscriptionEventMetadata,
  classifyRevenueMovement,
  getEventDateId,
  getPaidAtUpdate,
  getPlanChangeTrackingEventName,
  getSubscriptionMrr,
  getSubscriptionTrackingState,
  isStaleStripeEvent,
  isCustomerProfileEvent,
}
