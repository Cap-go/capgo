import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendOptionsRes, sendRes } from '../_utils/utils.ts'
import { createCheckout } from '../_utils/stripe.ts'

// FIX: https://github.com/stripe-samples/stripe-node-deno-samples/issues/1
interface PortalData {
  priceId: string
  reccurence: 'month' | 'year'
  successUrl: string
  cancelUrl: string
}
serve(async(event: Request) => {
  console.log('method', event.method)
  if (event.method === 'OPTIONS')
    return sendOptionsRes()
  const supabase = supabaseAdmin
  const authorization = event.headers.get('authorization')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  try {
    const body = (await event.json()) as PortalData
    const { user: auth, error } = await supabase.auth.api.getUser(
      authorization?.split('Bearer ')[1],
    )
    // eslint-disable-next-line no-console
    // console.log('auth', auth)
    if (error || !auth)
      return sendRes({ status: 'not authorize' }, 400)
    // get user from users
    const { data: users, error: dbError } = await supabase
      .from<definitions['users']>('users')
      .select()
      .eq('id', auth.id)
    if (dbError || !users || !users.length)
      return sendRes({ status: 'not authorize' }, 400)
    const user = users[0]
    if (!user.customer_id)
      return sendRes({ status: 'no customer' }, 400)
    // eslint-disable-next-line no-console
    // console.log('user', user)
    // key: string, priceId: string, successUrl: string, cancelUrl: string
    const checkout = await createCheckout(Deno.env.get('STRIPE_SECRET_KEY') || '', user.customer_id, body.reccurence || 'month', body.priceId || 'price_1KkINoGH46eYKnWwwEi97h1B', body.successUrl || 'https://web.capgo.app/app/usage', body.cancelUrl || 'https://web.capgo.app/app/usage')
    return sendRes({ url: checkout.url })
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
