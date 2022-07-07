import { serve } from 'https://deno.land/std@0.147.0/http/server.ts'
import { addDataPerson, addEventPerson, updatePerson } from '../_utils/crisp.ts'
import { extractDataEvent, parseStripeEvent } from '../_utils/stripe.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

serve(async (event: Request) => {
  const supabase = supabaseAdmin

  if (!event.headers.get('stripe-signature') || !Deno.env.get('STRIPE_WEBHOOK_SECRET') || !Deno.env.get('STRIPE_SECRET_KEY'))
    return sendRes({ status: 'Webhook Error: no signature or no secret found' }, 400)

  // event.headers
  try {
    const signature = event.headers.get('Stripe-Signature') || ''
    const stripeEvent = await extractDataEvent(await parseStripeEvent(await event.text(), signature))
    if (stripeEvent.customer_id === '')
      return sendRes('no customer found', 500)

    // find email from user with customer_id
    const { error: dbError, data: user } = await supabase
      .from<definitions['users']>('users')
      .select(`email,
      id`)
      .eq('customer_id', stripeEvent.customer_id)
      .single()
    if (dbError)
      return sendRes(dbError, 500)
    if (!user)
      return sendRes('no user found', 500)
    const { error: dbError2 } = await supabase
      .from<definitions['stripe_info']>('stripe_info')
      .update(stripeEvent)
      .eq('customer_id', stripeEvent.customer_id)

    console.log('stripeEvent', stripeEvent)
    if (dbError2)
      return sendRes(dbError, 500)
    await addDataPerson(user.email, {
      id: user.id,
      customer_id: stripeEvent.customer_id,
      status: stripeEvent.status,
      price_id: stripeEvent.price_id,
      product_id: stripeEvent.product_id,
    })
    if (stripeEvent.status !== 'canceled' && stripeEvent.price_id) {
      const { data: plan } = await supabase
        .from<definitions['plans']>('plans')
        .select()
        .eq('stripe_id', stripeEvent.product_id)
        .single()
      if (plan) {
        const isMonthly = plan.price_m_id === stripeEvent.price_id
        await updatePerson(user.email, undefined, [plan.name, isMonthly ? 'Monthly' : 'Yearly'])
        await addEventPerson(user.email, {
          plan: plan.name,
        }, `user:subcribe:${isMonthly ? 'monthly' : 'yearly'}`, 'green')
        await addEventPerson(user.email, {}, 'user:upgrade', 'green')
      }
      else { await updatePerson(user.email, undefined, ['Not_found']) }
    }
    else if (stripeEvent.status === 'canceled') {
      await updatePerson(user.email, undefined, ['Canceled'])
      await addEventPerson(user.email, {}, 'user:cancel', 'red')
    }
    else {
      await updatePerson(user.email, undefined, ['Free'])
    }

    return sendRes({ received: true })
  }
  catch (e) {
    console.log('e', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
