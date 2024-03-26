import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { createPortal } from '../utils/stripe.ts'

interface PortalData {
  callbackUrl: string
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

    if (error || !auth || !auth.user)
      return c.json({ status: 'not authorize' }, 400)
    // get user from users
    console.log('auth', auth.user.id)
    const { data: user, error: dbError } = await supabaseAdmin(c)
      .from('users')
      .select()
      .eq('id', auth.user.id)
      .single()
    if (dbError || !user)
      return c.json({ status: 'not authorize' }, 400)
    if (!user.customer_id)
      return c.json({ status: 'no customer' }, 400)

    console.log('user', user)
    const link = await createPortal(c, user.customer_id, body.callbackUrl)
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
