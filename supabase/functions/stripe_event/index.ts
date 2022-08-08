import { serve } from 'https://deno.land/std@0.151.0/http/server.ts'
import { addDataPerson, addEventPerson, updatePerson } from '../_utils/crisp.ts'
import { extractDataEvent, parseStripeEvent } from '../_utils/stripe_event.ts'
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
    const stripeEvent = parseStripeEvent(await event.text(), signature)
    const stripeData = await extractDataEvent(stripeEvent)
    if (stripeData.customer_id === '')
      return sendRes('no customer found', 500)

    // find email from user with customer_id
    const { error: dbError, data: user } = await supabase
      .from<definitions['users']>('users')
      .select(`email,
      id`)
      .eq('customer_id', stripeData.customer_id)
      .single()
    if (dbError)
      return sendRes(dbError, 500)
    if (!user)
      return sendRes('no user found', 500)
    const { error: dbError2 } = await supabase
      .from<definitions['stripe_info']>('stripe_info')
      .update(stripeData)
      .eq('customer_id', stripeData.customer_id)

    console.log('stripeData', stripeData)
    if (dbError2)
      return sendRes(dbError, 500)
    await addDataPerson(user.email, {
      id: user.id,
      customer_id: stripeData.customer_id,
      status: stripeData.status,
      price_id: stripeData.price_id,
      product_id: stripeData.product_id,
    })
    if (stripeData.status !== 'canceled' && stripeData.price_id) {
      const { data: plan } = await supabase
        .from<definitions['plans']>('plans')
        .select()
        .eq('stripe_id', stripeData.product_id)
        .single()
      if (plan) {
        const isMonthly = plan.price_m_id === stripeData.price_id
        await updatePerson(user.email, undefined, [plan.name, isMonthly ? 'Monthly' : 'Yearly'])
        await addEventPerson(user.email, {
          plan: plan.name,
        }, `user:subcribe:${isMonthly ? 'monthly' : 'yearly'}`, 'green')
        await addEventPerson(user.email, {}, 'user:upgrade', 'green')
      }
      else { await updatePerson(user.email, undefined, ['Not_found']) }
    }
    else if (stripeData.status === 'canceled') {
      await updatePerson(user.email, undefined, ['Canceled'])
      await addEventPerson(user.email, {}, 'user:cancel', 'red')
    }
    else {
      await updatePerson(user.email, undefined, ['Free'])
    }

    return sendRes({ received: true })
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
