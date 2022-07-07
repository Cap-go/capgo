import Stripe from 'https://esm.sh/stripe@9.11.0?no-check&target=deno'
import type { definitions } from './types_supabase.ts'

export const parseStripeEvent = async (body: string, signature: string) => {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY') || ''
  const webhookKey = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
  const stripe = new Stripe(secretKey, {
    apiVersion: '2020-08-27',
    httpClient: Stripe.createFetchHttpClient(),
  })
  let receivedEvent
  try {
    receivedEvent = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookKey,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    )
  }
  catch (err) {
    console.log('Error parsing event', err)
    return new Response(err.message, { status: 400 })
  }
  return receivedEvent
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
