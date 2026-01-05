import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import Stripe from 'stripe'
import { cloudlog, cloudlogErr } from './logging.ts'
import { supabaseAdmin } from './supabase.ts'
import { existInEnv, getEnv } from './utils.ts'

export type StripeEnvironment = 'live' | 'test'

export function resolveStripeEnvironment(c: Context): StripeEnvironment {
  const secretKey = getEnv(c, 'STRIPE_SECRET_KEY') || ''
  if (secretKey.startsWith('sk_live'))
    return 'live'
  return 'test'
}

export function getStripe(c: Context) {
  return new Stripe(getEnv(c, 'STRIPE_SECRET_KEY'), {
    apiVersion: '2025-10-29.clover',
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

  // Try to find active subscriptions first
  let activeSubscriptions = await getStripe(c).subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  })

  // If no active subscriptions, check for trialing subscriptions
  if (activeSubscriptions.data.length === 0) {
    activeSubscriptions = await getStripe(c).subscriptions.list({
      customer: customerId,
      status: 'trialing', // Check for trial subscriptions
      limit: 1,
    })
  }

  if (activeSubscriptions.data.length > 0) {
    const activeSub = activeSubscriptions.data[0]
    cloudlog({ requestId: c.get('requestId'), message: 'Found an active or trialing subscription, fetching its data.', activeSubscriptionId: activeSub.id, status: activeSub.status })
    // Fetch data for the newly found active subscription
    return getSubscriptionData(c, customerId, activeSub.id)
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'No other active or trialing subscriptions found for customer.', customerId })
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
    if (!subscriptionData || (subscriptionData.status !== 'active' && subscriptionData.status !== 'trialing')) {
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
      else if (subscriptionData.status === 'active' || subscriptionData.status === 'trialing') {
        // Active and trialing subscriptions are always considered succeeded
        dbStatus = 'succeeded'
      }
    }

    // Update stripe_info table with latest data, even if no subscription exists
    const updateData: any = {
      status: dbStatus,
    }

    // Only include fields if they have valid values to avoid foreign key constraint violations
    if (subscriptionData?.productId) {
      updateData.product_id = subscriptionData.productId
    }
    if (subscriptionData?.subscriptionId) {
      updateData.subscription_id = subscriptionData.subscriptionId
    }
    if (subscriptionData?.cycleStart) {
      updateData.subscription_anchor_start = subscriptionData.cycleStart
    }
    if (subscriptionData?.cycleEnd) {
      updateData.subscription_anchor_end = subscriptionData.cycleEnd
    }

    const { error: updateError } = await supabaseAdmin(c)
      .from('stripe_info')
      .update(updateData)
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

async function getPriceIds(c: Context, planId: string, recurrence: string): Promise<{ priceId: string | null }> {
  let priceId = null
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { priceId }
  try {
    const prices = await getStripe(c).prices.search({
      query: `product:"${planId}"`,
    })
    cloudlog({ requestId: c.get('requestId'), message: 'prices stripe', prices })
    prices.data.forEach((price) => {
      if (price.recurring && price.recurring.interval === recurrence && price.active && price.recurring.usage_type === 'licensed')
        priceId = price.id
    })
  }
  catch (err) {
    cloudlog({ requestId: c.get('requestId'), message: 'search err', error: err })
  }
  return { priceId }
}

export interface MeteredData {
  [key: string]: string
}

export interface StripeData {
  data: Database['public']['Tables']['stripe_info']['Insert']
  isUpgrade: boolean
  previousProductId: string | undefined
}

export function parsePriceIds(c: Context, prices: Stripe.SubscriptionItem[]): { priceId: string | null, productId: string | null } {
  let priceId: string | null = null
  let productId: string | null = null
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { priceId, productId }
  try {
    cloudlog({ requestId: c.get('requestId'), message: 'prices stripe', prices })
    prices.forEach((price) => {
      if (price.plan.usage_type === 'licensed') {
        priceId = price.plan.id
        productId = price.plan.product as string
      }
    })
  }
  catch (err) {
    cloudlog({ requestId: c.get('requestId'), message: 'search err', error: err })
  }
  return { priceId, productId }
}

export async function createCheckout(c: Context, customerId: string, recurrence: string, planId: string, successUrl: string, cancelUrl: string, clientReferenceId?: string, attributionId?: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { url: '' }
  const prices = await getPriceIds(c, planId, recurrence)
  cloudlog({ requestId: c.get('requestId'), message: 'prices', prices })
  if (!prices.priceId)
    return Promise.reject(new Error('Cannot find price'))
  const metadata = attributionId ? { attribution_id: attributionId } : undefined
  const session = await getStripe(c).checkout.sessions.create({
    billing_address_collection: 'auto',
    mode: 'subscription',
    customer: customerId,
    success_url: `${successUrl}?success=true`,
    cancel_url: cancelUrl,
    automatic_tax: { enabled: true },
    client_reference_id: clientReferenceId,
    metadata,
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
    tax_id_collection: { enabled: true },
    line_items: [
      {
        price: prices.priceId,
        quantity: 1,
      },
    ],
  })
  return { url: session.url }
}

async function getOneTimePriceId(c: Context, productId: string): Promise<string | null> {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return null
  try {
    const prices = await getStripe(c).prices.search({
      query: `product:"${productId}" AND active:'true'`,
    })

    for (const price of prices.data) {
      if (price.type === 'one_time' && price.active)
        return price.id
    }
  }
  catch (err) {
    cloudlog({ requestId: c.get('requestId'), message: 'search one-time price error', error: err })
  }
  return null
}

export async function createOneTimeCheckout(
  c: Context,
  customerId: string,
  productId: string,
  quantity: number,
  successUrl: string,
  cancelUrl: string,
  clientReferenceId?: string,
) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { url: '' }

  const priceId = await getOneTimePriceId(c, productId)
  if (!priceId)
    throw new Error(`Cannot find one-time price for product ${productId}`)

  const successUrlWithFlag = successUrl.includes('?') ? `${successUrl}&success=true` : `${successUrl}?success=true`

  const session = await getStripe(c).checkout.sessions.create({
    billing_address_collection: 'auto',
    mode: 'payment',
    customer: customerId,
    success_url: successUrlWithFlag,
    cancel_url: cancelUrl,
    automatic_tax: { enabled: true },
    client_reference_id: clientReferenceId,
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
    tax_id_collection: { enabled: true },
    invoice_creation: { enabled: true },
    line_items: [
      {
        price: priceId,
        quantity,
        adjustable_quantity: {
          enabled: true,
          minimum: 1,
          maximum: 100000,
        },
      },
    ],
    metadata: {
      productId,
      intendedQuantity: String(quantity),
    },
  })
  return { url: session.url }
}

export interface StripeCustomer {
  id: string
  email: string
  name: string
  metadata: {
    user_id: string
    org_id?: string
    console?: string
    log_as?: string
  }
}

export async function createCustomer(c: Context, email: string, userId: string, orgId: string, name: string) {
  cloudlog({ requestId: c.get('requestId'), message: 'createCustomer', email, userId, orgId, name })
  const baseConsoleUrl = (getEnv(c, 'WEBAPP_URL') || '').replace(/\/+$/, '')
  const metadata: Record<string, string> = {
    user_id: userId,
    org_id: orgId,
  }
  if (baseConsoleUrl) {
    metadata.log_as = `${baseConsoleUrl}/log-as/${userId}`
  }
  if (!existInEnv(c, 'STRIPE_SECRET_KEY')) {
    cloudlog({ requestId: c.get('requestId'), message: 'createCustomer no stripe key', email, userId, name })
    // create a fake customer id like stripe one and random id
    const randomId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    return { id: `cus_${randomId}`, email, name, metadata }
  }
  const customer = await getStripe(c).customers.create({
    email,
    name,
    metadata,
  })
  return customer
}

export async function ensureCustomerMetadata(c: Context, customerId: string, orgId: string, userId?: string | null) {
  if (!customerId)
    return
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return

  const baseConsoleUrl = (getEnv(c, 'WEBAPP_URL') || '').replace(/\/+$/, '')
  const metadata: Record<string, string> = {
    org_id: orgId,
  }

  if (userId) {
    metadata.user_id = userId
    if (baseConsoleUrl)
      metadata.log_as = `${baseConsoleUrl}/log-as/${userId}`
  }

  try {
    await getStripe(c).customers.update(customerId, { metadata })
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'ensureCustomerMetadata', error })
  }
}

export async function removeOldSubscription(c: Context, subscriptionId: string) {
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return Promise.resolve()
  cloudlog({ requestId: c.get('requestId'), message: 'removeOldSubscription', id: subscriptionId })
  const deletedSubscription = await getStripe(c).subscriptions.cancel(subscriptionId)
  return deletedSubscription
}
