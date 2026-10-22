import type { Context } from 'hono'
import type Stripe from 'stripe'
import type { OpenAIAdsUserRecord } from './openai_ads.ts'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getOpenAISubscriptionSourceUrl, isOpenAIAdsConfigured, trackOpenAISubscription } from './openai_ads.ts'

type InvoicePayment = Pick<Stripe.Invoice, 'amount_paid' | 'currency' | 'status'>
type InvoiceRef = string | (InvoicePayment & Pick<Stripe.Invoice, 'id'>)

export interface OpenAIFirstPaymentInput {
  orgId: string
  /** The org owner (orgs.created_by): the user the registration event reported. */
  ownerUserId: string
  /** When the first payment happened (see getOpenAIFirstPaymentAt). */
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

// Matches the API's 7-day limit: an older first payment can no longer be reported.
const RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Payment proof from the subscription's latest invoice. Only a `paid` invoice
 * counts: paid_at is also set for a subscription created `incomplete` (for
 * example while 3-D Secure is pending), which is not a payment yet. A paid $0
 * invoice (promotion code covering the first period) is a real enrollment and
 * is reported with amount 0: it is the org's only first-payment moment, since
 * paid_at is already set when the discount ends.
 */
export function getInvoicePayment(invoice: InvoicePayment | null | undefined): { amount: number, currency: string } | null {
  if (!invoice || invoice.status !== 'paid' || typeof invoice.amount_paid !== 'number' || invoice.amount_paid < 0 || !invoice.currency)
    return null
  return { amount: invoice.amount_paid, currency: invoice.currency.toUpperCase() }
}

/** An `incomplete` subscription became active: its first invoice was just paid. */
export function isIncompleteSubscriptionActivation(stripeEvent: Stripe.Event | null | undefined): boolean {
  if (stripeEvent?.type !== 'customer.subscription.updated')
    return false
  const previousStatus = (stripeEvent.data.previous_attributes as Partial<Stripe.Subscription> | undefined)?.status
  return previousStatus === 'incomplete' && stripeEvent.data.object.status === 'active'
}

/**
 * When to report the first payment, or null when this webhook must not.
 * - paid_at went from null to set in this webhook: report at that time.
 * - paid_at was set by an `incomplete` subscription (skipped then, unpaid) and
 *   that subscription is now active: report now. Only for a recent paid_at, so
 *   an org that paid long ago and starts a new subscription is not reported.
 * The event id is per org, so OpenAI drops a second send for the same org.
 */
export function getOpenAIFirstPaymentAt(input: {
  firstPaidAt: string | null
  currentPaidAt: string | null | undefined
  stripeEvent: Stripe.Event | null | undefined
  eventOccurredAtIso: string
  now?: number
}): string | null {
  if (input.firstPaidAt)
    return input.firstPaidAt
  if (!input.currentPaidAt || !isIncompleteSubscriptionActivation(input.stripeEvent))
    return null
  const paidAt = Date.parse(input.currentPaidAt)
  if (!Number.isFinite(paidAt) || (input.now ?? Date.now()) - paidAt > RECOVERY_WINDOW_MS)
    return null
  return input.eventOccurredAtIso
}

function getLatestInvoiceRef(stripeEvent: Stripe.Event | null | undefined): InvoiceRef | null {
  if (!stripeEvent?.type.startsWith('customer.subscription.'))
    return null
  const subscription = stripeEvent.data.object as Stripe.Subscription
  // A Stripe trial's $0 invoice is not a payment.
  if (subscription.status === 'trialing')
    return null
  return subscription.latest_invoice ?? null
}

async function loadInvoicePayment(c: Context, stripeEvent: Stripe.Event | null | undefined, deps: OpenAIFirstPaymentDeps) {
  const ref = getLatestInvoiceRef(stripeEvent)
  if (!ref)
    return null
  try {
    // Always read the live invoice: the event copy can predate the payment.
    return getInvoicePayment(await deps.retrieveInvoice(typeof ref === 'string' ? ref : ref.id))
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'OpenAI Ads subscription: invoice lookup failed', error: serializeError(error) })
    return null
  }
}

/**
 * Report an org's first payment to OpenAI Ads as `subscription_created`.
 * Call when getOpenAIFirstPaymentAt returns a time, from backgroundTask. Sends
 * only with proof of payment (a paid latest invoice). Never throws, so it cannot fail the webhook.
 */
export async function trackOpenAIFirstPayment(c: Context, input: OpenAIFirstPaymentInput, deps: OpenAIFirstPaymentDeps): Promise<boolean> {
  try {
    if (!isOpenAIAdsConfigured(c))
      return false
    const [user, payment] = await Promise.all([
      deps.loadUser(input.ownerUserId),
      loadInvoicePayment(c, input.stripeEvent, deps),
    ])
    if (!payment) {
      // No proof of payment (unpaid, missing or unreadable invoice): never report a conversion that did not happen.
      cloudlog({ requestId: c.get('requestId'), message: 'OpenAI Ads subscription skipped: latest invoice not paid', orgId: input.orgId })
      return false
    }
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
