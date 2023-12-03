import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { getEnv } from './utils.ts'

function getAuth() {
  // get LEMON token
  const LEMON_API_KEY = getEnv('LEMON_API_KEY') || ''
  return `Bearer ${LEMON_API_KEY}`
}
function getConfig(form = false) {
  return {
    headers: {
      authorization: getAuth(),
      ...(form && { 'content-type': 'application/vnd.api+json' }),
    },
  }
}

export async function createPortal(customerId: string, callbackUrl: string) {
  const response = await axios.post('https://api.stripe.com/v1/billing_portal/sessions', new URLSearchParams({
    customer: customerId,
    return_url: callbackUrl,
  }), getConfig(true))
  return response.data
}

async function getPriceIds(planId: string, reccurence: string): Promise<{ priceId: string | null; meteredIds: string[] }> {
  let priceId = null
  const meteredIds: string[] = []
  try {
    const response = await axios.get(encodeURI(`https://api.stripe.com/v1/prices/search?query=product:"${planId}"`), getConfig())
    const prices = response.data.data
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

export function parsePriceIds(prices: any): { priceId: string | null; productId: string | null; meteredData: MeteredData } {
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

export async function createCheckout(customerId: string, reccurence: string, planId: string, successUrl: string, cancelUrl: string, clientReferenceId?: string) {
  const prices = await getPriceIds(planId, reccurence)
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
  try {
    const response = await axios.post('https://api.stripe.com/v1/checkout/sessions', data, getConfig(true))
    return response.data
  }
  catch (err2) {
    console.log('create customer err', err2)
    return null
  }
}

export async function createCustomer(email: string, userId: string, name: string) {
  const config = getConfig(true)
  const customerData = {
    data: {
        type: "customers",
        attributes: {
            name: name,
            email: email
        }
    }
  }
  const data = new URLSearchParams(customerData as any)
  const response = await axios.post('https://api.lemonsqueezy.com/v1/customers', data, config)
  return response.data
}

export async function setTreshold(subscriptionId: string) {
  // set treshold to 5000 USD
  const config = getConfig(true)
  const checkoutData = {
    billing_thresholds: {
      amount_gte: 5000,
      reset_billing_cycle_anchor: false,
    },
  }
  const data = new URLSearchParams(checkoutData as any)
  const response = await axios.post(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, data, config)
  return response.data
}

export async function setBillingPeriod(subscriptionId: string) {
  const config = getConfig(true)
  const checkoutData = {
    billing_cycle_anchor: 'now',
    proration_behavior: 'create_prorations',
  }
  const data = new URLSearchParams(checkoutData as any)
  const response = await axios.post(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, data, config)
  return response.data
}

export async function updateCustomer(customerId: string, email: string, billing_email: string | null | undefined, userId: string, name: string) {
  const config = getConfig(true)
  const customerData = {
    data: {
        type: "customers",
        attributes: {
            name: name,
            email: billing_email || email
        }
    }
  }
  const data = new URLSearchParams(customerData as any)
  const response = await axios.patch(`https://api.lemonsqueezy.com/v1/customers/${customerId}`, data, config)
  return response.data
}

export async function recordUsage(subscriptionId: string, quantity: number) {
  const config = getConfig(true)
  const checkoutData = {
    "data": {
        "type": "usage-records",
        "attributes": {
            "quantity": quantity,
            "action": "set"
        },
        "relationships": {
            "subscription-item": {
                "data": {
                "type": "subscription-items",
                "id": subscriptionId
                }
            }
        }
    }
  }
  const data = new URLSearchParams(checkoutData as any)
  const response = await axios.post(`https://api.lemonsqueezy.com/v1/usage-records`, data, config)
  return response.data
}

export async function removeOldSubscription(subscriptionId: string) {
  const config = getConfig(true)
  console.log('removeOldSubscription', subscriptionId)
  const response = await axios.delete(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, undefined, config)
  return response.data
}
