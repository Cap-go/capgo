import { Hono } from '@hono/tiny'
import type { Context } from '@hono/hono'
import { customerToSegmentOrg, supabaseAdmin } from '../utils/supabase.ts'
import type { Person } from '../utils/plunk.ts'
import { addDataContact, trackEvent } from '../utils/plunk.ts'
import { logsnag } from '../utils/logsnag.ts'
import { removeOldSubscription } from '../utils/stripe.ts'
import { extractDataEvent, parseStripeEvent } from '../utils/stripe_event.ts'
import { getEnv } from '../utils/utils.ts'

export const app = new Hono()

app.post('/', async (c: Context) => {
  try {
    const LogSnag = logsnag(c)
    if (!getEnv(c, 'STRIPE_WEBHOOK_SECRET') || !getEnv(c, 'STRIPE_SECRET_KEY'))
      return c.json({ status: 'Webhook Error: no secret found' }, 400)

    const signature = c.req.raw.headers.get('stripe-signature')
    if (!signature || !getEnv(c, 'STRIPE_WEBHOOK_SECRET') || !getEnv(c, 'STRIPE_SECRET_KEY'))
      return c.json({ status: 'Webhook Error: no signature' }, 400)
    // event.headers
    const body = await c.req.text()
    const stripeEvent = await parseStripeEvent(c, body, signature!)
    const stripeData = await extractDataEvent(stripeEvent)
    if (stripeData.customer_id === '')
      return c.json({ error: 'no customer found', stripeData, stripeEvent, body }, 500)

    // find email from user with customer_id
    const { error: dbError, data: org } = await supabaseAdmin(c)
      .from('orgs')
      .select('id, management_email')
      .eq('customer_id', stripeData.customer_id)
      .single()
    if (dbError)
      return c.json({ error: JSON.stringify(dbError) }, 500)
    if (!org)
      return c.json('no user found', 500)

    const { data: customer } = await supabaseAdmin(c)
      .from('stripe_info')
      .select()
      .eq('customer_id', stripeData.customer_id)
      .single()

    if (!customer) {
      console.log('no customer found')
      return c.json({ status: 'ok' }, 200)
    }
    if (!customer.subscription_id)
      stripeData.status = 'succeeded'
    console.log('stripeData', stripeData)

    const userData: Person = {
      id: org.id,
      customer_id: stripeData.customer_id,
      status: stripeData.status as string,
      price_id: stripeData.price_id || '',
      product_id: stripeData.product_id,
    }
    await addDataContact(c, org.management_email, userData)
    if (['created', 'succeeded', 'updated'].includes(stripeData.status || '') && stripeData.price_id && stripeData.product_id) {
      const status = stripeData.status
      stripeData.status = 'succeeded'
      const { data: plan } = await supabaseAdmin(c)
        .from('plans')
        .select()
        .eq('stripe_id', stripeData.product_id)
        .single()
      if (plan) {
        const { error: dbError2 } = await supabaseAdmin(c)
          .from('stripe_info')
          .update(stripeData)
          .eq('customer_id', stripeData.customer_id)
        if (customer && customer.subscription_id && customer.subscription_id !== stripeData.subscription_id)
          await removeOldSubscription(c, customer.subscription_id)

        if (dbError2)
          return c.json({ error: JSON.stringify(dbError) }, 500)

        const isMonthly = plan.price_m_id === stripeData.price_id
        const segment = await customerToSegmentOrg(c, org.id, stripeData.price_id, plan)
        const eventName = `user:subcribe:${isMonthly ? 'monthly' : 'yearly'}`
        await addDataContact(c, org.management_email, userData, segment)
        await trackEvent(c, org.management_email, { plan: plan.name }, eventName)
        await trackEvent(c, org.management_email, {}, 'user:upgrade')
        await LogSnag.track({
          channel: 'usage',
          event: status === 'succeeded' ? 'User subscribe' : 'User update subscribe',
          icon: '💰',
          user_id: org.id,
          notify: status === 'succeeded',
        }).catch()
      }
      else {
        const segment = await customerToSegmentOrg(c, org.id, stripeData.price_id)
        await addDataContact(c, org.management_email, userData, segment)
      }
    }
    else if (['canceled', 'deleted', 'failed'].includes(stripeData.status || '') && customer && customer.subscription_id === stripeData.subscription_id) {
      if (stripeData.status === 'canceled') {
        const statusCopy = stripeData.status
        stripeData.status = 'succeeded'
        const segment = await customerToSegmentOrg(c, org.id, 'canceled')
        await addDataContact(c, org.management_email, userData, segment)
        await trackEvent(c, org.management_email, {}, 'user:cancel')
        await LogSnag.track({
          channel: 'usage',
          event: 'User cancel',
          icon: '⚠️',
          user_id: org.id,
          notify: true,
        }).catch()
        stripeData.status = statusCopy
      }
      stripeData.is_good_plan = false
      const { error: dbError2 } = await supabaseAdmin(c)
        .from('stripe_info')
        .update(stripeData)
        .eq('customer_id', stripeData.customer_id)
      if (dbError2)
        return c.json({ error: JSON.stringify(dbError) }, 500)
    }
    else {
      const segment = await customerToSegmentOrg(c, org.id, 'canceled')
      await addDataContact(c, org.management_email, userData, segment)
    }

    return c.json({ received: true })
  }
  catch (e) {
    console.log(e)
    return c.json({ status: 'Cannot parse event', error: JSON.stringify(e) }, 500)
  }
})
