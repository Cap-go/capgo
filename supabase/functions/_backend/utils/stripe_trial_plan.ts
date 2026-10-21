import type { Context } from 'hono'
import type Stripe from 'stripe'
import type { InAppBillingContext } from './stripe_in_app.ts'
import { stripeAmountToMajorUnits } from '../../shared/stripe-amount.ts'
import { syncBentoSubscriberTags, trackBentoEvent } from './bento.ts'
import { TRIAL_CARD_BENTO_TAG } from './billing_bento_tags.ts'
import { simpleError } from './hono.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import type { BillingAccount } from './stripe_billing.ts'
import { findPlanByProductId, getPlanPriceId, getPlanProductId, isAutomaticTaxEnabled, TRIAL_PLAN_SCHEDULE_METADATA_KEY } from './stripe_billing.ts'
import { supabaseAdmin } from './supabase.ts'

// Starts the plan picked during onboarding when the free trial ends, charging the saved card.
// A subscription schedule creates no subscription until its start date, so the org stays a
// trial org (no paying flag, revenue or "subscribed" emails) until Stripe actually bills it.

export const TRIAL_CARD_ADDED_BENTO_EVENT = 'org:trial_card_added'
export const TRIAL_PLAN_CANCELED_BENTO_EVENT = 'org:trial_plan_canceled'

// Fixed monthly plans that can auto-start when the trial ends. Enterprise needs a custom MAU quote.
export const SCHEDULABLE_TRIAL_PLAN_NAMES = ['Solo', 'Maker', 'Team'] as const

export interface TrialPlanSummary {
  planName: string
  // Stripe product id for this billing account; used when the user switches plan before scheduling.
  productId: string
  amount: number
  currency: string
  interval: 'month'
  // When the plan starts and the first invoice is charged.
  startsAt: string
  scheduled: boolean
}

// Plans the user can pick in the card/prompt flow (default = onboarding product).
export interface TrialPlanOption {
  productId: string
  planName: string
  // Monthly list price in the smallest currency unit (same as Stripe unit_amount).
  amount: number
  currency: string
}

export interface TrialPlanAttribution {
  affonsoReferral?: string | null
  datafastVisitorId?: string | null
  datafastSessionId?: string | null
}

interface TrialState {
  planName: string
  productId: string
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
  // Orgs that already subscribed manage their plan through checkout, not this flow. A linked
  // subscription counts even when a failed charge left the status at failed.
  const hasLiveSubscription = !!info?.subscription_id && info.status !== 'canceled' && info.status !== 'deleted'
  if (!info?.product_id || info.status === 'succeeded' || hasLiveSubscription)
    return null
  const startsAt = getTrialPlanStartDate(info.trial_at)
  if (!startsAt)
    return null
  const { data: plan } = await findPlanByProductId(c, info.product_id)
  if (!plan)
    return null
  let priceId: string
  let productId: string
  try {
    priceId = getPlanPriceId(plan, ctx.billingAccount, 'month')
    productId = getPlanProductId(plan, ctx.billingAccount)
  }
  catch {
    return null
  }
  if (!priceId || !productId)
    return null
  return { planName: plan.name, productId, priceId, startsAt }
}

function isSchedulableTrialPlanName(name: string | null | undefined): boolean {
  return !!name && (SCHEDULABLE_TRIAL_PLAN_NAMES as readonly string[]).includes(name)
}

// Monthly Solo/Maker/Team for the org's billing account so the prompt can switch before scheduling.
export async function listSchedulableTrialPlans(c: Context, billingAccount: BillingAccount): Promise<TrialPlanOption[]> {
  const { data: plans, error } = await supabaseAdmin(c)
    .from('plans')
    .select('name, price_m, stripe_id, price_m_id, price_y_id, stripe_id_us, price_m_id_us, price_y_id_us')
    .in('name', [...SCHEDULABLE_TRIAL_PLAN_NAMES])
  if (error)
    throw error
  // Console Plans page lists these in USD; keep the picker consistent.
  return (plans ?? [])
    .flatMap((plan) => {
      try {
        const productId = getPlanProductId(plan, billingAccount)
        if (!productId || !isSchedulableTrialPlanName(plan.name))
          return []
        // plans.price_m is a major-unit monthly list price (e.g. 14 for Solo).
        const amount = Math.round(Number(plan.price_m) * 100)
        if (!Number.isFinite(amount) || amount <= 0)
          return []
        return [{ productId, planName: plan.name!, amount, currency: 'usd' }]
      }
      catch {
        return []
      }
    })
    .sort((a, b) => a.amount - b.amount)
}

// Persist a different onboarding product before scheduling so Billing and the schedule agree.
async function applyTrialPlanProduct(c: Context, ctx: InAppBillingContext, productId: string | undefined): Promise<TrialState | null> {
  const state = await loadTrialState(c, ctx)
  if (!state)
    return null
  if (!productId || productId === state.productId)
    return state
  const { data: plan } = await findPlanByProductId(c, productId)
  if (!plan || !isSchedulableTrialPlanName(plan.name))
    throw simpleError('invalid_trial_plan', 'This plan cannot start automatically when the trial ends')
  let nextProductId: string
  let priceId: string
  try {
    nextProductId = getPlanProductId(plan, ctx.billingAccount)
    priceId = getPlanPriceId(plan, ctx.billingAccount, 'month')
  }
  catch {
    throw simpleError('invalid_trial_plan', 'This plan cannot start automatically when the trial ends')
  }
  if (nextProductId !== productId)
    throw simpleError('invalid_trial_plan', 'This plan cannot start automatically when the trial ends')
  const { error } = await supabaseAdmin(c)
    .from('stripe_info')
    .update({ product_id: nextProductId })
    .eq('customer_id', ctx.customerId)
  if (error)
    throw error
  return { planName: plan.name!, productId: nextProductId, priceId, startsAt: state.startsAt }
}

async function listPendingTrialPlanSchedules(stripe: Stripe, customerId: string) {
  // Read every page so cancellation is exhaustive.
  const all: Stripe.SubscriptionSchedule[] = []
  let startingAfter: string | undefined
  do {
    const page = await stripe.subscriptionSchedules.list({ customer: customerId, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) })
    all.push(...page.data)
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined
  } while (startingAfter)
  return all
    .filter(schedule => schedule.status === 'not_started' && schedule.metadata?.[TRIAL_PLAN_SCHEDULE_METADATA_KEY] === 'true')
    .sort((a, b) => a.created - b.created)
}

export async function findPendingTrialPlanSchedule(stripe: Stripe, customerId: string) {
  return (await listPendingTrialPlanSchedules(stripe, customerId))[0] ?? null
}

async function cancelSchedules(c: Context, stripe: Stripe, customerId: string, schedules: readonly Stripe.SubscriptionSchedule[], message: string) {
  await Promise.all(schedules.map(async (schedule) => {
    await stripe.subscriptionSchedules.cancel(schedule.id)
    cloudlog({ requestId: c.get('requestId'), message, customerId, scheduleId: schedule.id })
  }))
}

// Keep the oldest pending schedule; concurrent requests may each have created one.
export async function cancelDuplicateTrialPlanSchedules(c: Context, stripe: Stripe, customerId: string) {
  const [, ...duplicates] = await listPendingTrialPlanSchedules(stripe, customerId)
  await cancelSchedules(c, stripe, customerId, duplicates, 'duplicate trial plan schedule canceled')
}

// Cancel every pending trial plan schedule, duplicates included, so none can still charge.
async function cancelAllPendingTrialPlanSchedules(c: Context, stripe: Stripe, customerId: string, message: string) {
  const schedules = await listPendingTrialPlanSchedules(stripe, customerId)
  await cancelSchedules(c, stripe, customerId, schedules, message)
  return schedules.length
}

// Describes the pending schedule as Stripe will bill it, whether or not the org would be
// eligible to schedule a new one, so Billing always shows (and can cancel) a pending charge.
async function summarizePendingSchedule(c: Context, ctx: InAppBillingContext, schedule: Stripe.SubscriptionSchedule): Promise<TrialPlanSummary | null> {
  const phase = schedule.phases[0]
  const scheduledPrice = phase?.items[0]?.price
  const priceId = typeof scheduledPrice === 'string' ? scheduledPrice : scheduledPrice?.id
  if (!phase || !priceId)
    return null
  const price = await ctx.stripe.prices.retrieve(priceId)
  const productId = typeof price.product === 'string' ? price.product : price.product.id
  const { data: plan } = await findPlanByProductId(c, productId)
  return {
    planName: plan?.name ?? '',
    productId,
    amount: price.unit_amount ?? 0,
    currency: price.currency,
    interval: 'month',
    startsAt: new Date(phase.start_date * 1000).toISOString(),
    scheduled: true,
  }
}

export async function getTrialPlanSummary(c: Context, ctx: InAppBillingContext): Promise<TrialPlanSummary | null> {
  const schedule = await findPendingTrialPlanSchedule(ctx.stripe, ctx.customerId)
  if (schedule)
    return summarizePendingSchedule(c, ctx, schedule)
  // Eligibility only gates offering a new plan.
  const state = await loadTrialState(c, ctx)
  if (!state)
    return null
  const price = await ctx.stripe.prices.retrieve(state.priceId)
  return {
    planName: state.planName,
    productId: state.productId,
    amount: price.unit_amount ?? 0,
    currency: price.currency,
    interval: 'month',
    startsAt: state.startsAt.toISOString(),
    scheduled: false,
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

export async function scheduleTrialPlan(
  c: Context,
  ctx: InAppBillingContext,
  orgId: string,
  attribution: TrialPlanAttribution = {},
  productId?: string,
) {
  const state = await applyTrialPlanProduct(c, ctx, productId)
  if (!state)
    throw simpleError('trial_plan_unavailable', 'This organization is not on a free trial')
  if (!await ensureDefaultPaymentMethod(ctx))
    throw simpleError('missing_payment_method', 'Add a card before starting the plan')

  let existing: Stripe.SubscriptionSchedule | null = await findPendingTrialPlanSchedule(ctx.stripe, ctx.customerId)
  if (existing) {
    const phasePrice = existing.phases[0]?.items[0]?.price
    const scheduledPriceId = typeof phasePrice === 'string' ? phasePrice : phasePrice?.id
    // A different product means replace the pending schedule so the card starts the chosen plan.
    if (scheduledPriceId && scheduledPriceId !== state.priceId) {
      await cancelAllPendingTrialPlanSchedules(c, ctx.stripe, ctx.customerId, 'trial plan schedule replaced by plan change')
      existing = null
    }
  }
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
    cloudlog({ requestId: c.get('requestId'), message: 'trial plan scheduled', orgId, scheduleId: schedule.id, startsAt: state.startsAt.toISOString(), productId: state.productId })
  }
  // No idempotency key (it would replay a canceled schedule): drop duplicates from concurrent
  // submits instead, on every call so a retry repairs a cleanup that failed earlier.
  await cancelDuplicateTrialPlanSchedules(c, ctx.stripe, ctx.customerId)

  const summary = await getTrialPlanSummary(c, ctx)
  if (!summary)
    throw simpleError('trial_plan_unavailable', 'This organization is not on a free trial')
  if (!existing)
    await notifyBento(c, orgId, c.get('auth')?.userId, true, summary)
  return summary
}

export async function cancelTrialPlan(c: Context, ctx: InAppBillingContext, orgId: string) {
  // Cancel before enriching the summary so a temporary Stripe/price error cannot leave the charge active.
  const schedule = await findPendingTrialPlanSchedule(ctx.stripe, ctx.customerId)
  const canceled = await cancelAllPendingTrialPlanSchedules(c, ctx.stripe, ctx.customerId, 'trial plan schedule canceled')
  if (!canceled)
    return getTrialPlanSummary(c, ctx)
  let summary: TrialPlanSummary | null = null
  if (schedule) {
    try {
      summary = await summarizePendingSchedule(c, ctx, schedule)
    }
    catch (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'trial plan cancel summary enrichment failed', orgId, error })
      const phase = schedule.phases[0]
      summary = {
        planName: '',
        productId: '',
        amount: 0,
        currency: 'usd',
        interval: 'month',
        startsAt: phase ? new Date(phase.start_date * 1000).toISOString() : new Date().toISOString(),
        scheduled: true,
      }
    }
  }
  const next = summary ? { ...summary, scheduled: false } : null
  if (next)
    await notifyBento(c, orgId, c.get('auth')?.userId, false, next)
  return next
}

// A subscription bought through checkout replaces the scheduled trial plan: drop the schedule
// so the customer is not billed twice when the trial ends.
// Only a subscription that is live (paid checkout) replaces the trial plan; an incomplete
// checkout that is abandoned must keep the scheduled plan.
const REPLACING_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing'])

export async function cancelTrialPlanScheduleForSubscription(c: Context, stripe: Stripe, subscription: Stripe.Subscription) {
  if (subscription.schedule || isTrialPlanSubscription(subscription) || !REPLACING_SUBSCRIPTION_STATUSES.has(subscription.status))
    return
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  await cancelAllPendingTrialPlanSchedules(c, stripe, customerId, `trial plan schedule replaced by subscription ${subscription.id}`)
}

// A trial plan subscription whose first invoice never got paid (e.g. Stripe gave up on it).
export async function isTrialPlanFirstInvoiceUnpaid(stripe: Stripe, subscription: Stripe.Subscription) {
  if (!isTrialPlanSubscription(subscription))
    return false
  const invoiceId = typeof subscription.latest_invoice === 'string' ? subscription.latest_invoice : subscription.latest_invoice?.id
  if (!invoiceId)
    return true
  const invoice = typeof subscription.latest_invoice === 'object' && subscription.latest_invoice
    ? subscription.latest_invoice
    : await stripe.invoices.retrieve(invoiceId)
  return invoice.billing_reason === 'subscription_create' && invoice.status !== 'paid'
}

export function isTrialPlanSubscription(subscription: Stripe.Subscription) {
  return subscription.metadata?.[TRIAL_PLAN_SCHEDULE_METADATA_KEY] === 'true'
}

// first_paid: the first invoice is paid (convert). unpaid: still waiting for it.
// renewal: a later invoice, handled by the normal subscription flow.
export type TrialPlanFirstInvoiceState = 'first_paid' | 'unpaid' | 'renewal'

// A schedule-born subscription is active before its first invoice is paid (Stripe finalizes it
// about an hour later). Charge it now and only let the org convert once it is paid; on failure
// the subscription goes past_due and the regular dunning flow takes over.
// Statuses in which we may still collect the first invoice. A canceled or expired
// subscription must never be charged, even by a delayed webhook carrying an old snapshot.
const COLLECTIBLE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'past_due'])

export async function settleTrialPlanFirstInvoice(c: Context, stripe: Stripe, eventSubscription: Stripe.Subscription): Promise<TrialPlanFirstInvoiceState> {
  // Work from the live subscription, not the webhook snapshot.
  const subscription = await stripe.subscriptions.retrieve(eventSubscription.id)
  const invoiceId = typeof subscription.latest_invoice === 'string' ? subscription.latest_invoice : subscription.latest_invoice?.id
  if (!invoiceId)
    return 'unpaid'
  let invoice = await stripe.invoices.retrieve(invoiceId)
  if (invoice.billing_reason !== 'subscription_create')
    return 'renewal'
  if (invoice.status !== 'paid' && !COLLECTIBLE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    cloudlog({ requestId: c.get('requestId'), message: 'trial plan first invoice not collected: subscription no longer live', subscriptionId: subscription.id, status: subscription.status })
    return 'unpaid'
  }
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
  if (invoice.status !== 'paid')
    return 'unpaid'
  // The schedule only existed to start the plan: release it so plan changes and
  // cancellation work like any other subscription.
  if (subscription.schedule)
    await releaseTrialPlanSchedule(c, stripe, subscription.id)
  return 'first_paid'
}

// Stripe rejects direct updates to a subscription a schedule still manages. Release the
// trial plan schedule (it only existed to start the plan) so cancel/resume work; other
// schedules keep their future phases.
export async function releaseTrialPlanSchedule(c: Context, stripe: Stripe, subscriptionId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const scheduleId = typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule?.id
  if (!scheduleId)
    return
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId)
  if (schedule.metadata?.[TRIAL_PLAN_SCHEDULE_METADATA_KEY] !== 'true' || (schedule.status !== 'active' && schedule.status !== 'not_started'))
    return
  try {
    await stripe.subscriptionSchedules.release(scheduleId)
  }
  catch (error) {
    // A concurrent caller (webhook settlement vs. in-app cancel) may have released it first.
    const latest = await stripe.subscriptionSchedules.retrieve(scheduleId)
    if (latest.status === 'active' || latest.status === 'not_started')
      throw error
    return
  }
  cloudlog({ requestId: c.get('requestId'), message: 'trial plan schedule released', subscriptionId, scheduleId })
}
