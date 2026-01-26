import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { BRES, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { updateCustomerEmail } from '../utils/stripe.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'

const bodySchema = z.object({
  email: z.email(),
  org_id: z.uuid(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!

  const body = await parseBody<any>(c)
  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid json body', { body, parsedBodyResult })
  }

  const safeBody = parsedBodyResult.data

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseWithAuth(c, auth)
  if (supabase instanceof Response) {
    return supabase
  }

  const { data: organization, error: organizationError } = await supabase.from('orgs')
    .select('customer_id, management_email')
    .eq('id', safeBody.org_id)
    .maybeSingle()

  if (organizationError) {
    return quickError(500, 'internal_error', 'Failed to fetch organization', { orgId: safeBody.org_id, organizationError })
  }

  if (!organization) {
    throw simpleError('org_not_found', 'Organization not found', { orgId: safeBody.org_id })
  }

  if (!organization.customer_id) {
    throw simpleError('org_does_not_have_customer', 'Organization does not have a customer id', { orgId: safeBody.org_id })
  }

  const userRight = await supabase.rpc('check_min_rights', {
    min_right: 'super_admin',
    org_id: safeBody.org_id,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error) {
    throw simpleError('internal_auth_error', 'Internal auth error', { userRight })
  }

  if (!userRight.data) {
    return quickError(401, 'not_authorized', 'Not authorized', { userId: auth.userId, orgId: safeBody.org_id })
  }

  await updateCustomerEmail(c, organization.customer_id, safeBody.email)

  // Update supabase
  const { error: updateOrgErr } = await supabase.from('orgs')
    .update({ management_email: safeBody.email })
    .eq('id', safeBody.org_id)

  if (updateOrgErr) {
    // revert stripe
    await updateCustomerEmail(c, organization.customer_id, organization.management_email)
    throw simpleError('critical_error', 'Critical error', { updateOrgErr })
  }

  return c.json(BRES)
})
