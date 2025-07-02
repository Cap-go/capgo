import type { Context } from 'hono'
import type Stripe from 'stripe'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { StripeData } from '../utils/stripe.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { addTagBento, trackBentoEvent } from '../utils/bento.ts'
import { middlewareStripeWebhook } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
import { customerToSegmentOrg, supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

interface Org {
  id: string
  management_email: string
}

async function customerSourceCreated(c: Context, LogSnag: ReturnType<typeof logsnag>, org: Org, stripeEvent: Stripe.CustomerSourceCreatedEvent) {
  const card = stripeEvent.data.object as any
  const expirationDate = card.exp_month && card.exp_year ? `${card.exp_month}/${card.exp_year}` : 'unknown'
  await trackBentoEvent(c, org.management_email, { expiration_date: expirationDate }, 'org:card_added')
  await LogSnag.track({
    channel: 'usage',
    event: 'Credit Card Added',
    icon: '💳',
    user_id: org.id,
    notify: false,
  }).catch()
  return c.json({ status: 'ok' }, 200)
}

async function customerSourceExpiring(c: Context, LogSnag: ReturnType<typeof logsnag>, org: Org) {
  await trackBentoEvent(c, org.management_email, {}, 'org:card_expiring')
  await LogSnag.track({
    channel: 'usage',
    event: 'Credit Card Expiring',
    icon: '⚠️',
    user_id: org.id,
    notify: false,
  }).catch()
  return c.json({ status: 'ok' }, 200)
}

async function invoiceUpcoming(c: Context, LogSnag: ReturnType<typeof logsnag>, org: Org, stripeEvent: Stripe.InvoiceUpcomingEvent, stripeData: StripeData) {
  const invoice = stripeEvent.data.object as any
  let planName = null
  let planType = 'monthly'
  if (stripeData.data.product_id) {
    const { data: plan } = await supabaseAdmin(c)
      .from('plans')
      .select('name, price_y_id')
      .eq('stripe_id', stripeData.data.product_id)
      .single()
    if (!plan) {
      cloudlog({ requestId: c.get('requestId'), message: 'failed to get plan' })
      return c.json({ status: 'failed to get plan' }, 500)
    }
    planName = plan.name
    if (plan.price_y_id === stripeData.data.price_id) {
      planType = 'yearly'
    }
  }
  const price = invoice.total ? invoice.total / 100 : 0
  await trackBentoEvent(c, org.management_email, { plan_name: planName, price, plan_type: planType }, 'org:invoice_upcoming')
  await LogSnag.track({
    channel: 'usage',
    event: 'Invoice Upcoming',
    icon: '📄',
    user_id: org.id,
    notify: false,
  }).catch()
  return c.json({ status: 'ok' }, 200)
}

async function createdOrUpdated(c: Context, stripeData: StripeData, org: Org, LogSnag: ReturnType<typeof logsnag>) {
  const status = stripeData.data.status
  let statusName: string = status ?? ''
  const { data: plan } = await supabaseAdmin(c)
    .from('plans')
    .select()
    .eq('stripe_id', stripeData.data.product_id)
    .single()
  if (plan) {
    const { error: dbError2 } = await supabaseAdmin(c)
      .from('stripe_info')
      .update(stripeData.data)
      .eq('customer_id', stripeData.data.customer_id)
    if (stripeData.isUpgrade && stripeData.previousProductId) {
      statusName = 'upgraded'
      const previousProduct = await supabaseAdmin(c)
        .from('plans')
        .select()
        .eq('stripe_id', stripeData.previousProductId)
        .single()
      await trackBentoEvent(c, org.management_email, {
        plan_name: plan.name,
        previous_plan_name: previousProduct.data?.name ?? '',
      }, 'user:plan_change')
      await LogSnag.track({
        channel: 'usage',
        event: 'User Upgraded',
        icon: '💰',
        user_id: org.id,
        notify: true,
        tags: {
          plan_name: plan.name,
          previous_plan_name: previousProduct.data?.name ?? '',
        },
      }).catch()
    }

    if (dbError2) {
      cloudlog({ requestId: c.get('requestId'), message: 'error', error: dbError2 })
      return c.json({ error: `succeeded: customer_id not found: ${stripeData.data.customer_id}`, dbError2, stripeData }, 500)
    }

    const segment = await customerToSegmentOrg(c, org.id, stripeData.data.price_id, plan)
    const isMonthly = plan.price_m_id === stripeData.data.price_id
    const eventName = `user:subcribe_${statusName}:${isMonthly ? 'monthly' : 'yearly'}`
    await trackBentoEvent(c, org.management_email, { plan_name: plan.name }, eventName)
    await addTagBento(c, org.management_email, segment)
    await LogSnag.track({
      channel: 'usage',
      event: status === 'succeeded' ? 'User subscribe' : 'User update subscribe',
      icon: '💰',
      user_id: org.id,
      notify: status === 'succeeded',
      tags: {
        plan_name: plan.name,
      },
    }).catch()
  }
  else {
    const segment = await customerToSegmentOrg(c, org.id, stripeData.data.price_id)
    await addTagBento(c, org.management_email, segment)
  }
  return false
}

async function updateStripeInfo(c: Context, stripeData: StripeData) {
  const { error: dbError2 } = await supabaseAdmin(c)
    .from('stripe_info')
    .update(stripeData.data)
    .eq('customer_id', stripeData.data.customer_id)
  if (dbError2) {
    cloudlog({ requestId: c.get('requestId'), message: 'customer_id not found', error: dbError2 })
    return c.json({ error: `canceled:  customer_id not found: ${stripeData.data.customer_id}`, dbError2, stripeData }, 500)
  }
  return false
}

async function didCancel(c: Context, org: Org, LogSnag: ReturnType<typeof logsnag>) {
  const segment = await customerToSegmentOrg(c, org.id, 'canceled')
  await addTagBento(c, org.management_email, segment)
  await trackBentoEvent(c, org.management_email, {}, 'user:cancel')
  await LogSnag.track({
    channel: 'usage',
    event: 'User cancel',
    icon: '⚠️',
    user_id: org.id,
    notify: true,
  }).catch()
}

async function getOrg(c: Context, stripeData: StripeData) {
  const { error: dbError, data: org } = await supabaseAdmin(c)
    .from('orgs')
    .select('id, management_email')
    .eq('customer_id', stripeData.data.customer_id)
    .single()
  if (dbError) {
    cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no user found' })
    return false
  }
  if (!org) {
    cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no user found' })
    return false
  }
  return org
}

async function cancelingOrFinished(c: Context, stripeEvent: Stripe.Event, stripeData: Database['public']['Tables']['stripe_info']['Insert']) {
  const previousAttributes = stripeEvent.data.previous_attributes ?? {} as any
  if (stripeEvent.data.object.object === 'subscription' && stripeEvent.data.object.cancel_at_period_end === true && typeof previousAttributes.cancel_at_period_end === 'boolean' && previousAttributes.cancel_at_period_end === false) {
    // cloudlog('USER CANCELLED!!!!!!!!!!!!!!!')
    const { error: dbError2 } = await supabaseAdmin(c)
      .from('stripe_info')
      .update({ canceled_at: new Date().toISOString() })
      .eq('customer_id', stripeData.customer_id)
    if (dbError2) {
      cloudlog({ requestId: c.get('requestId'), message: 'error', error: dbError2 })
      return c.json({ error: `USER CANCELLED, customer_id not found: ${stripeData.customer_id}`, dbError2, stripeData }, 500)
    }
  }
  else if (stripeEvent.data.object.object === 'subscription' && stripeEvent.data.object.cancel_at_period_end === false && typeof previousAttributes.cancel_at_period_end === 'boolean' && previousAttributes.cancel_at_period_end === true) {
    // cloudlog('USER UNCANCELED')
    const { error: dbError2 } = await supabaseAdmin(c)
      .from('stripe_info')
      .update({ canceled_at: null })
      .eq('customer_id', stripeData.customer_id)
    if (dbError2) {
      cloudlog({ requestId: c.get('requestId'), message: 'error', error: dbError2 })
      return c.json({ error: `USER UNCANCELED, customer_id not found: ${stripeData.customer_id}`, dbError2, stripeData }, 500)
    }
  }
  return c.json({ received: true })
}

app.post('/', middlewareStripeWebhook(), async (c) => {
  try {
    const LogSnag = logsnag(c)
    const stripeData = c.get('stripeData')!
    const stripeEvent = c.get('stripeEvent')!

    // find email from user with customer_id
    const org = await getOrg(c, stripeData)
    if (!org) {
      cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no org found' })
      return c.json({ status: 'Webhook Error: no org found' }, 400)
    }

    const { data: customer } = await supabaseAdmin(c)
      .from('stripe_info')
      .select()
      .eq('customer_id', stripeData.data.customer_id)
      .single()

    if (!customer) {
      cloudlog({ requestId: c.get('requestId'), message: 'no customer found' })
      return c.json({ status: 'ok' }, 200)
    }
    cloudlog({ requestId: c.get('requestId'), message: 'stripeData', stripeData })

    if (stripeEvent.type === 'customer.source.expiring') {
      return customerSourceExpiring(c, LogSnag, org)
    }
    else if (stripeEvent.type === 'customer.source.created') {
      return customerSourceCreated(c, LogSnag, org, stripeEvent)
    }
    else if (stripeEvent.type === 'invoice.upcoming') {
      return invoiceUpcoming(c, LogSnag, org, stripeEvent, stripeData)
    }

    if (['created', 'succeeded', 'updated'].includes(stripeData.data.status ?? '') && stripeData.data.price_id && stripeData.data.product_id) {
      stripeData.data.status = 'succeeded'
      const res = await createdOrUpdated(c, stripeData, org, LogSnag)
      if (res) {
        return res
      }
    }
    else if (stripeData.data.status === 'failed') {
      await trackBentoEvent(c, org.management_email, {}, 'org:failed_payment')
    }
    else if (['canceled', 'deleted'].includes(stripeData.data.status ?? '') && customer && customer.subscription_id === stripeData.data.subscription_id) {
      await didCancel(c, org, LogSnag)
      stripeData.data.status = 'succeeded'
      const res = await updateStripeInfo(c, stripeData)
      if (res) {
        return res
      }
    }
    return cancelingOrFinished(c, stripeEvent, stripeData.data)
  }
  catch (e) {
    cloudlog({ requestId: c.get('requestId'), message: 'error', error: e })
    return c.json({ status: 'Cannot parse event', error: JSON.stringify(e) }, 500)
  }
})
