import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { middlewareAuth, simpleError, useCors } from '../utils/hono.ts'
import { emptySupabase, supabaseAdmin as useSupabaseAdmin, supabaseClient as useSupabaseClient } from '../utils/supabase.ts'

const bodySchema = z.object({
  user_id: z.string().uuid(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const authToken = c.req.header('authorization')

  if (!authToken)
    throw simpleError('not_authorize', 'Not authorize')

  const body = await c.req.json<any>()
    .catch((e) => {
      throw simpleError('invalid_json_parse_body', 'Invalid JSON body', { e })
    })
  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid json body', { body, parsedBodyResult })
  }

  const supabaseAdmin = await useSupabaseAdmin(c)
  const supabaseClient = useSupabaseClient(c, authToken)

  const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_admin')
  if (adminError) {
    throw simpleError('is_admin_error', 'Is admin error', { adminError })
  }

  if (!isAdmin)
    throw simpleError('not_admin', 'Not admin')

  const user_id = parsedBodyResult.data.user_id

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id)

  if (userError || !userData?.user?.email) {
    throw simpleError('user_does_not_exist', 'User does not exist', { userError })
  }

  const userEmail = userData?.user?.email

  const { data: magicLink, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  })

  if (magicError) {
    throw simpleError('generate_magic_link_error', 'Generate magic link error', { magicError })
  }

  const tmpSupabaseClient = emptySupabase(c)
  const { data: authData, error: authError } = await tmpSupabaseClient.auth.verifyOtp({ token_hash: magicLink.properties.hashed_token, type: 'email' })

  if (authError) {
    throw simpleError('auth_error', 'Auth error', { authError })
  }

  const jwt = authData.session?.access_token
  const refreshToken = authData.session?.refresh_token

  if (!jwt) {
    throw simpleError('no_jwt', 'No jwt', { authData })
  }

  return c.json({ jwt, refreshToken })
})
