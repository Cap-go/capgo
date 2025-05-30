import type Stripe from 'stripe'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { addTagBento, trackBentoEvent } from '../utils/bento.ts'
import { cloudlog } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
import { extractDataEvent, parseStripeEvent } from '../utils/stripe_event.ts'
import { customerToSegmentOrg, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', async (c) => {
  try {
    const LogSnag = logsnag(c as any)
    if (!getEnv(c as any, 'STRIPE_WEBHOOK_SECRET') || !getEnv(c as any, 'STRIPE_SECRET_KEY')) {
      cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no secret found' })
      return c.json({ status: 'Webhook Error: no secret found' }, 400)
    }

    const signature = c.req.raw.headers.get('stripe-signature')
    if (!signature || !getEnv(c as any, 'STRIPE_WEBHOOK_SECRET') || !getEnv(c as any, 'STRIPE_SECRET_KEY')) {
      cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no signature' })
      return c.json({ status: 'Webhook Error: no signature' }, 400)
    }
    // event.headers
    const body = await c.req.text()
    const stripeEvent = await parseStripeEvent(c as any, body, signature!)

    // Special handling for one-off charges
    if (stripeEvent.type === 'payment_intent.succeeded') {
      const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent
      if (paymentIntent.object === 'payment_intent') {
        // Get the customer details
        const customerId = typeof paymentIntent.customer === 'string' ? paymentIntent.customer : paymentIntent.customer?.id
        const { data: org, error: orgError } = await supabaseAdmin(c as any)
          .from('orgs')
          .select('id')
          .eq('customer_id', customerId ?? '')
          .single()

        if (!org || orgError) {
          console.log({ requestId: c.get('requestId'), context: 'no org found for payment intent', paymentIntent })
          return c.json({ received: false })
        }

        const howMany = paymentIntent.metadata?.howMany
        const parsedHowMany = Number.parseInt(howMany ?? '0')
        if (!howMany || Number.isNaN(parsedHowMany)) {
          console.log({ requestId: c.get('requestId'), context: 'no howMany found for payment intent', paymentIntent })
          return c.json({ received: false })
        }

        const { error: dbError } = await supabaseAdmin(c as any)
          .from('capgo_tokens_history')
          .insert({
            sum: Number(parsedHowMany),
            reason: 'MAU purchase',
            org_id: org.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        if (dbError) {
          console.log({ requestId: c.get('requestId'), context: 'error inserting capgo_tokens_history', dbError })
          return c.json({ received: false })
        }

        // Log the purchase
        await LogSnag.track({
          channel: 'usage',
          event: 'One-off Purchase',
          icon: '💰',
          user_id: org.id,
          notify: true,
          tags: {
            amount: `${paymentIntent.amount / 100} ${paymentIntent.currency.toUpperCase()}`,
            payment_intent: paymentIntent.id,
          },
        }).catch()

        return c.json({ received: true })
      }
    }

    const stripeDataEvent = extractDataEvent(c as any, stripeEvent)
    const stripeData = stripeDataEvent.data
    if (stripeData.customer_id === '') {
      cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no customer found' })
      return c.json({ status: 'Webhook Error: no customer found' }, 400)
    }

    // find email from user with customer_id
    const { error: dbError, data: org } = await supabaseAdmin(c as any)
      .from('orgs')
      .select('id, management_email')
      .eq('customer_id', stripeData.customer_id)
      .single()
    if (dbError) {
      cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no user found' })
      return c.json({ status: 'Webhook Error: no user found' }, 400)
    }
    if (!org) {
      cloudlog({ requestId: c.get('requestId'), message: 'Webhook Error: no user found' })
      return c.json({ status: 'Webhook Error: no user found' }, 400)
    }

    const { data: customer } = await supabaseAdmin(c as any)
      .from('stripe_info')
      .select()
      .eq('customer_id', stripeData.customer_id)
      .single()

    if (!customer) {
      cloudlog({ requestId: c.get('requestId'), message: 'no customer found' })
      return c.json({ status: 'ok' }, 200)
    }
    if (!customer.subscription_id)
      stripeData.status = 'succeeded'
    cloudlog({ requestId: c.get('requestId'), message: 'stripeData', stripeData })

    if (stripeEvent.type === 'customer.source.expiring') {
      await trackBentoEvent(c as any, org.management_email, {}, 'org:card_expiring')
      await LogSnag.track({
        channel: 'usage',
        event: 'Credit Card Expiring',
        icon: '⚠️',
        user_id: org.id,
        notify: false,
      }).catch()
      return c.json({ status: 'ok' }, 200)
    }
    else if (stripeEvent.type === 'customer.source.created') {
      const card = stripeEvent.data.object as any
      const expirationDate = card.exp_month && card.exp_year ? `${card.exp_month}/${card.exp_year}` : 'unknown'
      await trackBentoEvent(c as any, org.management_email, { expiration_date: expirationDate }, 'org:card_added')
      await LogSnag.track({
        channel: 'usage',
        event: 'Credit Card Added',
        icon: '💳',
        user_id: org.id,
        notify: false,
      }).catch()
      return c.json({ status: 'ok' }, 200)
    }
    else if (stripeEvent.type === 'invoice.upcoming') {
      const invoice = stripeEvent.data.object as any
      let planName = null
      let planType = 'monthly'
      if (stripeData.product_id) {
        const { data: plan } = await supabaseAdmin(c as any)
          .from('plans')
          .select('name, price_y_id')
          .eq('stripe_id', stripeData.product_id)
          .single()
        if (!plan) {
          cloudlog({ requestId: c.get('requestId'), message: 'failed to get plan' })
          return c.json({ status: 'failed to get plan' }, 500)
        }
        planName = plan.name
        if (plan.price_y_id === stripeData.price_id) {
          planType = 'yearly'
        }
      }
      const price = invoice.total ? invoice.total / 100 : 0
      await trackBentoEvent(c as any, org.management_email, { plan_name: planName, price, plan_type: planType }, 'org:invoice_upcoming')
      await LogSnag.track({
        channel: 'usage',
        event: 'Invoice Upcoming',
        icon: '📄',
        user_id: org.id,
        notify: false,
      }).catch()
      return c.json({ status: 'ok' }, 200)
    }

    if (['created', 'succeeded', 'updated'].includes(stripeData.status || '') && stripeData.price_id && stripeData.product_id) {
      const status = stripeData.status
      let statusName: string = status || ''
      stripeData.status = 'succeeded'
      const { data: plan } = await supabaseAdmin(c as any)
        .from('plans')
        .select()
        .eq('stripe_id', stripeData.product_id)
        .single()
      if (plan) {
        const { error: dbError2 } = await supabaseAdmin(c as any)
          .from('stripe_info')
          .update(stripeData)
          .eq('customer_id', stripeData.customer_id)
        if (stripeDataEvent.isUpgrade && stripeDataEvent.previousProductId) {
          statusName = 'upgraded'
          const previousProduct = await supabaseAdmin(c as any)
            .from('plans')
            .select()
            .eq('stripe_id', stripeDataEvent.previousProductId)
            .single()
          await trackBentoEvent(c as any, org.management_email, {
            plan_name: plan.name,
            previous_plan_name: previousProduct.data?.name || '',
          }, 'user:plan_change')
          await LogSnag.track({
            channel: 'usage',
            event: 'User Upgraded',
            icon: '💰',
            user_id: org.id,
            notify: true,
            tags: {
              plan_name: plan.name,
              previous_plan_name: previousProduct.data?.name || '',
            },
          }).catch()
        }

        if (dbError2) {
          cloudlog({ requestId: c.get('requestId'), message: 'error', error: dbError2 })
          return c.json({ error: `succeeded: customer_id not found: ${stripeData.customer_id}`, dbError2, stripeData }, 500)
        }

        const segment = await customerToSegmentOrg(c as any, org.id, stripeData.price_id, plan)
        const isMonthly = plan.price_m_id === stripeData.price_id
        const eventName = `user:subcribe_${statusName}:${isMonthly ? 'monthly' : 'yearly'}`
        await trackBentoEvent(c as any, org.management_email, { plan_name: plan.name }, eventName)
        await addTagBento(c as any, org.management_email, segment)
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
        const segment = await customerToSegmentOrg(c as any, org.id, stripeData.price_id)
        await addTagBento(c as any, org.management_email, segment)
      }
    }
    else if (stripeData.status === 'failed') {
      await trackBentoEvent(c as any, org.management_email, {}, 'org:failed_payment')
    }
    else if (['canceled', 'deleted'].includes(stripeData.status || '') && customer && customer.subscription_id === stripeData.subscription_id) {
      if (stripeData.status === 'canceled') {
        const segment = await customerToSegmentOrg(c as any, org.id, 'canceled')
        await addTagBento(c as any, org.management_email, segment)
        await trackBentoEvent(c as any, org.management_email, {}, 'user:cancel')
        await LogSnag.track({
          channel: 'usage',
          event: 'User cancel',
          icon: '⚠️',
          user_id: org.id,
          notify: true,
        }).catch()
        stripeData.status = 'succeeded'
      }
      const { error: dbError2 } = await supabaseAdmin(c as any)
        .from('stripe_info')
        .update(stripeData)
        .eq('customer_id', stripeData.customer_id)
      if (dbError2) {
        cloudlog({ requestId: c.get('requestId'), message: 'customer_id not found', error: dbError2 })
        return c.json({ error: `canceled:  customer_id not found: ${stripeData.customer_id}`, dbError2, stripeData }, 500)
      }
    }
    const previousAttributes = stripeEvent.data.previous_attributes ?? {} as any
    if (stripeEvent.data.object.object === 'subscription' && stripeEvent.data.object.cancel_at_period_end === true && typeof previousAttributes.cancel_at_period_end === 'boolean' && previousAttributes.cancel_at_period_end === false) {
      // console.log('USER CANCELLED!!!!!!!!!!!!!!!')
      const { error: dbError2 } = await supabaseAdmin(c as any)
        .from('stripe_info')
        .update({ canceled_at: new Date().toISOString() })
        .eq('customer_id', stripeData.customer_id)
      if (dbError2) {
        cloudlog({ requestId: c.get('requestId'), message: 'error', error: dbError2 })
        return c.json({ error: `USER CANCELLED, customer_id not found: ${stripeData.customer_id}`, dbError2, stripeData }, 500)
      }
    }
    else if (stripeEvent.data.object.object === 'subscription' && stripeEvent.data.object.cancel_at_period_end === false && typeof previousAttributes.cancel_at_period_end === 'boolean' && previousAttributes.cancel_at_period_end === true) {
      // console.log('USER UNCANCELED')
      const { error: dbError2 } = await supabaseAdmin(c as any)
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
  catch (e) {
    cloudlog({ requestId: c.get('requestId'), message: 'error', error: e })
    return c.json({ status: 'Cannot parse event', error: JSON.stringify(e) }, 500)
  }
})
