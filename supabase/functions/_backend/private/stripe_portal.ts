import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { createPortal } from '../utils/stripe.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface PortalData {
  callbackUrl: string
  orgId: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const body = await parseBody<PortalData>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post stripe portal body', body })

  // Auth context is already set by middlewareAuth
  const auth = c.get('auth')!
  cloudlog({ requestId: c.get('requestId'), message: 'auth', auth: auth.userId })

  const { data: org, error: dbError } = await supabaseAdmin(c)
    .from('orgs')
    .select('customer_id')
    .eq('id', body.orgId)
    .single()
  if (dbError || !org)
    return simpleError('not_authorize', 'Not authorize')
  if (!org.customer_id)
    return simpleError('no_customer', 'No customer')

  if (!await checkPermission(c, 'org.update_billing', { orgId: body.orgId }))
    return simpleError('not_authorize', 'Not authorize')

  cloudlog({ requestId: c.get('requestId'), message: 'org', org })
  const link = await createPortal(c, org.customer_id, body.callbackUrl)
  return c.json({ url: link.url })
})
