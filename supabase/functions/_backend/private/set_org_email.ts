import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { updateCustomerEmail } from '../utils/stripe.ts'
import { supabaseAdmin as useSupabaseAdmin, supabaseClient as useSupabaseClient } from '../utils/supabase.ts'

const bodySchema = z.object({
  emial: z.string().email(),
  org_id: z.string().uuid(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  try {
    const authToken = c.req.header('authorization')

    if (!authToken)
      return c.json({ status: 'not authorize' }, 400)

    const body = await c.req.json<any>()
    const parsedBodyResult = bodySchema.safeParse(body)
    if (!parsedBodyResult.success) {
      cloudlog({ requestId: c.get('requestId'), message: 'set_org_email body', body })
      cloudlog({ requestId: c.get('requestId'), message: 'parsedBodyResult.error', error: parsedBodyResult.error })
      return c.json({ status: 'invalid_json_body' }, 400)
    }

    const safeBody = parsedBodyResult.data

    const supabaseAdmin = await useSupabaseAdmin(c as any)
    const supabaseClient = useSupabaseClient(c as any, authToken)

    const clientData = await supabaseClient.auth.getUser()
    if (!clientData?.data?.user || clientData?.error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get supabase user', error: clientData.error })
      return c.json({ status: 'Cannot get supabase user' }, 500)
    }

    const { data: organization, error: organizationError } = await supabaseAdmin.from('orgs')
      .select('customer_id, management_email')
      .eq('id', safeBody.org_id)
      .single()

    if (!organization || organizationError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get org', error: organizationError })
      return c.json({ status: 'get_org_internal_error' }, 500)
    }

    if (!organization.customer_id) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Organization does not have a customer id', orgId: safeBody.org_id })
      return c.json({ status: 'org_does_not_have_customer' }, 400)
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
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get user right', error: userRight.error })
      return c.json({ status: 'internal_auth_error' }, 500)
    }

    if (!userRight.data) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'No user right', userId, orgId: safeBody.org_id })
      return c.json({ status: 'not_authorized' }, 403)
    }

    await updateCustomerEmail(c as any, organization.customer_id, safeBody.emial)

    // Update supabase
    const { error: updateOrgErr } = await supabaseAdmin.from('orgs')
      .update({ management_email: safeBody.emial })
      .eq('id', safeBody.org_id)

    if (updateOrgErr) {
      // revert stripe
      cloudlogErr({ requestId: c.get('requestId'), message: 'CRITICAL!!! Cannot update supabase, reverting stripe', error: updateOrgErr })
      await updateCustomerEmail(c as any, organization.customer_id, organization.management_email)
      return c.json({ status: 'critical_error' }, 500)
    }

    return c.body(null, 204) // No content
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'set_org_email internal error', error: e })
    return c.json({ status: 'internal_error' }, 500)
  }
})
