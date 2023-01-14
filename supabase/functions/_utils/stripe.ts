import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { getEnv } from './utils.ts'

const getAuth = () => {
  // get stripe token
  const STRIPE_SECRET_KEY = getEnv('STRIPE_SECRET_KEY') || ''
  const STRIPE_TOKEN = `${STRIPE_SECRET_KEY}:`
  // encode b64
  const STRIPE_TOKEN_B64 = btoa(STRIPE_TOKEN)
  return `Basic ${STRIPE_TOKEN_B64}`
}
const getConfig = (form = false) => ({
  headers: {
    authorization: getAuth(),
    ...(form && { 'content-type': 'application/x-www-form-urlencoded' }),
  },
})

export const createPortal = async (customerId: string, callbackUrl: string) => {
  const response = await axios.post('https://api.stripe.com/v1/billing_portal/sessions', new URLSearchParams({
    customer: customerId,
    return_url: callbackUrl,
  }), getConfig(true))
  return response.data
}

const getPriceIds = async (planId: string, reccurence: string): Promise<{ priceId: string | null; meteredIds: string[] }> => {
  let priceId = null
  const meteredIds: string[] = []
  try {
    const response = await axios.get(encodeURI(`https://api.stripe.com/v1/prices/search?query=product:"${planId}"`), getConfig())
    const prices = response.data.data
    console.log('prices stripe', prices)
    prices.forEach((price: any) => {
      if (price.recurring.interval === reccurence && price.active && price.recurring.usage_type === 'licensed')
        priceId = price.id
      if (price.billing_scheme === 'per_unit' && price.active)
        meteredIds.push(price.id)
    })
  }
  catch (err) {
    console.log('search err', err)
  }
  return { priceId, meteredIds }
}

export const createCheckout = async (customerId: string, reccurence: string, planId: string, successUrl: string, cancelUrl: string) => {
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
  data.append('billing_address_collection', 'auto')
  data.append('customer_update[address]', 'auto')
  data.append('customer_update[name]', 'auto')
  data.append('tax_id_collection[enabled]', 'true')
  data.append('line_items[0][price]', prices.priceId)
  data.append('line_items[0][quantity]', '1')
  console.log('data', data)
  // prices.meteredIds.forEach((priceId, index) => {
  //   data.append(`line_items[${index + 1}][price_data][product]`, priceId)
  //   data.append(`line_items[${index + 1}][price_data][currency]`, 'USD')
  //   data.append(`line_items[${index + 1}][price_data][recurring][usage_type]`, 'metered')
  //   data.append(`line_items[${index + 1}][price_data][recurring][interval]`, 'month')
  //   data.append(`line_items[${index + 1}][price_data][recurring][interval_count]`, '1')
  // })
  try {
    const response = await axios.post('https://api.stripe.com/v1/checkout/sessions', data, getConfig(true))
    return response.data
  }
  catch (err2) {
    console.log('create customer err', err2)
    return null
  }
}

export const createCustomer = async (email: string) => {
  const config = getConfig(true)
  console.log('config', config)
  const response = await axios.post('https://api.stripe.com/v1/customers', new URLSearchParams({
    email,
  }), config)
  return response.data
}

// curl https://api.stripe.com/v1/subscription_items/si_NANKnNjWuOYtw4/usage_records \
//   -u sk_test_51K1SWEGH46eYKnWwlgifxLXnfrMnHjI66LujEcqSfBWjDAEc7r9mA7IV2STq2IrcN0eGCFJNkLIREeHAwqRSXSmx00K8bmp3dO: \
//   -d quantity=100 \
//   -d timestamp=1571252444

export const recordUsage = async (subscriptionId: string, quantity: number) => {
  const config = getConfig(true)
  console.log('config', config)
  const checkoutData = {
    quantity,
    action: 'set',
  }
  const data = new URLSearchParams(checkoutData as any)
  const response = await axios.post(`https://api.stripe.com/v1/subscription_items/${subscriptionId}/usage_records`, data, config)
  return response.data
}

export const removeOldSubscription = async (subscriptionId: string) => {
  const config = getConfig(true)
  console.log('removeOldSubscription', subscriptionId)
  const response = await axios.delete(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, undefined, config)
  return response.data
}
