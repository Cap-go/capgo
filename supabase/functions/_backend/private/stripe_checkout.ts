import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { createCheckout, createCheckoutForOneOff } from '../utils/stripe.ts'
import { hasOrgRight, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

interface PortalData {
  priceId: string
  clientReferenceId?: string
  reccurence: 'month' | 'year' | 'one_off'
  successUrl: string
  cancelUrl: string
  howMany: number
  orgId: string
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c: Context) => {
  try {
    const body = await c.req.json<PortalData>()
    console.log({ requestId: c.get('requestId'), context: 'post stripe checkout body', body })
    const authorization = c.get('authorization')
    const { data: auth, error } = await supabaseAdmin(c).auth.getUser(
      authorization?.split('Bearer ')[1],
    )

    if (!body.orgId)
      return c.json({ status: 'No org_id provided' }, 400)

    if (error || !auth || !auth.user || !auth.user.id)
      return c.json({ status: 'not authorize' }, 400)
    // get user from users
    console.log({ requestId: c.get('requestId'), context: 'auth', auth: auth.user.id })
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

    console.log({ requestId: c.get('requestId'), context: 'user', org })
    const checkout = !body.howMany ? 
      await createCheckout(c, org.customer_id, body.reccurence || 'month', body.priceId || 'price_1KkINoGH46eYKnWwwEi97h1B', body.successUrl || `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.cancelUrl || `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.clientReferenceId)
      : await createCheckoutForOneOff(c, org.customer_id, body.successUrl || `${getEnv(c, 'WEBAPP_URL')}/dashboard/settings/organization/tokens?thankYou=true`, body.cancelUrl || `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.howMany)
    return c.json({ url: checkout.url })
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'error', error })
    if (error.name === 'HTTPError') {
      const errorJson = await error.response.json()
      return c.json({ status: 'Cannot get checkout url', error: JSON.stringify(errorJson) }, 500)
    }
    else {
      return c.json({ status: 'Cannot get checkout url', error: JSON.stringify(error) }, 500)
    }
  }
})
