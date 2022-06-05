import dayjs from 'https://cdn.skypack.dev/dayjs'
import Stripe from 'https://esm.sh/stripe@9.1.0?no-check&target=deno'
import type { definitions } from './types_supabase.ts'

export const parseStripeEvent = async(key: string, body: string, signature: string, secret: string) => {
  const stripe = new Stripe(key, {
    apiVersion: '2020-08-27',
    httpClient: Stripe.createFetchHttpClient(),
  })
  const event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, Stripe.createSubtleCryptoProvider())
  return event
}

export const createPortal = async(key: string, customerId: string, callbackUrl: string) => {
  const stripe = new Stripe(key, {
    apiVersion: '2020-08-27',
    httpClient: Stripe.createFetchHttpClient(),
  })
  const link = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: callbackUrl,
  })
  return link
}

export const createCheckout = async(key: string, customerId: string, reccurence: string, planId: string, successUrl: string, cancelUrl: string) => {
  const stripe = new Stripe(key, {
    apiVersion: '2020-08-27',
    httpClient: Stripe.createFetchHttpClient(),
  })
  // eslint-disable-next-line no-console
  // console.log('planId', planId)
  let priceId = null
  try {
    const prices = await stripe.prices.search({
      query: `product:'${planId}'`,
    })
    prices.data.forEach((price: any) => {
      // eslint-disable-next-line no-console
      // console.log('price', JSON.stringify(price))
      if (price.recurring.interval === reccurence && price.active)
        priceId = price.id
    })
  }
  catch (err) {
    // eslint-disable-next-line no-console
    console.log('err', err)
  }
  if (!priceId)
    Promise.reject(new Error('Cannot find price'))
  const checkoutData = {
    billing_address_collection: 'auto',
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    mode: 'subscription',
    customer: customerId,
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  }
  // eslint-disable-next-line no-console
  // console.log('checkoutData', checkoutData)
  const session = await stripe.checkout.sessions.create(checkoutData)
  return session
}

export const deleteSub = async(key: string, subscriptionId: string) => {
  const stripe = new Stripe(key, {
    apiVersion: '2020-08-27',
    httpClient: Stripe.createFetchHttpClient(),
  })
  try {
    const res = await stripe.subscriptions.del(subscriptionId)
    return res
  }
  catch (err) {
    return err
  }
}
export const createCustomer = async(key: string, email: string) => {
  const stripe = new Stripe(key, {
    apiVersion: '2020-08-27',
    httpClient: Stripe.createFetchHttpClient(),
  })
  return await stripe.customers.create({
    email,
  })
}

export const extractDataEvent = (event: any): definitions['stripe_info'] => {
  const data: definitions['stripe_info'] = {
    product_id: undefined,
    subscription_id: undefined,
    customer_id: '',
    updated_at: dayjs().toISOString(),
    trial_at: dayjs().toISOString(),
    created_at: dayjs().toISOString(),
    status: undefined,
  }
  // eslint-disable-next-line no-console
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
