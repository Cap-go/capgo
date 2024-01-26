import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { z } from 'https://deno.land/x/zod@v3.22.2/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { middlewareKey } from '../../_utils/hono.ts'
import { emptySupabase } from '../../_utils/supabase.ts'
import { supabaseClient as useSupabaseClient, supabaseAdmin as useSupabaseAdmin } from '../../_utils/supabase.ts'

const bodySchema = z.object({
  user_id: z.string(),
})


export const app = new Hono()

app.post('/', middlewareKey, async (c: Context) => {
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

    const supabaseAdmin = await useSupabaseAdmin(c)
    const supabaseClient = useSupabaseClient(c, authToken)

    const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_admin')
    if (adminError) {
      console.error('is_admin_error', adminError)
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
      console.error(JSON.stringify(userError))
      return c.json({ error: 'user_does_not_exist' }, 400)
    }

    const userEmail = userData?.email

    const { data: magicLink, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    })

    if (magicError) {
      console.error(JSON.stringify(magicError))
      return c.json({ error: 'generate_magic_link_error' }, 500)
    }

    const tmpSupabaseClient = emptySupabase(c)
    const { data: authData, error: authError } = await tmpSupabaseClient.auth.verifyOtp({ token_hash: magicLink.properties.hashed_token, type: 'email' })

    if (authError) {
      console.error(JSON.stringify(authError))
      return c.json({ error: 'auth_error' }, 500)
    }

    const jwt = authData.session?.access_token
    const refreshToken = authData.session?.refresh_token

    if (!jwt) {
      console.error('No JWT?', authData)
      return c.json({ error: 'no_jwt' }, 500)
    }

    return c.json({ jwt, refreshToken })
  } catch (e) {
    return c.json({ status: 'Cannot log as', error: JSON.stringify(e) }, 500) 
  }
})
