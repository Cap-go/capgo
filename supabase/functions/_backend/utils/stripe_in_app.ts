import type { Context } from 'hono'
import type Stripe from 'stripe'
import type { BillingAccount } from './stripe_billing.ts'
import { simpleError } from './hono.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import { findLatestOpenSubscriptionInvoice, getActiveSubscriptionId, getStripe, syncSubscriptionData } from './stripe.ts'
import { getBillingAccountForCustomer, getStripePublishableKey, isStripeConfiguredForAccount } from './stripe_billing.ts'

// In-app replacements for the Stripe billing portal and hosted invoice page.

export const CANCEL_FEEDBACK_VALUES = [
  'customer_service',
  'low_quality',
  'missing_features',
  'other',
  'switched_service',
  'too_complex',
  'too_expensive',
  'unused',
] as const satisfies readonly Stripe.SubscriptionUpdateParams.CancellationDetails.Feedback[]

export type CancelFeedback = typeof CANCEL_FEEDBACK_VALUES[number]

export const MAX_CANCEL_COMMENT_LENGTH = 1000

export interface InAppBillingContext {
  customerId: string
  billingAccount: BillingAccount
  stripe: Stripe
  publishableKey: string
}

export interface CardSummary {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

export interface SubscriptionSummary {
  status: Stripe.Subscription.Status
  cancelAtPeriodEnd: boolean
  cancelAt: string | null
  currentPeriodEnd: string | null
}

export interface InvoiceListItem {
  id: string
  number: string | null
  created: string
  total: number
  amountDue: number
  currency: string
  status: Stripe.Invoice.Status | null
  pdfUrl: string | null
}

export interface OpenInvoiceSummary {
  id: string
  amountDue: number
  currency: string
}

export type PayInvoiceResult
  = | { status: 'paid' }
    | { status: 'requires_action', clientSecret: string, publishableKey: string }
    | { status: 'requires_payment_method', message: string }

function toIso(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000).toISOString() : null
}

export async function getInAppBillingContext(c: Context, customerId: string): Promise<InAppBillingContext> {
  const billingAccount = await getBillingAccountForCustomer(c, customerId)
  if (!isStripeConfiguredForAccount(c, billingAccount))
    throw simpleError('billing_account_unavailable', 'Billing is temporarily unavailable for this organization', { billingAccount })
  const publishableKey = getStripePublishableKey(c, billingAccount)
  if (!publishableKey)
    throw simpleError('stripe_publishable_key_missing', 'In-app billing is not configured for this organization', { billingAccount })
  return { customerId, billingAccount, stripe: getStripe(c, billingAccount), publishableKey }
}

function toCardSummary(paymentMethod: Stripe.PaymentMethod | null | undefined): CardSummary | null {
  if (!paymentMethod?.card)
    return null
  return {
    id: paymentMethod.id,
    brand: paymentMethod.card.brand,
    last4: paymentMethod.card.last4,
    expMonth: paymentMethod.card.exp_month,
    expYear: paymentMethod.card.exp_year,
  }
}

export async function getDefaultCard(ctx: InAppBillingContext): Promise<CardSummary | null> {
  const customer = await ctx.stripe.customers.retrieve(ctx.customerId, { expand: ['invoice_settings.default_payment_method'] })
  if (customer.deleted)
    return null
  const defaultPaymentMethod = customer.invoice_settings?.default_payment_method
  if (defaultPaymentMethod && typeof defaultPaymentMethod === 'object')
    return toCardSummary(defaultPaymentMethod)
  // Older customers only have the card Checkout saved, without a default.
  const cards = await ctx.stripe.paymentMethods.list({ customer: ctx.customerId, type: 'card', limit: 1 })
  return toCardSummary(cards.data[0])
}

export async function getSubscriptionSummary(c: Context, ctx: InAppBillingContext): Promise<SubscriptionSummary | null> {
  const subscriptionId = await getActiveSubscriptionId(c, ctx.customerId)
  if (!subscriptionId)
    return null
  try {
    const subscription = await ctx.stripe.subscriptions.retrieve(subscriptionId)
    const periodEnd = Math.max(0, ...subscription.items.data.map(item => item.current_period_end ?? 0))
    return {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: toIso(subscription.cancel_at),
      currentPeriodEnd: toIso(periodEnd),
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getSubscriptionSummary', subscriptionId, error })
    return null
  }
}

export async function listInvoices(ctx: InAppBillingContext, limit = 24): Promise<InvoiceListItem[]> {
  const invoices = await ctx.stripe.invoices.list({ customer: ctx.customerId, limit })
  return invoices.data
    .filter(invoice => invoice.status !== 'draft' && !!invoice.id)
    .map(invoice => ({
      id: invoice.id!,
      number: invoice.number ?? null,
      created: toIso(invoice.created)!,
      total: invoice.total,
      amountDue: invoice.amount_remaining ?? invoice.amount_due,
      currency: invoice.currency,
      status: invoice.status ?? null,
      pdfUrl: invoice.invoice_pdf ?? null,
    }))
}

export async function getOpenInvoiceSummary(c: Context, ctx: InAppBillingContext): Promise<OpenInvoiceSummary | null> {
  const invoice = await findLatestOpenSubscriptionInvoice(c, ctx.customerId, ctx.billingAccount)
  if (!invoice?.id)
    return null
  return { id: invoice.id, amountDue: invoice.amount_remaining ?? invoice.amount_due, currency: invoice.currency }
}

export async function createCardSetupIntent(ctx: InAppBillingContext) {
  const setupIntent = await ctx.stripe.setupIntents.create({
    customer: ctx.customerId,
    // Renewals and credit auto top-up charge the card without the user present.
    usage: 'off_session',
    payment_method_types: ['card'],
  })
  return { clientSecret: setupIntent.client_secret, publishableKey: ctx.publishableKey }
}

async function resolveConfirmedPaymentMethodId(ctx: InAppBillingContext, intentId: string) {
  if (/^seti_\w+$/.test(intentId)) {
    const setupIntent = await ctx.stripe.setupIntents.retrieve(intentId)
    if (setupIntent.customer !== ctx.customerId || setupIntent.status !== 'succeeded')
      throw simpleError('invalid_setup_intent', 'Card setup is not complete')
    return typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method?.id ?? null
  }
  if (/^pi_\w+$/.test(intentId)) {
    const paymentIntent = await ctx.stripe.paymentIntents.retrieve(intentId)
    if (paymentIntent.customer !== ctx.customerId || paymentIntent.status !== 'succeeded')
      throw simpleError('invalid_payment_intent', 'Payment is not complete')
    return typeof paymentIntent.payment_method === 'string' ? paymentIntent.payment_method : paymentIntent.payment_method?.id ?? null
  }
  throw simpleError('invalid_intent_id', 'Invalid intent id')
}

// Make the card the customer's default so renewals, retries and auto top-up use it.
export async function setDefaultPaymentMethodFromIntent(c: Context, ctx: InAppBillingContext, intentId: string) {
  const paymentMethodId = await resolveConfirmedPaymentMethodId(ctx, intentId)
  if (!paymentMethodId)
    throw simpleError('missing_payment_method', 'No card was saved')
  const paymentMethod = await ctx.stripe.paymentMethods.retrieve(paymentMethodId)
  if (paymentMethod.customer !== ctx.customerId)
    await ctx.stripe.paymentMethods.attach(paymentMethodId, { customer: ctx.customerId })
  await ctx.stripe.customers.update(ctx.customerId, { invoice_settings: { default_payment_method: paymentMethodId } })
  const subscriptionId = await getActiveSubscriptionId(c, ctx.customerId)
  if (subscriptionId) {
    try {
      await ctx.stripe.subscriptions.update(subscriptionId, { default_payment_method: paymentMethodId })
    }
    catch (error) {
      // The customer default still applies; a subscription-level default would only override it.
      cloudlogErr({ requestId: c.get('requestId'), message: 'setDefaultPaymentMethod subscription update', subscriptionId, error })
    }
  }
  return toCardSummary(paymentMethod)
}

export function parseCancelFeedback(value: unknown): CancelFeedback {
  if (typeof value === 'string' && (CANCEL_FEEDBACK_VALUES as readonly string[]).includes(value))
    return value as CancelFeedback
  throw simpleError('invalid_cancel_reason', 'A valid cancellation reason is required', { allowed: CANCEL_FEEDBACK_VALUES })
}

export function parseCancelComment(value: unknown) {
  if (value === undefined || value === null)
    return undefined
  if (typeof value !== 'string')
    throw simpleError('invalid_cancel_comment', 'Comment must be a string')
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_CANCEL_COMMENT_LENGTH) : undefined
}

async function requireActiveSubscriptionId(c: Context, ctx: InAppBillingContext) {
  const subscriptionId = await getActiveSubscriptionId(c, ctx.customerId)
  if (!subscriptionId)
    throw simpleError('no_active_subscription', 'No active subscription')
  return subscriptionId
}

// Ends at period end, like the portal did; the reason is kept on the Stripe subscription.
export async function scheduleSubscriptionCancel(c: Context, ctx: InAppBillingContext, feedback: CancelFeedback, comment?: string) {
  const subscriptionId = await requireActiveSubscriptionId(c, ctx)
  await ctx.stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
    cancellation_details: { feedback, ...(comment ? { comment } : {}) },
  })
  cloudlog({ requestId: c.get('requestId'), message: 'in-app subscription cancel scheduled', customerId: ctx.customerId, subscriptionId, feedback })
  await syncSubscriptionData(c, ctx.customerId, subscriptionId)
  return await getSubscriptionSummary(c, ctx)
}

export async function resumeSubscription(c: Context, ctx: InAppBillingContext) {
  const subscriptionId = await requireActiveSubscriptionId(c, ctx)
  await ctx.stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
    cancellation_details: { feedback: '', comment: '' },
  })
  await syncSubscriptionData(c, ctx.customerId, subscriptionId)
  return await getSubscriptionSummary(c, ctx)
}

async function getInvoicePaymentIntent(ctx: InAppBillingContext, invoiceId: string) {
  const payments = await ctx.stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 })
  const pending = payments.data.find(payment => payment.status === 'open') ?? payments.data[0]
  const paymentIntent = pending?.payment?.payment_intent
  if (!paymentIntent)
    return null
  return typeof paymentIntent === 'string'
    ? await ctx.stripe.paymentIntents.retrieve(paymentIntent)
    : paymentIntent
}

function getStripeErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : ''
}

function getStripeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Payment failed'
}

// Retry the open renewal invoice with the default card; 3DS is finished client-side.
export async function payOpenInvoice(c: Context, ctx: InAppBillingContext): Promise<PayInvoiceResult> {
  const invoice = await findLatestOpenSubscriptionInvoice(c, ctx.customerId, ctx.billingAccount)
  if (!invoice?.id)
    return { status: 'paid' }
  try {
    const paid = await ctx.stripe.invoices.pay(invoice.id)
    if (paid.status === 'paid')
      return { status: 'paid' }
  }
  catch (error) {
    const code = getStripeErrorCode(error)
    cloudlog({ requestId: c.get('requestId'), message: 'in-app invoice pay failed', customerId: ctx.customerId, invoiceId: invoice.id, code })
    if (code !== 'invoice_payment_intent_requires_action')
      return { status: 'requires_payment_method', message: getStripeErrorMessage(error) }
  }
  const paymentIntent = await getInvoicePaymentIntent(ctx, invoice.id)
  if (paymentIntent?.status === 'requires_action' && paymentIntent.client_secret)
    return { status: 'requires_action', clientSecret: paymentIntent.client_secret, publishableKey: ctx.publishableKey }
  if (paymentIntent?.status === 'succeeded')
    return { status: 'paid' }
  return { status: 'requires_payment_method', message: paymentIntent?.last_payment_error?.message ?? 'Payment failed' }
}

// Lets the user pay the open invoice with a new card in one step (Payment Element).
export async function getOpenInvoicePaymentSecret(c: Context, ctx: InAppBillingContext) {
  const invoice = await findLatestOpenSubscriptionInvoice(c, ctx.customerId, ctx.billingAccount)
  if (!invoice?.id)
    return null
  const paymentIntent = await getInvoicePaymentIntent(ctx, invoice.id)
  if (!paymentIntent?.client_secret || paymentIntent.status === 'succeeded' || paymentIntent.status === 'canceled')
    return null
  if (paymentIntent.setup_future_usage !== 'off_session') {
    // Save the new card so the next renewal does not fail again.
    await ctx.stripe.paymentIntents.update(paymentIntent.id, { setup_future_usage: 'off_session' })
  }
  return { clientSecret: paymentIntent.client_secret, publishableKey: ctx.publishableKey }
}
