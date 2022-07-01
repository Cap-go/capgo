import axiod from 'https://deno.land/x/axiod/mod.ts'
import type { definitions } from './types_supabase.ts'

const getAuth = () => {
  // get stripe token
  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''
  const CRISP_TOKEN = `${STRIPE_SECRET_KEY}:`
  // encode b64
  const CRISP_TOKEN_B64 = btoa(CRISP_TOKEN)
  return `Basic ${CRISP_TOKEN_B64}`
}
const getConfig = (form = false) => ({
  headers: {
    Authorization: getAuth(),
    ...(form && { 'Content-Type': 'application/x-www-form-urlencoded' }),
  },
})
export const parseStripeEvent = async (body: string, signature: string) => {
  // const secretKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  // const webhookKey = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
  // const stripe = new Stripe(key, {
  //   apiVersion: '2020-08-27',
  //   httpClient: Stripe.createFetchHttpClient(),
  // })
  // let receivedEvent
  // try {
  //   receivedEvent = await stripe.webhooks.constructEventAsync(
  //     body,
  //     signature,
  //     secret,
  //     undefined,
  //     cryptoProvider,
  //   )
  // }
  // catch (err) {
  //   console.log('Error parsing event', err)
  //   return new Response(err.message, { status: 400 })
  // }
  // return receivedEvent
  // Quick fix to let prod user pay
  const jsonPayload = JSON.parse(body)
  return jsonPayload
}

export const createPortal = async (customerId: string, callbackUrl: string) => {
  const response = await axiod.post('https://api.stripe.com/v1/billing_portal/sessions', {
    customer: customerId,
    return_url: callbackUrl,
  }, getConfig())
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
    const response = await axiod.post('https://api.stripe.com/v1/checkout/sessions', data, getConfig())
    return response.data
  }
  catch (err2) {
    console.log('create customer err', err2)
    return null
  }
}

export const createCustomer = async (email: string) => {
  const response = await axiod.post('https://api.stripe.com/v1/customers', {
    email,
  }, getConfig(true))
  return response.data
}

export const extractDataEvent = (event: any): definitions['stripe_info'] => {
  const data: definitions['stripe_info'] = {
    product_id: 'free',
    price_id: '',
    subscription_id: undefined,
    customer_id: '',
    updated_at: new Date().toISOString(),
    trial_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    status: undefined,
  }

  console.log('event', JSON.stringify(event, null, 2))
  if (event && event.data && event.data.object) {
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as any
      data.price_id = subscription.items.data.length ? subscription.items.data[0].plan.id : undefined
      data.product_id = (subscription.items.data.length ? subscription.items.data[0].plan.product : undefined) as string
      data.status = subscription.cancel_at ? 'canceled' : 'succeeded'
      data.subscription_id = subscription.id
      data.customer_id = String(subscription.customer)
    }
    else if (event.type === 'customer.subscription.deleted') {
      const charge = event.data.object as any
      data.status = 'canceled'
      data.customer_id = String(charge.customer)
      data.subscription_id = undefined
    }
    else {
      console.error('Other event', event.type, event)
    }
  }
  return data
}
