import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { HTTPError } from 'ky'
import { middlewareAuth, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { createPortal } from '../utils/stripe.ts'
import { hasOrgRight, supabaseAdmin } from '../utils/supabase.ts'

interface PortalData {
  callbackUrl: string
  orgId: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const body = await c.req.json<PortalData>()
  cloudlog({ requestId: c.get('requestId'), message: 'post stripe portal body', body })
  const authorization = c.get('authorization')
  const { data: auth, error } = await supabaseAdmin(c).auth.getUser(
    authorization?.split('Bearer ')[1],
  )

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

  cloudlog({ requestId: c.get('requestId'), message: 'org', org })
  const link = await createPortal(c, org.customer_id, body.callbackUrl)
  return c.json({ url: link.url })
})
