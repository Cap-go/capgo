import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { createCheckout } from '../utils/stripe.ts'
import { hasOrgRight, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

interface PortalData {
  priceId: string
  clientReferenceId?: string
  reccurence: 'month' | 'year'
  successUrl: string
  cancelUrl: string
  orgId: string
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c: Context) => {
  try {
    const body = await c.req.json<PortalData>()
    console.log(c.get('requestId'), 'post stripe checkout body', body)
    const authorization = c.get('authorization')
    const { data: auth, error } = await supabaseAdmin(c).auth.getUser(
      authorization?.split('Bearer ')[1],
    )

    if (!body.orgId)
      return c.json({ status: 'No org_id provided' }, 400)

    if (error || !auth || !auth.user || !auth.user.id)
      return c.json({ status: 'not authorize' }, 400)
    // get user from users
    console.log(c.get('requestId'), 'auth', auth.user.id)
    const { data: org, error: dbError } = await supabaseAdmin(c)
      .from('orgs')
      .select('customer_id')
      .eq('id', body.orgId)
      .single()
    if (dbError || !org)
      return c.json({ status: 'not authorize' }, 400)
    if (!org.customer_id)
      return c.json({ status: 'no customer' }, 400)

    if (!await hasOrgRight(c, body.orgId, auth.user.id, 'super_admin'))
      return c.json({ status: 'not authorize (orgs right)' }, 400)

    console.log(c.get('requestId'), 'user', org)
    const checkout = await createCheckout(c, org.customer_id, body.reccurence || 'month', body.priceId || 'price_1KkINoGH46eYKnWwwEi97h1B', body.successUrl || `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.cancelUrl || `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.clientReferenceId)
    return c.json({ url: checkout.url })
  }
  catch (error) {
    console.error(c.get('requestId'), 'error', error)
    if (error.name === 'HTTPError') {
      const errorJson = await error.response.json()
      return c.json({ status: 'Cannot get checkout url', error: JSON.stringify(errorJson) }, 500)
    }
    else {
      return c.json({ status: 'Cannot get checkout url', error: JSON.stringify(error) }, 500)
    }
  }
})
