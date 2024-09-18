import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { createPortal } from '../utils/stripe.ts'
import { hasOrgRight, supabaseAdmin } from '../utils/supabase.ts'

interface PortalData {
  callbackUrl: string
  orgId: string
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c: Context) => {
  try {
    const body = await c.req.json<PortalData>()
    console.log('body', body)
    const authorization = c.get('authorization')
    const { data: auth, error } = await supabaseAdmin(c).auth.getUser(
      authorization?.split('Bearer ')[1],
    )

    if (error || !auth || !auth.user || !auth.user.id)
      return c.json({ status: 'not authorize' }, 400)
    // get user from users
    console.log('auth', auth.user.id)
    const { data: org, error: dbError } = await supabaseAdmin(c)
      .from('orgs')
      .select('customer_id')
      .eq('id', body.orgId)
      .single()
    if (dbError || !org)
      return c.json({ status: 'not authorize' }, 400)
    if (!org.customer_id)
      return c.json({ status: 'no customer' }, 400)

    if (!await hasOrgRight(c, body.orgId, auth.user.id, 'super_admin'))
      return c.json({ status: 'not authorize (orgs right)' }, 400)

    console.log('org', org)
    const link = await createPortal(c, org.customer_id, body.callbackUrl)
    return c.json({ url: link.url })
  }
  catch (error) {
    if (error.name === 'HTTPError') {
      const errorJson = await error.response.json()
      return c.json({ status: 'Cannot get portal url', error: JSON.stringify(errorJson) }, 500)
    }
    else {
      return c.json({ status: 'Cannot get portal url', error: JSON.stringify(error) }, 500)
    }
  }
})
