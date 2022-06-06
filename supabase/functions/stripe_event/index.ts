import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { extractDataEvent, parseStripeEvent } from '../_utils/stripe.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

serve(async(event: Request) => {
  const supabase = supabaseAdmin

  if (!event.headers.get('stripe-signature') || !Deno.env.get('STRIPE_WEBHOOK_SECRET') || !Deno.env.get('STRIPE_SECRET_KEY'))
    return sendRes({ status: 'Webhook Error: no signature or no secret found' }, 400)

  // event.headers
  try {
    const signature = event.headers.get("Stripe-Signature") || '';
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
    const webhookKey = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
    const stripeEvent = await extractDataEvent(await parseStripeEvent(secretKey, await event.text(), signature, webhookKey))
    if (stripeEvent.customer_id === '')
      return sendRes('no customer found', 500)

    const { error: dbError } = await supabase
      .from<definitions['stripe_info']>('stripe_info')
      .update(stripeEvent)
      .eq('customer_id', stripeEvent.customer_id)
    // eslint-disable-next-line no-console
    console.log('stripeEvent', stripeEvent)
    if (dbError)
      return sendRes(dbError, 500)

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