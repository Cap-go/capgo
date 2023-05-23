import { serve } from 'https://deno.land/std@0.188.0/http/server.ts'
import { addDataPerson, addEventPerson, updatePerson } from '../_utils/crisp.ts'
import { extractDataEvent, parseStripeEvent } from '../_utils/stripe_event.ts'
import { customerToSegment, supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import { removeOldSubscription } from '../_utils/stripe.ts'
import { logsnag } from '../_utils/logsnag.ts'

serve(async (event: Request) => {
  if (!event.headers.get('stripe-signature') || !getEnv('STRIPE_WEBHOOK_SECRET') || !getEnv('STRIPE_SECRET_KEY'))
    return sendRes({ status: 'Webhook Error: no signature or no secret found' }, 400)

  // event.headers
  try {
    const signature = event.headers.get('Stripe-Signature') || ''
    const stripeEvent = parseStripeEvent(await event.text(), signature)
    const stripeData = await extractDataEvent(stripeEvent)
    if (stripeData.customer_id === '')
      return sendRes('no customer found', 500)

    // find email from user with customer_id
    const { error: dbError, data: user } = await supabaseAdmin()
      .from('users')
      .select(`email,
      id`)
      .eq('customer_id', stripeData.customer_id)
      .single()
    if (dbError)
      return sendRes({ error: JSON.stringify(dbError) }, 500)
    if (!user)
      return sendRes('no user found', 500)

    const { data: customer } = await supabaseAdmin()
      .from('stripe_info')
      .select()
      .eq('customer_id', stripeData.customer_id)
      .single()

    if (!customer) {
      console.log('no customer found')
      return sendRes({ status: 'ok' }, 200)
    }
    if (!customer.subscription_id)
      stripeData.status = 'succeeded'
    console.log('stripeData', stripeData)

    await addDataPerson(user.email, {
      id: user.id,
      customer_id: stripeData.customer_id,
      status: stripeData.status as string,
      price_id: stripeData.price_id || '',
      product_id: stripeData.product_id,
    })
    if (['created', 'succeeded', 'updated'].includes(stripeData.status || '') && stripeData.price_id && stripeData.product_id) {
      const status = stripeData.status
      stripeData.status = 'succeeded'
      const { data: plan } = await supabaseAdmin()
        .from('plans')
        .select()
        .eq('stripe_id', stripeData.product_id)
        .single()
      if (plan) {
        const { error: dbError2 } = await supabaseAdmin()
          .from('stripe_info')
          .update(stripeData)
          .eq('customer_id', stripeData.customer_id)
        if (customer && customer.product_id !== 'free' && customer.subscription_id && customer.subscription_id !== stripeData.subscription_id)
          await removeOldSubscription(customer.subscription_id)

        if (dbError2)
          return sendRes({ error: JSON.stringify(dbError) }, 500)

        const isMonthly = plan.price_m_id === stripeData.price_id
        const segment = await customerToSegment(user.id, customer, plan)
        await updatePerson(user.email, undefined, segment)
        await addEventPerson(user.email, {
          plan: plan.name,
        }, `user:subcribe:${isMonthly ? 'monthly' : 'yearly'}`, 'green')
        await addEventPerson(user.email, {}, 'user:upgrade', 'green')
        await logsnag.publish({
          channel: 'usage',
          event: status === 'succeeded' ? 'User subscribe' : 'User update subscribe',
          icon: '💰',
          tags: {
            'user-id': user.id,
          },
          notify: status === 'succeeded',
        }).catch()
      }
      else {
        const segment = await customerToSegment(user.id, customer)
        await updatePerson(user.email, undefined, segment)
      }
    }
    else if (['canceled', 'deleted', 'failed'].includes(stripeData.status || '') && customer && customer.subscription_id === stripeData.subscription_id) {
      if (stripeData.status === 'canceled') {
        stripeData.status = 'succeeded'
        stripeData.subscription_anchor = new Date().toISOString()
        const segment = await customerToSegment(user.id, customer)
        await updatePerson(user.email, undefined, segment)
        await addEventPerson(user.email, {}, 'user:cancel', 'red')
        await logsnag.publish({
          channel: 'usage',
          event: 'User cancel',
          icon: '⚠️',
          tags: {
            'user-id': user.id,
          },
          notify: true,
        }).catch()
      }
      else {
        stripeData.is_good_plan = false
        const { error: dbError2 } = await supabaseAdmin()
          .from('stripe_info')
          .update(stripeData)
          .eq('customer_id', stripeData.customer_id)
        if (dbError2)
          return sendRes({ error: JSON.stringify(dbError) }, 500)
      }
    }
    else {
      const segment = await customerToSegment(user.id, customer)
      await updatePerson(user.email, undefined, segment)
    }

    return sendRes({ received: true })
  }
  catch (e) {
    return sendRes({
      status: 'Error unknown',
      error: JSON.stringify(e),
    }, 500)
  }
})
