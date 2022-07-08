import axiod from 'https://deno.land/x/axiod/mod.ts'

const getAuth = () => {
  // get stripe token
  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''
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
  const response = await axiod.post('https://api.stripe.com/v1/billing_portal/sessions', new URLSearchParams({
    customer: customerId,
    return_url: callbackUrl,
  }), getConfig(true))
  return response.data
}

export const createCheckout = async (customerId: string, reccurence: string, planId: string, successUrl: string, cancelUrl: string) => {
  let priceId = null
  try {
    const response = await axiod.get(encodeURI(`https://api.stripe.com/v1/prices/search?query=product:"${planId}"`), getConfig())
    const prices = response.data.data
    prices.forEach((price: any) => {
      if (price.recurring.interval === reccurence && price.active)
        priceId = price.id
    })
  }
  catch (err) {
    console.log('search err', err)
  }
  if (!priceId)
    return Promise.reject(new Error('Cannot find price'))
  const checkoutData = {
    billing_address_collection: 'auto',
    mode: 'subscription',
    customer: customerId,
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  }
  const data = new URLSearchParams(checkoutData as any)
  data.append('line_items[0][price]', priceId)
  data.append('line_items[0][quantity]', '1')
  try {
    const response = await axiod.post('https://api.stripe.com/v1/checkout/sessions', data, getConfig(true))
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
  const response = await axiod.post('https://api.stripe.com/v1/customers', new URLSearchParams({
    email,
  }), config)
  return response.data
}

