import { serve } from 'https://deno.land/std@0.159.0/http/server.ts'
import { addDataPerson, addEventPerson, postPerson } from '../_utils/crisp.ts'
import { createCustomer } from '../_utils/stripe.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'
import { logsnag } from '../_utils/_logsnag.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
serve(async (event: Request) => {
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.log('Fail Authorization')
    return sendRes({ message: 'Fail Authorization' }, 400)
  }
  try {
    console.log('body')
    const body = (await event.json()) as { record: definitions['users'] }
    const record = body.record
    await supabaseAdmin
      .from<definitions['apikeys']>('apikeys')
      .insert([
        {
          user_id: record.id,
          key: crypto.randomUUID(),
          mode: 'all',
        },
        {
          user_id: record.id,
          key: crypto.randomUUID(),
          mode: 'upload',
        },
        {
          user_id: record.id,
          key: crypto.randomUUID(),
          mode: 'read',
        }])
    await postPerson(record.email, record.first_name, record.last_name, record.image_url ? record.image_url : undefined)
    console.log('createCustomer stripe')
    if (record.customer_id)
      return sendRes()
    const customer = await createCustomer(record.email)
    const { error: dbStripeError } = await supabaseAdmin
      .from<definitions['stripe_info']>('stripe_info')
      .insert({
        customer_id: customer.id,
      })
    await addDataPerson(record.email, {
      id: record.id,
      customer_id: customer.id,
      product_id: 'free',
    })
    await addEventPerson(record.email, {}, 'user:register', 'green')
    await logsnag.publish({
      channel: 'user-register',
      event: 'User Joined',
      icon: '🎉',
      tags: {
        'user-id': record.id,
      },
      notify: true,
    }).catch()
    console.log('stripe_info done')
    const { error: dbError } = await supabaseAdmin
      .from<definitions['users']>('users')
      .update({
        customer_id: customer.id,
      })
      .eq('email', record.email)
    console.log('users done')
    if (dbError || dbStripeError) {
      console.log(dbError)
      return sendRes({ message: dbError }, 400)
    }
    return sendRes()
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
