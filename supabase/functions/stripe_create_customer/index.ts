import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { createCustomer } from '../_utils/stripe.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

serve(async(event: Request) => {
  const supabase = supabaseAdmin
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.error('Fail Authorization')
    return sendRes({ message: 'Fail Authorization' }, 400)
  }
  try {
    console.log('body')
    const body = (await event.json()) as { record: definitions['users'] }
    const record = body.record
    if (record.customer_id)
      return sendRes()
    console.log('createCustomer')
    const customer = await createCustomer(Deno.env.get('STRIPE_SECRET_KEY') || '', record.email)
    const { error: dbStripeError } = await supabase
      .from<definitions['stripe_info']>('stripe_info')
      .insert({
        customer_id: customer.id,
      })
    console.log('stripe_info done')
    const { error: dbError } = await supabase
      .from<definitions['users']>('users')
      .update({
        customer_id: customer.id,
      })
      .eq('email', record.email)
    console.log('users done')
    if (dbError || dbStripeError) {
      console.error(dbError)
      return sendRes({ message: dbError }, 400)
    }
    return sendRes()
  }
  catch (e) {
    console.log('e', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
