import type { Context } from '@hono/hono'
import type { MeteredData } from './stripe.ts'
import type { Database } from './supabase.types.ts'
import Stripe from 'stripe'
import { cloudlog, cloudlogErr } from './loggin.ts'
import { getStripe, parsePriceIds } from './stripe.ts'
import { getEnv } from './utils.ts'

export function parseStripeEvent(c: Context, body: string, signature: string) {
  const webhookKey = getEnv(c, 'STRIPE_WEBHOOK_SECRET')

  return getStripe(c).webhooks.constructEventAsync(
    body,
    signature,
    webhookKey,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  )
}

function subscriptionUpdated(c: Context, event: Stripe.CustomerSubscriptionCreatedEvent | Stripe.CustomerSubscriptionDeletedEvent | Stripe.CustomerSubscriptionUpdatedEvent, data: Database['public']['Tables']['stripe_info']['Insert']) {
  let isUpgrade = false
  const subscription = event.data.object
  const previousAttributes = event.data.previous_attributes as Partial<Stripe.Subscription>

  // Get previous items if available
  const previousItems = previousAttributes?.items?.data as Stripe.SubscriptionItem[] | undefined
  const previousProductId = previousItems?.[0]?.plan.product as string | undefined

  const res = parsePriceIds(c, subscription.items.data)
  data.price_id = res.priceId
  if (res.productId)
    data.product_id = res.productId
  // current_period_start is epoch and current_period_end is epoch
  // subscription_anchor_start is date and subscription_anchor_end is date
  // convert epoch to date
  const firstItem = subscription.items.data.length > 0 ? subscription.items.data[0] : null
  data.subscription_anchor_start = firstItem?.current_period_start
    ? new Date(firstItem.current_period_start * 1000).toISOString()
    : undefined
  data.subscription_anchor_end = firstItem?.current_period_end
    ? new Date(firstItem.current_period_end * 1000).toISOString()
    : undefined
  data.subscription_metered = res.meteredData
  data.price_id = subscription.items.data.length ? subscription.items.data[0].plan.id : undefined
  data.product_id = (subscription.items.data.length ? subscription.items.data[0].plan.product : undefined) as string
  if (event.type === 'customer.subscription.deleted') {
    data.status = 'deleted'
  }
  else if (event.type === 'customer.subscription.created') {
    data.status = 'created'
  }
  else {
    data.status = subscription.cancel_at ? 'canceled' : 'updated'
  }
  data.subscription_id = subscription.id
  data.customer_id = String(subscription.customer)

  // Check if this is an upgrade
  if (previousProductId && data.product_id !== previousProductId) {
    isUpgrade = true
  }
  return { data, isUpgrade, previousProductId }
}

function invoiceUpcoming(event: Stripe.InvoiceUpcomingEvent, data: Database['public']['Tables']['stripe_info']['Insert']) {
  const invoice = event.data.object
  data.status = 'updated'
  data.customer_id = String(invoice.customer)

  const plan = invoice.lines.data[0]
  if (plan) {
    if (plan.parent?.subscription_item_details?.subscription) {
      data.subscription_id = plan.parent.subscription_item_details.subscription as string
    }
    if (plan.pricing?.price_details?.product) {
      data.product_id = plan.pricing.price_details.product as string
    }
    if (plan.pricing?.price_details?.price) {
      data.price_id = plan.pricing.price_details.price as string
    }
  }
  return data
}

export function extractDataEvent(c: Context, event: Stripe.Event): { data: Database['public']['Tables']['stripe_info']['Insert'], isUpgrade: boolean, previousProductId: string | undefined } {
  let data: Database['public']['Tables']['stripe_info']['Insert'] = {
    product_id: 'free',
    price_id: '',
    subscription_id: undefined,
    subscription_anchor_start: undefined,
    subscription_anchor_end: undefined,
    subscription_metered: {} as MeteredData,
    customer_id: '',
    is_good_plan: true,
    mau_exceeded: false,
    storage_exceeded: false,
    bandwidth_exceeded: false,
    status: undefined,
  }
  let isUpgrade = false
  let previousProductId: string | undefined

  cloudlog({ requestId: c.get('requestId'), message: 'event', event: JSON.stringify(event, null, 2) })
  if (!event || !event.data || !event.data.object) {
    return { data, isUpgrade, previousProductId }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.created') {
    const res = subscriptionUpdated(c,event, data)
    data = res.data
    isUpgrade = res.isUpgrade
  }
  else if (event.type === 'charge.failed') {
    const charge = event.data.object
    data.status = 'failed'
    data.customer_id = String(charge.customer)
  }
  else if (event.type === 'invoice.upcoming') {
    data = invoiceUpcoming(event, data)
  }
  else {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Other event', event })
  }
  return { data, isUpgrade, previousProductId }
}
