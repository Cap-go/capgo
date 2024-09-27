import { Hono } from 'hono/tiny'

import { z } from 'zod'
import type { Context } from '@hono/hono'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { emptySupabase, supabaseAdmin as useSupabaseAdmin, supabaseClient as useSupabaseClient } from '../utils/supabase.ts'

const bodySchema = z.object({
  user_id: z.string(),
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
      console.log({ requestId: c.get('requestId'), context: 'log_as body', body })
      console.log({ requestId: c.get('requestId'), context: 'log_as parsedBodyResult.error', error: parsedBodyResult.error })
      return c.json({ status: 'invalid_json_body' }, 400)
    }

    const supabaseAdmin = await useSupabaseAdmin(c)
    const supabaseClient = useSupabaseClient(c, authToken)

    const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_admin')
    if (adminError) {
      console.error({ requestId: c.get('requestId'), context: 'is_admin_error', error: adminError })
      return c.json({ error: 'is_admin_error' }, 500)
    }

    if (!isAdmin)
      return c.json({ error: 'not_admin' }, 401)

    const user_id = parsedBodyResult.data.user_id

    const { data: userData, count: _userCount, error: userError } = await supabaseAdmin.from('users')
      .select('email', { count: 'exact' })
      .eq('id', user_id)
      .single()

    if (userError) {
      console.error({ requestId: c.get('requestId'), context: 'user_does_not_exist', error: userError })
      return c.json({ error: 'user_does_not_exist' }, 400)
    }

    const userEmail = userData?.email

    const { data: magicLink, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    })

    if (magicError) {
      console.error({ requestId: c.get('requestId'), context: 'generate_magic_link_error', error: magicError })
      return c.json({ error: 'generate_magic_link_error' }, 500)
    }

    const tmpSupabaseClient = emptySupabase(c)
    const { data: authData, error: authError } = await tmpSupabaseClient.auth.verifyOtp({ token_hash: magicLink.properties.hashed_token, type: 'email' })

    if (authError) {
      console.error({ requestId: c.get('requestId'), context: 'auth_error', error: authError })
      return c.json({ error: 'auth_error' }, 500)
    }

    const jwt = authData.session?.access_token
    const refreshToken = authData.session?.refresh_token

    if (!jwt) {
      console.error({ requestId: c.get('requestId'), context: 'no_jwt', authData })
      return c.json({ error: 'no_jwt' }, 500)
    }

    return c.json({ jwt, refreshToken })
  }
  catch (e) {
    return c.json({ status: 'Cannot log as', error: JSON.stringify(e) }, 500)
  }
})
