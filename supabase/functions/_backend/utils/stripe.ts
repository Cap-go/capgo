import type { Context } from '@hono/hono'
import Stripe from 'stripe'
import { supabaseAdmin } from './supabase.ts'
import { existInEnv, getEnv } from './utils.ts'

export function getStripe(c: Context) {
  return new Stripe(getEnv(c, 'STRIPE_SECRET_KEY'), {
    apiVersion: '2025-02-24.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function getSubscriptionData(c: Context, customerId: string, subscriptionId: string) {
  try {
    console.log({ requestId: c.get('requestId'), context: 'getSubscriptionData', message: 'Fetching subscription data', customerId, subscriptionId })

    // Retrieve the specific subscription from Stripe
    const subscription = await getStripe(c).subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'], // Correct expand path for retrieve
    })

    console.log({
      requestId: c.get('requestId'),
      context: 'getSubscriptionData',
      // subscriptionsFound: subscriptions.data.length, // Removed - retrieve returns one or throws
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    })

    // // If no subscriptions found - Removed: retrieve throws error if not found
    // if (!subscriptions.data.length) {
    //   console.log({ requestId: c.get('requestId'), context: 'getSubscriptionData', message: 'No active subscriptions found for customer' })
    //   return null
    // }

    // // Get the subscription - Removed: already have the subscription object
    // const subscription = subscriptions.data[0]

    // Extract product ID from the first subscription item
    let productId = null
    if (subscription.items.data.length > 0) {
      const item = subscription.items.data[0]
      // Ensure price and product are objects before accessing properties
      if (typeof item.price === 'object' && item.price !== null && typeof item.price.product === 'string') {
        productId = item.price.product
      }
      else {
        console.warn({ requestId: c.get('requestId'), context: 'getSubscriptionData', message: 'Price or product data missing/invalid type in subscription item', itemId: item.id })
      }
    }

    // Format dates from epoch to ISO string
    const cycleStart = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : null

    const cycleEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null

    return {
      productId,
      status: subscription.status,
      cycleStart,
      cycleEnd,
      subscriptionId: subscription.id,
      cancel_at_period_end: subscription.cancel_at_period_end,
    }
  }
  catch (error) {
    // Handle specific Stripe errors if needed, e.g., resource_missing
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') {
      console.log({ requestId: c.get('requestId'), context: 'getSubscriptionData', message: 'Subscription not found', subscriptionId, error: error.code })
    }
    else {
      console.error({ requestId: c.get('requestId'), context: 'getSubscriptionData', error })
    }
    return null
  }
}

export async function syncSubscriptionData(c: Context, customerId: string, subscriptionId: string): Promise<void> {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return
  try {
    // Get subscription data from Stripe
    const subscriptionData = await getSubscriptionData(c, customerId, subscriptionId)

    let dbStatus: 'succeeded' | 'canceled' | undefined

    if (subscriptionData) {
      if (subscriptionData.status === 'canceled') {
        // Only apply 'active until period end' logic if Stripe status is 'canceled'
        if (subscriptionData.cycleEnd && new Date(subscriptionData.cycleEnd) > new Date()) {
          dbStatus = 'succeeded' // Still active until period end because cycleEnd is future
        }
        else {
          dbStatus = 'canceled' // Truly canceled because cycleEnd is past or null
        }
      }
      else if (subscriptionData.status === 'active') {
        // Active subscriptions are always considered succeeded
        dbStatus = 'succeeded'
      }
      else {
        // All other statuses (past_due, unpaid, incomplete, incomplete_expired) are considered canceled immediately
        dbStatus = 'canceled'
      }
    }
    else {
      // No active subscription found in Stripe
      dbStatus = 'canceled'
    }

    // Update stripe_info table with latest data, even if no subscription exists
    const { error: updateError } = await supabaseAdmin(c)
      .from('stripe_info')
      .update({
        product_id: subscriptionData?.productId || undefined,
        subscription_id: subscriptionData?.subscriptionId || undefined,
        subscription_anchor_start: subscriptionData?.cycleStart || undefined,
        subscription_anchor_end: subscriptionData?.cycleEnd || undefined,
        status: dbStatus,
      })
      .eq('customer_id', customerId)

    if (updateError) {
      console.error({ requestId: c.get('requestId'), context: 'syncSubscriptionData', error: updateError })
    }
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'syncSubscriptionData', error })
  }
}

export async function createPortal(c: Context, customerId: string, callbackUrl: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { url: '' }
  const session = await getStripe(c).billingPortal.sessions.create({
    customer: customerId,
    return_url: callbackUrl,
  })
  return { url: session.url }
}

export function updateCustomerEmail(c: Context, customerId: string, newEmail: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  return getStripe(c).customers.update(customerId, { email: newEmail, name: newEmail, metadata: { email: newEmail } },
  )
}

export async function cancelSubscription(c: Context, customerId: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  const allSubscriptions = await getStripe(c).subscriptions.list({
    customer: customerId,
  })
  return Promise.all(
    allSubscriptions.data.map(sub => getStripe(c).subscriptions.cancel(sub.id)),
  ).catch((err) => {
    console.error({ requestId: c.get('requestId'), context: 'cancelSubscription', error: err })
  })
}

async function getPriceIds(c: Context, planId: string, reccurence: string): Promise<{ priceId: string | null, meteredIds: string[] }> {
  let priceId = null
  const meteredIds: string[] = []
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { priceId, meteredIds }
  try {
    const prices = await getStripe(c).prices.search({
      query: `product:"${planId}"`,
    })
    console.log({ requestId: c.get('requestId'), context: 'prices stripe', prices })
    prices.data.forEach((price) => {
      if (price.recurring && price.recurring.interval === reccurence && price.active && price.recurring.usage_type === 'licensed')
        priceId = price.id
      if (price.billing_scheme === 'per_unit' && price.active && price?.recurring?.usage_type !== 'licensed')
        meteredIds.push(price.id)
    })
  }
  catch (err) {
    console.log({ requestId: c.get('requestId'), context: 'search err', error: err })
  }
  return { priceId, meteredIds }
}

export interface MeteredData {
  [key: string]: string
}

export function parsePriceIds(c: Context, prices: Stripe.SubscriptionItem[]): { priceId: string | null, productId: string | null, meteredData: MeteredData } {
  let priceId: string | null = null
  let productId: string | null = null
  const meteredData: { [key: string]: string } = {}
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { priceId, productId, meteredData }
  try {
    console.log({ requestId: c.get('requestId'), context: 'prices stripe', prices })
    prices.forEach((price) => {
      if (price.plan.usage_type === 'licensed') {
        priceId = price.plan.id
        productId = price.plan.product as string
      }
      if (price.plan.billing_scheme === 'per_unit' && price?.plan?.usage_type !== 'licensed' && price.plan.nickname) {
        meteredData[price.plan.nickname.toLowerCase()] = price.plan.id
        console.log({ requestId: c.get('requestId'), context: 'metered price', price })
      }
    })
  }
  catch (err) {
    console.log({ requestId: c.get('requestId'), context: 'search err', error: err })
  }
  return { priceId, productId, meteredData }
}

export async function createCheckout(c: Context, customerId: string, reccurence: string, planId: string, successUrl: string, cancelUrl: string, clientReferenceId?: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { url: '' }
  const prices = await getPriceIds(c, planId, reccurence)
  console.log({ requestId: c.get('requestId'), context: 'prices', prices })
  if (!prices.priceId)
    return Promise.reject(new Error('Cannot find price'))
  const session = await getStripe(c).checkout.sessions.create({
    billing_address_collection: 'auto',
    mode: 'subscription',
    customer: customerId,
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    automatic_tax: { enabled: true },
    client_reference_id: clientReferenceId,
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
    tax_id_collection: { enabled: true },
    // TODO: find why this is not working as expected
    // saved_payment_method_options: {
    //   allow_redisplay_filters: 'always',
    //   payment_method_save: true,
    // },
    line_items: [
      {
        price: prices.priceId,
        quantity: 1,
      },
      ...prices.meteredIds.map(priceId => ({
        price: priceId,
      })),
    ],
  })
  return { url: session.url }
}

export interface StripeCustomer {
  id: string
  email: string
  name: string
  metadata: {
    user_id: string
  }
}

export async function createCustomer(c: Context, email: string, userId: string, name: string) {
  console.log({ requestId: c.get('requestId'), context: 'createCustomer', email, userId, name })
  if (!existInEnv(c, 'STRIPE_SECRET_KEY')) {
    console.log({ requestId: c.get('requestId'), context: 'createCustomer no stripe key', email, userId, name })
    // create a fake customer id like stripe one and random id
    const randomId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    return { id: `cus_${randomId}`, email, name, metadata: { user_id: userId } }
  }
  const customer = await getStripe(c).customers.create({
    email,
    name,
    metadata: {
      user_id: userId,
    },
  })
  return customer
}

export async function setThreshold(c: Context, subscriptionId: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  const subscription = await getStripe(c).subscriptions.update(subscriptionId, {
    billing_thresholds: {
      amount_gte: 5000,
      reset_billing_cycle_anchor: false,
    },
  })
  return subscription
}

export async function setBillingPeriod(c: Context, subscriptionId: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  const subscription = await getStripe(c).subscriptions.update(subscriptionId, {
    billing_cycle_anchor: 'now',
    proration_behavior: 'create_prorations',
  })
  return subscription
}

export async function updateCustomer(c: Context, customerId: string, email: string, billing_email: string | null | undefined, userId: string, name: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  const customer = await getStripe(c).customers.update(customerId, {
    email: billing_email || email,
    name,
    metadata: {
      user_id: userId,
      email,
    },
  })
  return customer
}

export async function recordUsage(c: Context, subscriptionItemId: string, quantity: number) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  const usageRecord = await getStripe(c).subscriptionItems.createUsageRecord(subscriptionItemId, {
    quantity,
    action: 'set',
  })
  return usageRecord
}

export async function removeOldSubscription(c: Context, subscriptionId: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  console.log({ requestId: c.get('requestId'), context: 'removeOldSubscription', id: subscriptionId })
  const deletedSubscription = await getStripe(c).subscriptions.cancel(subscriptionId)
  return deletedSubscription
}
