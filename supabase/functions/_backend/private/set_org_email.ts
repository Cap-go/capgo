import { Hono } from 'hono/tiny'

import { z } from 'zod'
import type { Context } from '@hono/hono'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { updateCustomerEmail } from '../utils/stripe.ts'
import { supabaseAdmin as useSupabaseAdmin, supabaseClient as useSupabaseClient } from '../utils/supabase.ts'

const bodySchema = z.object({
  emial: z.string().email(),
  org_id: z.string().uuid(),
})

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c: Context) => {
  try {
    const authToken = c.req.header('authorization')

    if (!authToken)
      return c.json({ status: 'not authorize' }, 400)

    const body = await c.req.json<any>()
    const parsedBodyResult = bodySchema.safeParse(body)
    if (!parsedBodyResult.success) {
      console.log(body)
      console.log(parsedBodyResult.error)
      return c.json({ status: 'invalid_json_body' }, 400)
    }

    const safeBody = parsedBodyResult.data

    const supabaseAdmin = await useSupabaseAdmin(c)
    const supabaseClient = useSupabaseClient(c, authToken)

    const clientData = await supabaseClient.auth.getUser()
    if (!clientData || !clientData.data || clientData.error) {
      console.error('Cannot get supabase user', clientData.error)
      return c.json({ status: 'Cannot get supabase user' }, 500)
    }

    const { data: organization, error: organizationError } = await supabaseAdmin.from('orgs')
      .select('customer_id, management_email')
      .eq('id', safeBody.org_id)
      .single()

    if (!organization || organizationError) {
      console.error('Cannot get org', organizationError)
      return c.json({ status: 'get_org_internal_error' }, 500)
    }

    if (!organization.customer_id) {
      console.error('Organization does not have a customer id', safeBody.org_id)
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
      console.error('Cannot get user right', userRight.error)
      return c.json({ status: 'internal_auth_error' }, 500)
    }

    if (!userRight.data) {
      console.error('No user right', userId, safeBody.org_id)
      return c.json({ status: 'not_authorized' }, 403)
    }

    await updateCustomerEmail(c, organization.customer_id, safeBody.emial)

    // Update supabase
    const { error: updateOrgErr } = await supabaseAdmin.from('orgs')
      .update({ management_email: safeBody.emial })
      .eq('id', safeBody.org_id)

    if (updateOrgErr) {
      // revert stripe
      console.error('CRITICAL!!! Cannot update supabase, reverting stripe', updateOrgErr)
      await updateCustomerEmail(c, organization.customer_id, organization.management_email)
      return c.json({ status: 'critical_error' }, 500)
    }

    return c.body(null, 204) // No content
  }
  catch (e) {
    console.error(e)
    return c.json({ status: 'internal_error' }, 500)
  }
})
