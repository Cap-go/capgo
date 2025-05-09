import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { HTTPError } from 'ky'
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

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  try {
    const body = await c.req.json<PortalData>()
    console.log({ requestId: c.get('requestId'), message: 'post stripe checkout body', body })
    const authorization = c.get('authorization')
    const { data: auth, error } = await supabaseAdmin(c as any).auth.getUser(
      authorization?.split('Bearer ')[1],
    )

    if (!body.orgId)
      return c.json({ status: 'No org_id provided' }, 400)

    if (error || !auth || !auth.user || !auth.user.id)
      return c.json({ status: 'not authorize' }, 400)
    // get user from users
    console.log({ requestId: c.get('requestId'), message: 'auth', auth: auth.user.id })
    const { data: org, error: dbError } = await supabaseAdmin(c as any)
      .from('orgs')
      .select('customer_id')
      .eq('id', body.orgId)
      .single()
    if (dbError || !org)
      return c.json({ status: 'not authorize' }, 400)
    if (!org.customer_id)
      return c.json({ status: 'no customer' }, 400)

    if (!await hasOrgRight(c as any, body.orgId, auth.user.id, 'super_admin'))
      return c.json({ status: 'not authorize (orgs right)' }, 400)

    console.log({ requestId: c.get('requestId'), message: 'user', org })
    const checkout = await createCheckout(c as any, org.customer_id, body.reccurence || 'month', body.priceId || 'price_1KkINoGH46eYKnWwwEi97h1B', body.successUrl || `${getEnv(c as any, 'WEBAPP_URL')}/app/usage`, body.cancelUrl || `${getEnv(c as any, 'WEBAPP_URL')}/app/usage`, body.clientReferenceId)
    return c.json({ url: checkout.url })
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), message: 'error', error })
    if (error instanceof HTTPError) {
      const errorJson = await error.response.json()
      return c.json({ status: 'Cannot get checkout url', error: JSON.stringify(errorJson) }, 500)
    }
    else {
      return c.json({ status: 'Cannot get checkout url', error: JSON.stringify(error) }, 500)
    }
  }
})
