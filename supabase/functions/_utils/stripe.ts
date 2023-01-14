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

const getPriceId = async (planId: string, reccurence: string): Promise<null | string> => {
  let priceId = null
  try {
    const response = await axios.get(encodeURI(`https://api.stripe.com/v1/prices/search?query=product:"${planId}"`), getConfig())
    const prices = response.data.data
    prices.forEach((price: any) => {
      if (price.recurring.interval === reccurence && price.active)
        priceId = price.id
    })
  }
  catch (err) {
    console.log('search err', err)
  }
  return priceId
}

const getPriceIdMetered = async (planId: string) => {
  const priceIds: string[] = []
  try {
    const response = await axios.get(encodeURI(`https://api.stripe.com/v1/prices/search?query=product:"${planId}"`), getConfig())
    const prices = response.data.data
    prices.forEach((price: any) => {
      if (price.billing_scheme === 'per_unit' && price.active)
        priceIds.push(price.id)
    })
  }
  catch (err) {
    console.log('search err', err)
  }
  return priceIds
}

const getPlanName = async (planId: string) => {
  let planName = null
  try {
    const response = await axios.get(`https://api.stripe.com/v1/products/${planId}`, getConfig())
    planName = response.data.data.name
  }
  catch (err) {
    console.log('search err', err)
  }
  return planName
}

export const createCheckout = async (customerId: string, reccurence: string, planId: string, successUrl: string, cancelUrl: string) => {
  const priceId = await getPriceId(planId, reccurence)
  if (!priceId)
    return Promise.reject(new Error('Cannot find price'))
  const checkoutData = {
    billing_address_collection: 'auto',
    mode: 'subscription',
    customer: customerId,
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    automatic_tax: {
      enabled: true,
    },
  }
  const data = new URLSearchParams(checkoutData as any)
  data.append('line_items[0][price]', priceId)
  data.append('line_items[0][quantity]', '1')
  const planName = await getPlanName(planId)
  if (planName === 'Pay as you go') {
    const meteredPrices = await getPriceIdMetered(planId)
    meteredPrices.forEach((priceId, index) => {
      data.append(`line_items[${index}][price_data][product]`, priceId)
      data.append(`line_items[${index}][recurring][usage_type]`, 'metered')
    })
  }
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
