import Stripe from 'stripe'
import type { Context } from '@hono/hono'
import { parsePriceIds } from './stripe.ts'
import { getEnv } from './utils.ts'
import type { MeteredData } from './stripe.ts'
import type { Database } from './supabase.types.ts'

export function parseStripeEvent(c: Context, body: string, signature: string) {
  const secretKey = getEnv(c, 'STRIPE_SECRET_KEY')
  const webhookKey = getEnv(c, 'STRIPE_WEBHOOK_SECRET')
  const stripe = new Stripe(secretKey, {
    apiVersion: '2024-04-10',
    httpClient: Stripe.createFetchHttpClient(),
  })

  return stripe.webhooks.constructEventAsync(
    body,
    signature,
    webhookKey,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  )
}

export function extractDataEvent(event: Stripe.Event): Database['public']['Tables']['stripe_info']['Insert'] {
  const data: Database['public']['Tables']['stripe_info']['Insert'] = {
    product_id: 'free',
    price_id: '',
    subscription_id: undefined,
    subscription_anchor_start: undefined,
    subscription_anchor_end: undefined,
    subscription_metered: {} as MeteredData,
    customer_id: '',
    is_good_plan: true,
    status: undefined,
  }

  console.log(c.get('requestId'), 'event', JSON.stringify(event, null, 2))
  if (event && event.data && event.data.object) {
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object
      const res = parsePriceIds(subscription.items.data)
      data.price_id = res.priceId
      if (res.productId)
        data.product_id = res.productId
      // current_period_start is epoch and current_period_end is epoch
      // subscription_anchor_start is date and subscription_anchor_end is date
      // convert epoch to date
      data.subscription_anchor_start = new Date(subscription.current_period_start * 1000).toISOString()
      data.subscription_anchor_end = new Date(subscription.current_period_end * 1000).toISOString()
      data.subscription_metered = res.meteredData
      data.price_id = subscription.items.data.length ? subscription.items.data[0].plan.id : undefined
      data.product_id = (subscription.items.data.length ? subscription.items.data[0].plan.product : undefined) as string
      data.status = subscription.cancel_at ? 'canceled' : 'updated'
      data.subscription_id = subscription.id
      data.customer_id = String(subscription.customer)
    }
    else if (event.type === 'customer.subscription.deleted') {
      const charge = event.data.object
      data.status = 'canceled'
      data.customer_id = String(charge.customer)
      data.subscription_id = charge.id
    }
    else {
      console.error(c.get('requestId'), 'Other event', event.type, event)
    }
  }
  return data
}
