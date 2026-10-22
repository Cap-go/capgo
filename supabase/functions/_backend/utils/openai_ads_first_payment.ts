import type { Context } from 'hono'
import type Stripe from 'stripe'
import type { OpenAIAdsUserRecord } from './openai_ads.ts'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getOpenAISubscriptionSourceUrl, isOpenAIAdsConfigured, trackOpenAISubscription } from './openai_ads.ts'

type InvoicePayment = Pick<Stripe.Invoice, 'amount_paid' | 'currency' | 'status'>

export interface OpenAIFirstPaymentInput {
  orgId: string
  /** The org owner (orgs.created_by): the user the registration event reported. */
  ownerUserId: string
  /** stripe_info.paid_at written by this webhook. */
  paidAt: string
  /** Plan name, or the Stripe price id when the plan is unknown. */
  planId: string | null | undefined
  /** The subscription webhook that recorded the first payment. */
  stripeEvent: Stripe.Event | null | undefined
}

export interface OpenAIFirstPaymentDeps {
  loadUser: (userId: string) => Promise<OpenAIAdsUserRecord | null>
  retrieveInvoice: (invoiceId: string) => Promise<InvoicePayment>
  retryDelaysMs?: number[]
}

/**
 * The amount actually paid, in minor units, from a paid invoice. An unpaid or
 * missing invoice reports no amount: a guess would skew the campaign value.
 */
export function getInvoicePayment(invoice: InvoicePayment | null | undefined): { amount?: number, currency?: string } {
  if (!invoice || invoice.status !== 'paid' || typeof invoice.amount_paid !== 'number' || !invoice.currency)
    return {}
  return { amount: invoice.amount_paid, currency: invoice.currency.toUpperCase() }
}

function getLatestInvoiceRef(stripeEvent: Stripe.Event | null | undefined): string | InvoicePayment | null {
  if (!stripeEvent?.type.startsWith('customer.subscription.'))
    return null
  const subscription = stripeEvent.data.object as Stripe.Subscription
  return subscription.latest_invoice ?? null
}

async function loadInvoicePayment(c: Context, stripeEvent: Stripe.Event | null | undefined, deps: OpenAIFirstPaymentDeps) {
  const ref = getLatestInvoiceRef(stripeEvent)
  if (!ref)
    return {}
  try {
    return getInvoicePayment(typeof ref === 'string' ? await deps.retrieveInvoice(ref) : ref)
  }
  catch (error) {
    // Still report the conversion, without a value.
    cloudlogErr({ requestId: c.get('requestId'), message: 'OpenAI Ads subscription: invoice lookup failed', error: serializeError(error) })
    return {}
  }
}

/**
 * Report an org's first payment to OpenAI Ads as `subscription_created`.
 * Call only when paid_at went from null to set (decided under the stripe_info
 * row lock), from backgroundTask. Never throws, so it cannot fail the webhook.
 */
export async function trackOpenAIFirstPayment(c: Context, input: OpenAIFirstPaymentInput, deps: OpenAIFirstPaymentDeps): Promise<boolean> {
  try {
    if (!isOpenAIAdsConfigured(c))
      return false
    const [user, payment] = await Promise.all([
      deps.loadUser(input.ownerUserId),
      loadInvoicePayment(c, input.stripeEvent, deps),
    ])
    if (!user) {
      cloudlog({ requestId: c.get('requestId'), message: 'OpenAI Ads subscription skipped: owner not found', orgId: input.orgId, userId: input.ownerUserId })
      return false
    }
    return await trackOpenAISubscription(c, {
      orgId: input.orgId,
      user,
      paidAt: input.paidAt,
      planId: input.planId,
      ...payment,
      sourceUrl: getOpenAISubscriptionSourceUrl(c),
    }, { retryDelaysMs: deps.retryDelaysMs })
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'OpenAI Ads subscription event error', orgId: input.orgId, error: serializeError(error) })
    return false
  }
}
