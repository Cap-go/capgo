import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import Stripe from 'stripe'
import { cloudlog, cloudlogErr } from './loggin.ts'
import { supabaseAdmin } from './supabase.ts'
import { existInEnv, getEnv } from './utils.ts'

export function getStripe(c: Context) {
  return new Stripe(getEnv(c, 'STRIPE_SECRET_KEY'), {
    apiVersion: '2025-05-28.basil',
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function getSubscriptionData(c: Context, customerId: string, subscriptionId: string | null) {
  if (!subscriptionId)
    return null
  try {
    cloudlog({ requestId: c.get('requestId'), message: 'Fetching subscription data', customerId, subscriptionId })

    // Retrieve the specific subscription from Stripe
    const subscription = await getStripe(c).subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'], // Correct expand path for retrieve
    })

    cloudlog({
      requestId: c.get('requestId'),
      context: 'getSubscriptionData',
      // subscriptionsFound: subscriptions.data.length, // Removed - retrieve returns one or throws
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    })

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
        cloudlog({ requestId: c.get('requestId'), message: 'Price or product data missing/invalid type in subscription item', itemId: item.id })
      }
    }

    // subscription.billing_cycle_anchor - Not used, using current period from item
    // Format dates from epoch to ISO string
    // Access cycle dates from the first item
    const firstItem = subscription.items.data.length > 0 ? subscription.items.data[0] : null

    const cycleStart = firstItem?.current_period_start
      ? new Date(firstItem.current_period_start * 1000).toISOString()
      : null

    const cycleEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000).toISOString()
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
      cloudlog({ requestId: c.get('requestId'), message: 'Subscription not found', subscriptionId, error: error.code })
    }
    else {
      cloudlogErr({ requestId: c.get('requestId'), message: 'getSubscriptionData', error })
    }
    return null
  }
}

async function getActiveSubscription(c: Context, customerId: string, subscriptionId: string | null) {
  cloudlog({ requestId: c.get('requestId'), message: 'Stored subscription not active or not found, checking for others.', customerId, storedSubscriptionId: subscriptionId })
  const activeSubscriptions = await getStripe(c).subscriptions.list({
    customer: customerId,
    status: 'active', // Look specifically for active subscriptions
    limit: 1, // We only need one to confirm activity
  })

  if (activeSubscriptions.data.length > 0) {
    const activeSub = activeSubscriptions.data[0]
    cloudlog({ requestId: c.get('requestId'), message: 'Found an active subscription, fetching its data.', activeSubscriptionId: activeSub.id })
    // Fetch data for the newly found active subscription
    return getSubscriptionData(c, customerId, activeSub.id)
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'No other active subscriptions found for customer.', customerId })
    // Keep subscriptionData as null or the inactive one, it will be handled below
  }
  return null
}

export async function syncSubscriptionData(c: Context, customerId: string, subscriptionId: string | null): Promise<void> {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return
  try {
    // Get subscription data from Stripe using the ID stored in our DB
    let subscriptionData = await getSubscriptionData(c, customerId, subscriptionId)

    // If the stored subscription is not active or doesn't exist, check for any other active subscriptions
    if (!subscriptionData || (subscriptionData.status !== 'active')) {
      subscriptionData = await getActiveSubscription(c, customerId, subscriptionId)
    }

    let dbStatus: 'succeeded' | 'canceled' | undefined = 'canceled'

    if (subscriptionData) {
      // Determine DB status based on the potentially updated subscription data
      if (subscriptionData.status === 'canceled') {
        // Only apply 'active until period end' logic if Stripe status is 'canceled'
        if (subscriptionData.cycleEnd && new Date(subscriptionData.cycleEnd) > new Date()) {
          dbStatus = 'succeeded' // Still active until period end because cycleEnd is future
        }
      }
      else if (subscriptionData.status === 'active') {
        // Active subscriptions are always considered succeeded
        dbStatus = 'succeeded'
      }
    }

    // Update stripe_info table with latest data, even if no subscription exists
    const { error: updateError } = await supabaseAdmin(c)
      .from('stripe_info')
      .update({
        product_id: subscriptionData?.productId ?? undefined,
        subscription_id: subscriptionData?.subscriptionId ?? undefined,
        subscription_anchor_start: subscriptionData?.cycleStart ?? undefined,
        subscription_anchor_end: subscriptionData?.cycleEnd ?? undefined,
        status: dbStatus,
      })
      .eq('customer_id', customerId)

    if (updateError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'syncSubscriptionData', error: updateError })
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'syncSubscriptionData', error })
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'cancelSubscription', error: err })
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
    cloudlog({ requestId: c.get('requestId'), message: 'prices stripe', prices })
    prices.data.forEach((price) => {
      if (price.recurring && price.recurring.interval === reccurence && price.active && price.recurring.usage_type === 'licensed')
        priceId = price.id
      if (price.billing_scheme === 'per_unit' && price.active && price?.recurring?.usage_type !== 'licensed')
        meteredIds.push(price.id)
    })
  }
  catch (err) {
    cloudlog({ requestId: c.get('requestId'), message: 'search err', error: err })
  }
  return { priceId, meteredIds }
}

export interface MeteredData {
  [key: string]: string
}

export interface StripeData {
  data: Database['public']['Tables']['stripe_info']['Insert']
  isUpgrade: boolean
  previousProductId: string | undefined
}

export function parsePriceIds(c: Context, prices: Stripe.SubscriptionItem[]): { priceId: string | null, productId: string | null, meteredData: MeteredData } {
  let priceId: string | null = null
  let productId: string | null = null
  const meteredData: { [key: string]: string } = {}
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { priceId, productId, meteredData }
  try {
    cloudlog({ requestId: c.get('requestId'), message: 'prices stripe', prices })
    prices.forEach((price) => {
      if (price.plan.usage_type === 'licensed') {
        priceId = price.plan.id
        productId = price.plan.product as string
      }
      if (price.plan.billing_scheme === 'per_unit' && price?.plan?.usage_type !== 'licensed' && price.plan.nickname) {
        meteredData[price.plan.nickname.toLowerCase()] = price.plan.id
        cloudlog({ requestId: c.get('requestId'), message: 'metered price', price })
      }
    })
  }
  catch (err) {
    cloudlog({ requestId: c.get('requestId'), message: 'search err', error: err })
  }
  return { priceId, productId, meteredData }
}

export async function createCheckout(c: Context, customerId: string, reccurence: string, planId: string, successUrl: string, cancelUrl: string, clientReferenceId?: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { url: '' }
  const prices = await getPriceIds(c, planId, reccurence)
  cloudlog({ requestId: c.get('requestId'), message: 'prices', prices })
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
  cloudlog({ requestId: c.get('requestId'), message: 'createCustomer', email, userId, name })
  if (!existInEnv(c, 'STRIPE_SECRET_KEY')) {
    cloudlog({ requestId: c.get('requestId'), message: 'createCustomer no stripe key', email, userId, name })
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
  } as any) // Use type assertion to bypass linter error
  return subscription
}

export async function updateCustomer(c: Context, customerId: string, email: string, billing_email: string | null | undefined, userId: string, name: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  const customer = await getStripe(c).customers.update(customerId, {
    email: billing_email ?? email,
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
  const usageRecord = await (getStripe(c).subscriptionItems as any).createUsageRecord(subscriptionItemId, { // Use type assertion to bypass linter error
    quantity,
    action: 'set',
  })
  return usageRecord
}

export async function removeOldSubscription(c: Context, subscriptionId: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  cloudlog({ requestId: c.get('requestId'), message: 'removeOldSubscription', id: subscriptionId })
  const deletedSubscription = await getStripe(c).subscriptions.cancel(subscriptionId)
  return deletedSubscription
}
