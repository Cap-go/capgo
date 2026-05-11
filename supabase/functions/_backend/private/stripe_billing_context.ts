import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { supabaseClient } from '../utils/supabase.ts'

type AppContext = Context<MiddlewareKeyVariables, any, any>
type StripeBillingArea = 'checkout' | 'portal'

export async function resolveStripeBillingCustomer(
  c: AppContext,
  area: StripeBillingArea,
  orgId: string,
) {
  const authorization = c.get('authorization')
  if (!authorization)
    throw simpleError('not_authorized', 'Not authorized')

  const authContext = c.get('auth')
  if (!authContext?.userId)
    throw simpleError('not_authorized', 'Not authorized')

  const supabase = supabaseClient(c, authorization)

  cloudlog({ requestId: c.get('requestId'), message: `stripe ${area} auth context`, auth: { authenticated: true } })
  const { data: org, error: dbError } = await supabase
    .from('orgs')
    .select('customer_id')
    .eq('id', orgId)
    .single()
  if (dbError || !org)
    throw simpleError('not_authorized', 'Not authorized')
  if (!org.customer_id)
    throw simpleError('no_customer', 'No customer')

  if (!await checkPermission(c, 'org.update_billing', { orgId }))
    throw simpleError('not_authorize', 'Not authorize')

  cloudlog({ requestId: c.get('requestId'), message: `stripe ${area} org lookup result`, org: { found: true, hasCustomerId: Boolean(org.customer_id) } })
  return org.customer_id
}
