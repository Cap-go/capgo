import type { Context } from '@hono/hono'
import Stripe from 'stripe'
import { existInEnv, getEnv } from './utils.ts'

export function getStripe(c: Context) {
  return new Stripe(getEnv(c, 'STRIPE_SECRET_KEY'), {
    apiVersion: '2024-10-28.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })
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
        meteredData[price.plan.nickname.toLocaleLowerCase()] = price.plan.id
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
  if (!existInEnv(c, 'STRIPE_SECRET_KEY'))
    return { id: '', email, name, metadata: { user_id: userId } }
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
