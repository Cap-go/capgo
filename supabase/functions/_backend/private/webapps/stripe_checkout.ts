import { Hono } from 'hono'
import type { Context } from 'hono'
import { middlewareAuth, useCors } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { createCheckout } from '../../utils/stripe.ts'
import { getEnv } from '../../utils/utils.ts'

interface PortalData {
  priceId: string
  clientReferenceId?: string
  reccurence: 'month' | 'year'
  successUrl: string
  cancelUrl: string
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c: Context) => {
  try {
    const body = await c.req.json<PortalData>()
    console.log('body', body)
    const authorization = c.get('authorization')
    const { data: auth, error } = await supabaseAdmin(c).auth.getUser(
      authorization?.split('Bearer ')[1],
    )

    if (error || !auth || !auth.user)
      return c.json({ status: 'not authorize' }, 400)
    // get user from users
    console.log('auth', auth.user.id)
    const { data: user, error: dbError } = await supabaseAdmin(c)
      .from('users')
      .select()
      .eq('id', auth.user.id)
      .single()
    if (dbError || !user)
      return c.json({ status: 'not authorize' }, 400)
    if (!user.customer_id)
      return c.json({ status: 'no customer' }, 400)

    console.log('user', user)
    const checkout = await createCheckout(c, user.customer_id, body.reccurence || 'month', body.priceId || 'price_1KkINoGH46eYKnWwwEi97h1B', body.successUrl || `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.cancelUrl || `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.clientReferenceId)
    return c.json({ url: checkout.url })
  }
  catch (e) {
    return c.json({ status: 'Cannot get upload link', error: JSON.stringify(e) }, 500)
  }
})
