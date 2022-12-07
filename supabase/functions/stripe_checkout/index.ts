import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { sendOptionsRes, sendRes } from '../_utils/utils.ts'
import { createCheckout } from '../_utils/stripe.ts'

// FIX: https://github.com/stripe-samples/stripe-node-deno-samples/issues/1
interface PortalData {
  priceId: string
  reccurence: 'month' | 'year'
  successUrl: string
  cancelUrl: string
}
serve(async (event: Request) => {
  console.log('method', event.method)
  if (event.method === 'OPTIONS')
    return sendOptionsRes()
  const authorization = event.headers.get('authorization')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  try {
    console.log('body')
    const body = (await event.json()) as PortalData
    console.log('body', body)
    console.log('auth')
    const { data: auth, error } = await supabaseAdmin().auth.getUser(
      authorization?.split('Bearer ')[1],
    )
    // console.log('auth', auth)
    if (error || !auth || !auth.user)
      return sendRes({ status: 'not authorize' }, 400)
    console.log('auth done', auth.user?.id)
    // get user from users
    const { data: user, error: dbError } = await supabaseAdmin()
      .from('users')
      .select()
      .eq('id', auth.user.id)
      .single()
    if (dbError || !user)
      return sendRes({ status: 'not authorize' }, 400)
    if (!user.customer_id)
      return sendRes({ status: 'no customer' }, 400)
    console.log('createCheckout', user.id, body.priceId)

    // console.log('user', user)
    // key: string, priceId: string, successUrl: string, cancelUrl: string
    const checkout = await createCheckout(user.customer_id, body.reccurence || 'month', body.priceId || 'price_1KkINoGH46eYKnWwwEi97h1B', body.successUrl || `${Deno.env.get('WEBAPP_URL')}/app/usage`, body.cancelUrl || `${Deno.env.get('WEBAPP_URL')}/app/usage`)
    return sendRes({ url: checkout.url })
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
