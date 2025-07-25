import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/v4-mini'
import { middlewareV2, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { updateCustomerEmail } from '../utils/stripe.ts'
import { supabaseAdmin as useSupabaseAdmin } from '../utils/supabase.ts'

const bodySchema = z.object({
  emial: z.email(),
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

  const supabaseAdmin = await useSupabaseAdmin(c)

  const { data: organization, error: organizationError } = await supabaseAdmin.from('orgs')
    .select('customer_id, management_email')
    .eq('id', safeBody.org_id)
    .single()

  if (!organization || organizationError) {
    throw simpleError('get_org_internal_error', 'Get org internal error', { organizationError })
  }

  if (!organization.customer_id) {
    throw simpleError('org_does_not_have_customer', 'Organization does not have a customer id', { orgId: safeBody.org_id })
  }

  const userRight = await supabaseAdmin.rpc('check_min_rights', {
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
    throw quickError(401, 'not_authorized', 'Not authorized', { userId: auth.userId, orgId: safeBody.org_id })
  }

  await updateCustomerEmail(c, organization.customer_id, safeBody.emial)

  // Update supabase
  const { error: updateOrgErr } = await supabaseAdmin.from('orgs')
    .update({ management_email: safeBody.emial })
    .eq('id', safeBody.org_id)

  if (updateOrgErr) {
    // revert stripe
    await updateCustomerEmail(c, organization.customer_id, organization.management_email)
    throw simpleError('critical_error', 'Critical error', { updateOrgErr })
  }

  return c.body(null, 204) // No content
})
