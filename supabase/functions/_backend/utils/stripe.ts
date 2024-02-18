import ky from 'ky'

import type { Context } from 'hono'
import { getEnv } from './utils.ts'

function getAuth(c: Context) {
  // get stripe token
  const STRIPE_SECRET_KEY = getEnv(c, 'STRIPE_SECRET_KEY') || ''
  const STRIPE_TOKEN = `${STRIPE_SECRET_KEY}:`
  // encode b64
  const STRIPE_TOKEN_B64 = btoa(STRIPE_TOKEN)
  return `Basic ${STRIPE_TOKEN_B64}`
}
function getConfigHeaders(c: Context, form = false) {
  return {
    authorization: getAuth(c),
    ...(form && { 'content-type': 'application/x-www-form-urlencoded' }),
  }
}

export async function createPortal(c: Context, customerId: string, callbackUrl: string) {
  const config = getConfigHeaders(c, true)
  const data = new URLSearchParams({
    customer: customerId,
    return_url: callbackUrl,
  })
  const response = await ky.post('https://api.stripe.com/v1/billing_portal/sessions', { body: data, headers: config })
  return response.json()
}

async function getPriceIds(c: Context, planId: string, reccurence: string): Promise<{ priceId: string | null, meteredIds: string[] }> {
  const config = getConfigHeaders(c, true)
  let priceId = null
  const meteredIds: string[] = []
  try {
    const response = await ky.get(encodeURI(`https://api.stripe.com/v1/prices/search?query=product:"${planId}"`), { headers: config })
    const data = await response.json<any>()
    const prices = data.data
    console.log('prices stripe', prices)
    prices.forEach((price: any) => {
      if (price.recurring.interval === reccurence && price.active && price.recurring.usage_type === 'licensed')
        priceId = price.id
      if (price.billing_scheme === 'per_unit' && price.active && price?.recurring?.usage_type !== 'licensed')
        meteredIds.push(price.id)
    })
  }
  catch (err) {
    console.log('search err', err)
  }
  return { priceId, meteredIds }
}
export interface MeteredData {
  [key: string]: string
}

export function parsePriceIds(prices: any): { priceId: string | null, productId: string | null, meteredData: MeteredData } {
  let priceId: string | null = null
  let productId: string | null = null
  const meteredData: { [key: string]: string } = {}
  try {
    console.log('prices stripe', prices)
    prices.forEach((price: any) => {
      if (price.plan.usage_type === 'licensed') {
        priceId = price.plan.id
        productId = price.plan.product
      }
      if (price.plan.billing_scheme === 'per_unit' && price?.plan?.usage_type !== 'licensed') {
        meteredData[price.plan.nickname.toLocaleLowerCase()] = price.plan.id
        console.log('metered price', price)
      }
    })
  }
  catch (err) {
    console.log('search err', err)
  }
  return { priceId, productId, meteredData }
}

export async function createCheckout(c: Context, customerId: string, reccurence: string, planId: string, successUrl: string, cancelUrl: string, clientReferenceId?: string) {
  const config = getConfigHeaders(c, true)
  const prices = await getPriceIds(c, planId, reccurence)
  console.log('prices', prices)
  if (!prices.priceId)
    return Promise.reject(new Error('Cannot find price'))
  const checkoutData = {
    billing_address_collection: 'auto',
    mode: 'subscription',
    customer: customerId,
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  }
  const data = new URLSearchParams(checkoutData as any)
  data.append('automatic_tax[enabled]', 'true')
  if (clientReferenceId)
    data.append('client_reference_id', clientReferenceId)
  data.append('billing_address_collection', 'auto')
  data.append('customer_update[address]', 'auto')
  data.append('customer_update[name]', 'auto')
  data.append('tax_id_collection[enabled]', 'true')
  data.append('line_items[0][price]', prices.priceId)
  data.append('line_items[0][quantity]', '1')
  prices.meteredIds.forEach((priceId, index) => {
    data.append(`line_items[${index + 1}][price]`, priceId)
  })
  console.log('data', data.toString())
  const response = await ky.post('https://api.stripe.com/v1/checkout/sessions', { body: data, headers: config })
  return response.json()
}

export async function createCustomer(c: Context, email: string, userId: string, name: string) {
  const config = getConfigHeaders(c, true)
  const customerData = {
    email,
    name,
  }
  const data = new URLSearchParams(customerData as any)
  data.append('metadata[user_id]', userId)
  const response = await ky.post('https://api.stripe.com/v1/customers', { body: data, headers: config })
  return response.json()
}

export async function setTreshold(c: Context, subscriptionId: string) {
  // set treshold to 5000 USD
  const config = getConfigHeaders(c, true)
  const checkoutData = {
    billing_thresholds: {
      amount_gte: 5000,
      reset_billing_cycle_anchor: false,
    },
  }
  const data = new URLSearchParams(checkoutData as any)
  const response = await ky.post(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, { body: data, headers: config })
  return response.json()
}

export async function setBillingPeriod(c: Context, subscriptionId: string) {
  const config = getConfigHeaders(c, true)
  const checkoutData = {
    billing_cycle_anchor: 'now',
    proration_behavior: 'create_prorations',
  }
  const data = new URLSearchParams(checkoutData as any)
  const response = await ky.post(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, { body: data, headers: config })
  return response.json()
}

export async function updateCustomer(c: Context, customerId: string, email: string, billing_email: string | null | undefined, userId: string, name: string) {
  const config = getConfigHeaders(c, true)
  const customerData = {
    email: billing_email || email,
    name,
  }
  const data = new URLSearchParams(customerData as any)
  data.append('metadata[user_id]', userId)
  data.append('metadata[email]', email)
  const response = await ky.post(`https://api.stripe.com/v1/customers/${customerId}`, { body: data, headers: config })
  return response.json()
}

export async function recordUsage(c: Context, subscriptionId: string, quantity: number) {
  const config = getConfigHeaders(c, true)
  const checkoutData = {
    quantity,
    action: 'set',
  }
  const data = new URLSearchParams(checkoutData as any)
  const response = await ky.post(`https://api.stripe.com/v1/subscription_items/${subscriptionId}/usage_records`, { body: data, headers: config })
  return response.json()
}

export async function removeOldSubscription(c: Context, subscriptionId: string) {
  const config = getConfigHeaders(c, true)
  console.log('removeOldSubscription', subscriptionId)
  const response = await ky.delete(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, { headers: config })
  return response.json()
}
