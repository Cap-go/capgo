import dayjs from 'dayjs'
import Stripe from 'stripe'

export const parseStripeEvent = (request: https.Request, key: string, endpoint: string) => {
  const sig = request.headers['stripe-signature']
  const stripe = new Stripe(key, {
    apiVersion: '2020-08-27',
  })
  const event = stripe.webhooks.constructEvent(request.rawBody, String(sig), endpoint)
  return event
}

export interface DataEvent {
  email: string | null
  status: 'created' | 'succeeded' | 'updated' | 'failed' | 'deleted' | 'canceled' | null
  update: {
    customerId?: string | null
    subscriptionId?: string | null
    updatedAt: string
  }
}

export const createPortal = async(key: string, subscriptionId: string, callbackUrl: string) => {
  const stripe = new Stripe(key, {
    apiVersion: '2020-08-27',
  })
  const link = await stripe.billingPortal.sessions.create({
    customer: subscriptionId,
    return_url: callbackUrl,
  })
  return link
}

export const deleteSub = async(key: string, subscriptionId: string) => {
  const stripe = new Stripe(key, {
    apiVersion: '2020-08-27',
  })
  try {
    const res = await stripe.subscriptions.del(subscriptionId)
    return res
  }
  catch (err) {
    return err
  }
}

export const extractDataEvent = (event: Stripe.Event): DataEvent => {
  const data: DataEvent = {
    email: null,
    update: {
      subscriptionId: undefined,
      customerId: undefined,
      updatedAt: dayjs().toISOString(),
    },
    status: null,
  }
  if (event && event.data && event.data.object) {
    const obj = event.data.object as Stripe.Charge | Stripe.Subscription
    data.update.customerId = String(obj.customer)
    if (data.update.customerId) {
      if (event.type === 'charge.succeeded') {
        data.status = 'succeeded'
        data.update = {
          subscriptionId: obj.id,
          customerId: String(obj.customer),
          updatedAt: dayjs().toISOString(),
        }
      }
      else if (event.type === 'customer.deleted') {
        data.status = 'deleted'
        data.update = {
          subscriptionId: null,
          customerId: null,
          updatedAt: dayjs().toISOString(),
        }
      }
      else if (event.type === 'charge.failed' || event.type === 'customer.subscription.deleted') {
        data.status = event.type === 'charge.failed' ? 'failed' : 'canceled'
        data.update = {
          subscriptionId: null,
          updatedAt: dayjs().toISOString(),
        }
      }
      else {
        console.error('Other event', event)
      }
    }
  }
  return data
}
