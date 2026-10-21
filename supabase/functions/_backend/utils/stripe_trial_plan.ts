import type { Context } from 'hono'
import type Stripe from 'stripe'
import type { InAppBillingContext } from './stripe_in_app.ts'
import { stripeAmountToMajorUnits } from '../../shared/stripe-amount.ts'
import { syncBentoSubscriberTags, trackBentoEvent } from './bento.ts'
import { TRIAL_CARD_BENTO_TAG } from './billing_bento_tags.ts'
import { simpleError } from './hono.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import { findPlanByProductId, getPlanPriceId, isAutomaticTaxEnabled } from './stripe_billing.ts'
import { supabaseAdmin } from './supabase.ts'

// Starts the plan picked during onboarding when the free trial ends, charging the saved card.
// A subscription schedule creates no subscription until its start date, so the org stays a
// trial org (no paying flag, revenue or "subscribed" emails) until Stripe actually bills it.

export const TRIAL_PLAN_SCHEDULE_METADATA_KEY = 'capgo_trial_plan'
export const TRIAL_CARD_ADDED_BENTO_EVENT = 'org:trial_card_added'
export const TRIAL_PLAN_CANCELED_BENTO_EVENT = 'org:trial_plan_canceled'

export interface TrialPlanSummary {
  planName: string
  amount: number
  currency: string
  interval: 'month'
  // When the plan starts and the first invoice is charged.
  startsAt: string
  scheduled: boolean
}

export interface TrialPlanAttribution {
  affonsoReferral?: string | null
  datafastVisitorId?: string | null
  datafastSessionId?: string | null
}

interface TrialState {
  planName: string
  priceId: string
  startsAt: Date
}

// The plugin gate allows trial traffic while trial_at::date > CURRENT_DATE (UTC), so access
// ends at 00:00 UTC on the trial_at date: start the plan exactly then.
export function getTrialPlanStartDate(trialAt: string | null | undefined, now = Date.now()): Date | null {
  if (!trialAt)
    return null
  const parsed = new Date(trialAt)
  if (Number.isNaN(parsed.getTime()))
    return null
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
  return start.getTime() > now ? start : null
}

async function loadTrialState(c: Context, ctx: InAppBillingContext): Promise<TrialState | null> {
  const { data: info, error } = await supabaseAdmin(c)
    .from('stripe_info')
    .select('product_id, trial_at, status, subscription_id')
    .eq('customer_id', ctx.customerId)
    .maybeSingle()
  if (error)
    throw error
  // Orgs that already subscribed manage their plan through checkout, not this flow.
  if (!info?.product_id || info.status === 'succeeded')
    return null
  const startsAt = getTrialPlanStartDate(info.trial_at)
  if (!startsAt)
    return null
  const { data: plan } = await findPlanByProductId(c, info.product_id)
  if (!plan)
    return null
  let priceId: string
  try {
    priceId = getPlanPriceId(plan, ctx.billingAccount, 'month')
  }
  catch {
    return null
  }
  if (!priceId)
    return null
  return { planName: plan.name, priceId, startsAt }
}

async function listPendingTrialPlanSchedules(stripe: Stripe, customerId: string) {
  const schedules = await stripe.subscriptionSchedules.list({ customer: customerId, limit: 100 })
  return schedules.data
    .filter(schedule => schedule.status === 'not_started' && schedule.metadata?.[TRIAL_PLAN_SCHEDULE_METADATA_KEY] === 'true')
    .sort((a, b) => a.created - b.created)
}

export async function findPendingTrialPlanSchedule(stripe: Stripe, customerId: string) {
  return (await listPendingTrialPlanSchedules(stripe, customerId))[0] ?? null
}

// Keep the oldest pending schedule; concurrent requests may each have created one.
export async function cancelDuplicateTrialPlanSchedules(c: Context, stripe: Stripe, customerId: string) {
  const [, ...duplicates] = await listPendingTrialPlanSchedules(stripe, customerId)
  for (const schedule of duplicates) {
    await stripe.subscriptionSchedules.cancel(schedule.id)
    cloudlog({ requestId: c.get('requestId'), message: 'duplicate trial plan schedule canceled', customerId, scheduleId: schedule.id })
  }
}

export async function getTrialPlanSummary(c: Context, ctx: InAppBillingContext): Promise<TrialPlanSummary | null> {
  const state = await loadTrialState(c, ctx)
  if (!state)
    return null
  const [price, schedule] = await Promise.all([
    ctx.stripe.prices.retrieve(state.priceId),
    findPendingTrialPlanSchedule(ctx.stripe, ctx.customerId),
  ])
  return {
    planName: state.planName,
    amount: price.unit_amount ?? 0,
    currency: price.currency,
    interval: 'month',
    startsAt: schedule?.phases[0]?.start_date
      ? new Date(schedule.phases[0].start_date * 1000).toISOString()
      : state.startsAt.toISOString(),
    scheduled: !!schedule,
  }
}

function attributionMetadata(attribution: TrialPlanAttribution): Record<string, string> {
  const metadata: Record<string, string> = {}
  const add = (key: string, value: string | null | undefined) => {
    if (typeof value === 'string' && value && value.length <= 500)
      metadata[key] = value
  }
  add('affonso_referral', attribution.affonsoReferral)
  add('datafast_visitor_id', attribution.datafastVisitorId)
  add('datafast_session_id', attribution.datafastSessionId)
  return metadata
}

// Stripe Tax needs a customer location; the card form only fills the payment method's
// billing address, so copy it to the customer when the customer has none.
async function ensureCustomerTaxAddress(ctx: InAppBillingContext) {
  const customer = await ctx.stripe.customers.retrieve(ctx.customerId, { expand: ['invoice_settings.default_payment_method'] })
  if (customer.deleted || customer.address?.country)
    return
  const paymentMethod = customer.invoice_settings?.default_payment_method
  const address = paymentMethod && typeof paymentMethod === 'object' ? paymentMethod.billing_details?.address : null
  if (!address?.country)
    return
  await ctx.stripe.customers.update(ctx.customerId, {
    address: {
      country: address.country,
      ...(address.postal_code ? { postal_code: address.postal_code } : {}),
      ...(address.line1 ? { line1: address.line1 } : {}),
      ...(address.line2 ? { line2: address.line2 } : {}),
      ...(address.city ? { city: address.city } : {}),
      ...(address.state ? { state: address.state } : {}),
    },
  })
}

// Older customers can have a card attached without a default; the schedule charges the
// default, so promote that card instead of failing.
async function ensureDefaultPaymentMethod(ctx: InAppBillingContext) {
  const customer = await ctx.stripe.customers.retrieve(ctx.customerId)
  if (customer.deleted)
    return false
  if (customer.invoice_settings?.default_payment_method)
    return true
  const cards = await ctx.stripe.paymentMethods.list({ customer: ctx.customerId, type: 'card', limit: 1 })
  const card = cards.data[0]
  if (!card)
    return false
  await ctx.stripe.customers.update(ctx.customerId, { invoice_settings: { default_payment_method: card.id } })
  return true
}

async function getTrialPlanBentoEmails(c: Context, orgId: string, userId: string | undefined) {
  const admin = supabaseAdmin(c)
  const [{ data: org }, { data: user }] = await Promise.all([
    admin.from('orgs').select('management_email').eq('id', orgId).maybeSingle(),
    userId ? admin.from('users').select('email').eq('id', userId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return Array.from(new Set([org?.management_email, user?.email]
    .filter((email): email is string => typeof email === 'string' && email.trim().length > 0)
    .map(email => email.trim().toLowerCase())))
}

async function notifyBento(c: Context, orgId: string, userId: string | undefined, scheduled: boolean, summary: TrialPlanSummary) {
  try {
    const emails = await getTrialPlanBentoEmails(c, orgId, userId)
    const tags = scheduled
      ? { segments: [TRIAL_CARD_BENTO_TAG], deleteSegments: [] }
      : { segments: [], deleteSegments: [TRIAL_CARD_BENTO_TAG] }
    const event = scheduled ? TRIAL_CARD_ADDED_BENTO_EVENT : TRIAL_PLAN_CANCELED_BENTO_EVENT
    const data = {
      org_id: orgId,
      plan_name: summary.planName,
      amount: stripeAmountToMajorUnits(summary.amount, summary.currency),
      currency: summary.currency,
      starts_at: summary.startsAt,
    }
    await syncBentoSubscriberTags(c, emails.map(email => ({ email, ...tags })))
    await Promise.all(emails.map(email => trackBentoEvent(c, email, data, event)))
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'trial plan bento sync failed', orgId, scheduled, error })
  }
}

export async function scheduleTrialPlan(c: Context, ctx: InAppBillingContext, orgId: string, attribution: TrialPlanAttribution = {}) {
  const state = await loadTrialState(c, ctx)
  if (!state)
    throw simpleError('trial_plan_unavailable', 'This organization is not on a free trial')
  if (!await ensureDefaultPaymentMethod(ctx))
    throw simpleError('missing_payment_method', 'Add a card before starting the plan')

  const existing = await findPendingTrialPlanSchedule(ctx.stripe, ctx.customerId)
  if (!existing) {
    await ensureCustomerTaxAddress(ctx)
    const metadata = attributionMetadata(attribution)
    if (Object.keys(metadata).length)
      await ctx.stripe.customers.update(ctx.customerId, { metadata })
    const schedule = await ctx.stripe.subscriptionSchedules.create({
      customer: ctx.customerId,
      start_date: Math.floor(state.startsAt.getTime() / 1000),
      end_behavior: 'release',
      default_settings: {
        automatic_tax: { enabled: isAutomaticTaxEnabled(ctx.billingAccount) },
        collection_method: 'charge_automatically',
      },
      // Phase metadata lands on the subscription so the webhook can recognize it.
      phases: [{ items: [{ price: state.priceId, quantity: 1 }], metadata: { ...metadata, org_id: orgId, [TRIAL_PLAN_SCHEDULE_METADATA_KEY]: 'true' } }],
      metadata: { [TRIAL_PLAN_SCHEDULE_METADATA_KEY]: 'true', org_id: orgId },
    })
    cloudlog({ requestId: c.get('requestId'), message: 'trial plan scheduled', orgId, scheduleId: schedule.id, startsAt: state.startsAt.toISOString() })
    // No idempotency key (it would replay a canceled schedule): drop duplicates from double submits instead.
    await cancelDuplicateTrialPlanSchedules(c, ctx.stripe, ctx.customerId)
  }

  const summary = await getTrialPlanSummary(c, ctx)
  if (!summary)
    throw simpleError('trial_plan_unavailable', 'This organization is not on a free trial')
  if (!existing)
    await notifyBento(c, orgId, c.get('auth')?.userId, true, summary)
  return summary
}

export async function cancelTrialPlan(c: Context, ctx: InAppBillingContext, orgId: string) {
  const schedule = await findPendingTrialPlanSchedule(ctx.stripe, ctx.customerId)
  const summary = await getTrialPlanSummary(c, ctx)
  if (!schedule)
    return summary
  await ctx.stripe.subscriptionSchedules.cancel(schedule.id)
  cloudlog({ requestId: c.get('requestId'), message: 'trial plan schedule canceled', orgId, scheduleId: schedule.id })
  const next = summary ? { ...summary, scheduled: false } : null
  if (next)
    await notifyBento(c, orgId, c.get('auth')?.userId, false, next)
  return next
}

// A subscription bought through checkout replaces the scheduled trial plan: drop the schedule
// so the customer is not billed twice when the trial ends.
export async function cancelTrialPlanScheduleForSubscription(c: Context, stripe: Stripe, subscription: Stripe.Subscription) {
  if (subscription.schedule || isTrialPlanSubscription(subscription))
    return
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const schedule = await findPendingTrialPlanSchedule(stripe, customerId)
  if (!schedule)
    return
  await stripe.subscriptionSchedules.cancel(schedule.id)
  cloudlog({ requestId: c.get('requestId'), message: 'trial plan schedule replaced by subscription', customerId, scheduleId: schedule.id, subscriptionId: subscription.id })
}

export function isTrialPlanSubscription(subscription: Stripe.Subscription) {
  return subscription.metadata?.[TRIAL_PLAN_SCHEDULE_METADATA_KEY] === 'true'
}

// A schedule-born subscription is active before its first invoice is paid (Stripe finalizes it
// about an hour later). Charge it now and only let the org convert once it is paid; on failure
// the subscription goes past_due and the regular dunning flow takes over.
export async function settleTrialPlanFirstInvoice(c: Context, stripe: Stripe, subscription: Stripe.Subscription): Promise<boolean> {
  const invoiceId = typeof subscription.latest_invoice === 'string' ? subscription.latest_invoice : subscription.latest_invoice?.id
  if (!invoiceId)
    return false
  let invoice = await stripe.invoices.retrieve(invoiceId)
  // Renewals follow the normal subscription flow.
  if (invoice.billing_reason !== 'subscription_create')
    return true
  try {
    if (invoice.status === 'draft')
      invoice = await stripe.invoices.finalizeInvoice(invoice.id)
    if (invoice.status === 'open')
      invoice = await stripe.invoices.pay(invoice.id, { off_session: true })
  }
  catch (error) {
    // Card declined, authentication required, or another event already finalized/paid it.
    cloudlog({ requestId: c.get('requestId'), message: 'trial plan first invoice not paid yet', subscriptionId: subscription.id, invoiceId, error })
    invoice = await stripe.invoices.retrieve(invoiceId)
  }
  return invoice.status === 'paid'
}
