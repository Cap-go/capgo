import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
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
  const body = await c.req.json<PortalData>()
  cloudlog({ requestId: c.get('requestId'), message: 'post stripe checkout body', body })
  const authorization = c.get('authorization')
  const { data: auth, error } = await supabaseAdmin(c).auth.getUser(
    authorization?.split('Bearer ')[1],
  )

  if (!body.orgId)
    throw simpleError('no_org_id_provided', 'No org_id provided')

  if (error || !auth?.user?.id)
    throw simpleError('not_authorize', 'Not authorize')
    // get user from users
  cloudlog({ requestId: c.get('requestId'), message: 'auth', auth: auth.user.id })
  const { data: org, error: dbError } = await supabaseAdmin(c)
    .from('orgs')
    .select('customer_id')
    .eq('id', body.orgId)
    .single()
  if (dbError || !org)
    throw simpleError('not_authorize', 'Not authorize')
  if (!org.customer_id)
    throw simpleError('no_customer', 'No customer')

  if (!await hasOrgRight(c, body.orgId, auth.user.id, 'super_admin'))
    throw simpleError('not_authorize', 'Not authorize')

  cloudlog({ requestId: c.get('requestId'), message: 'user', org })
  const checkout = await createCheckout(c, org.customer_id, body.reccurence ?? 'month', body.priceId ?? 'price_1KkINoGH46eYKnWwwEi97h1B', body.successUrl ?? `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.cancelUrl ?? `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.clientReferenceId)
  return c.json({ url: checkout.url })
})
