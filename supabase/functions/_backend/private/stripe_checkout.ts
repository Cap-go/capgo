import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { createCheckout } from '../utils/stripe.ts'
import { hasOrgRight, supabaseClient } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

interface CheckoutData {
  priceId: string
  clientReferenceId?: string
  recurrence: 'month' | 'year'
  attributionId?: string
  successUrl: string
  cancelUrl: string
  orgId: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const body = await parseBody<CheckoutData>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post stripe checkout body', body })

  if (!body.orgId)
    return simpleError('no_org_id_provided', 'No org_id provided')

  const authorization = c.get('authorization')
  if (!authorization)
    return simpleError('not_authorize', 'Not authorize')

  // Use authenticated client - RLS will enforce access based on JWT
  const supabase = supabaseClient(c, authorization)

  // Get current user ID from JWT
  const { data: auth, error } = await supabase.auth.getUser()
  if (error || !auth?.user?.id)
    return simpleError('not_authorize', 'Not authorize')

  cloudlog({ requestId: c.get('requestId'), message: 'auth', auth: auth.user.id })
  const { data: org, error: dbError } = await supabase
    .from('orgs')
    .select('customer_id')
    .eq('id', body.orgId)
    .single()
  if (dbError || !org)
    return simpleError('not_authorize', 'Not authorize')
  if (!org.customer_id)
    return simpleError('no_customer', 'No customer')

  if (!await hasOrgRight(c, body.orgId, auth.user.id, 'super_admin'))
    return simpleError('not_authorize', 'Not authorize')

  cloudlog({ requestId: c.get('requestId'), message: 'user', org })
  const checkout = await createCheckout(c, org.customer_id, body.recurrence ?? 'month', body.priceId ?? 'price_1KkINoGH46eYKnWwwEi97h1B', body.successUrl ?? `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.cancelUrl ?? `${getEnv(c, 'WEBAPP_URL')}/app/usage`, body.clientReferenceId, body.attributionId)
  return c.json({ url: checkout.url })
})
