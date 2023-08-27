import type { MeteredData } from './stripe.ts'
import { parsePriceIds } from './stripe.ts'
import type { Database } from './supabase.types.ts'
import type { Details } from './types.ts'
import { createHmac } from './utils.ts'

const DEFAULT_TOLERANCE = 300
const EXPECTED_SCHEME = 'v1'

function parseHeader(header: string, scheme: string): Details {
  return header.split(',').reduce(
    (accum, item) => {
      const [kv0, kv1] = item.split('=')
      if (kv0 === 't')
        accum.timestamp = Number(kv1)
      if (kv0 === scheme && kv1)
        accum.signatures.push(kv1)
      return accum
    },
    {
      timestamp: -1,
      signatures: [] as string[],
    } as Details)
}
function scmpCompare(a: string, b: string) {
  const len = a.length
  let result = 0
  for (let i = 0; i < len; ++i)
    result |= (a[i] as any) ^ (b[i] as any)

  return result === 0
}
export function parseStripeEvent(body: string, signature: string) {
  const details = parseHeader(signature, EXPECTED_SCHEME)
  if (!details || details.timestamp === -1)
    throw new Error('Unable to extract timestamp and signatures from header')

  if (!details.signatures.length)
    throw new Error('No signatures found with expected scheme')

  const expectedSignature = createHmac(body, details)
  const signatureFound = !!details.signatures.filter(a => scmpCompare(a, expectedSignature as string)).length

  if (!signatureFound)
    throw new Error('No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe? https://github.com/stripe/stripe-node#webhook-signing')

  const timestampAge = Math.floor(Date.now() / 1000) - details.timestamp

  if (DEFAULT_TOLERANCE > 0 && timestampAge > DEFAULT_TOLERANCE)
    throw new Error('Timestamp outside the tolerance zone')
  const jsonPayload = JSON.parse(body)
  return jsonPayload
}

export function extractDataEvent(event: any): Database['public']['Tables']['stripe_info']['Insert'] {
  const data: Database['public']['Tables']['stripe_info']['Insert'] = {
    product_id: 'free',
    price_id: '',
    subscription_id: undefined,
    subscription_anchor: undefined,
    subscription_metered: {} as MeteredData,
    customer_id: '',
    is_good_plan: true,
    status: undefined,
  }

  console.log('event', JSON.stringify(event, null, 2))
  if (event && event.data && event.data.object) {
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as any
      const res = parsePriceIds(subscription.items.data)
      data.price_id = res.priceId
      if (res.productId)
        data.product_id = res.productId
      data.subscription_anchor = subscription.current_period_start
      data.subscription_metered = res.meteredData
      data.price_id = subscription.items.data.length ? subscription.items.data[0].plan.id : undefined
      data.product_id = (subscription.items.data.length ? subscription.items.data[0].plan.product : undefined) as string
      data.status = subscription.cancel_at ? 'canceled' : 'updated'
      data.subscription_id = subscription.id
      data.customer_id = String(subscription.customer)
    }
    else if (event.type === 'customer.subscription.deleted') {
      const charge = event.data.object as any
      data.status = 'canceled'
      data.customer_id = String(charge.customer)
      data.subscription_id = charge.id
    }
    else {
      console.log('Other event', event.type, event)
    }
  }
  return data
}
