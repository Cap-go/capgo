import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { middlewareAuth, simpleError, useCors } from '../utils/hono.ts'
import { updateCustomerEmail } from '../utils/stripe.ts'
import { supabaseAdmin as useSupabaseAdmin, supabaseClient as useSupabaseClient } from '../utils/supabase.ts'

const bodySchema = z.object({
  emial: z.string().email(),
  org_id: z.string().uuid(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const authToken = c.req.header('authorization')

  if (!authToken)
    throw simpleError('not_authorize', 'Not authorize')

  const body = await c.req.json<any>()
    .catch((e) => {
      throw simpleError('invalid_json_body', 'Invalid JSON body', { e })
    })
  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid json body', { body, parsedBodyResult })
  }

  const safeBody = parsedBodyResult.data

  const supabaseAdmin = await useSupabaseAdmin(c)
  const supabaseClient = useSupabaseClient(c, authToken)

  const clientData = await supabaseClient.auth.getUser()
  if (!clientData?.data?.user || clientData?.error) {
    throw simpleError('cannot_get_supabase_user', 'Cannot get supabase user', { clientData })
  }

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

  const userId = clientData.data.user.id

  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'super_admin',
    org_id: safeBody.org_id,
    user_id: userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error) {
    throw simpleError('internal_auth_error', 'Internal auth error', { userRight })
  }

  if (!userRight.data) {
    throw simpleError('not_authorized', 'Not authorized', { userId, orgId: safeBody.org_id })
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
