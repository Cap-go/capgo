import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { createPortal } from '../utils/stripe.ts'
import { supabaseClient } from '../utils/supabase.ts'

interface PortalData {
  callbackUrl: string
  orgId: string
}

function getPortalRequestLogMetadata(body: PortalData) {
  return {
    hasCallbackUrl: Boolean(body.callbackUrl),
    hasOrgId: Boolean(body.orgId),
  }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const body = await parseBody<PortalData>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post stripe portal request', request: getPortalRequestLogMetadata(body) })
  const authorization = c.get('authorization')
  if (!authorization)
    throw simpleError('not_authorized', 'Not authorized')

  // Use authenticated client - RLS will enforce access based on JWT
  const supabase = supabaseClient(c, authorization)

  // Get current user ID from JWT
  const authContext = c.get('auth')
  if (!authContext?.userId)
    throw simpleError('not_authorized', 'Not authorized')

  cloudlog({ requestId: c.get('requestId'), message: 'stripe portal auth context', auth: { authenticated: true } })
  const { data: org, error: dbError } = await supabase
    .from('orgs')
    .select('customer_id')
    .eq('id', body.orgId)
    .single()
  if (dbError || !org)
    throw simpleError('not_authorized', 'Not authorized')
  if (!org.customer_id)
    throw simpleError('no_customer', 'No customer')

  if (!await checkPermission(c, 'org.update_billing', { orgId: body.orgId }))
    throw simpleError('not_authorize', 'Not authorize')

  cloudlog({ requestId: c.get('requestId'), message: 'stripe portal org lookup result', org: { found: true, hasCustomerId: Boolean(org.customer_id) } })
  const link = await createPortal(c, org.customer_id, body.callbackUrl)
  return c.json({ url: link.url })
})
