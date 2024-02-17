import { serve } from 'https://deno.land/std@0.216.0/http/server.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { methodJson, sendOptionsRes, sendRes } from '../_utils/utils.ts'
import { emptySupabase, supabaseAdmin as useSupabaseAdmin, supabaseClient as useSupabaseClient } from '../_utils/supabase.ts'

const bodySchema = z.object({
  user_id: z.string(),
})

async function main(_url: URL, headers: BaseHeaders, method: string, body: any) {
  if (method === 'OPTIONS')
    return sendOptionsRes()
  const authToken = headers.authorization

  if (!authToken)
    return sendRes({ error: 'no_authorization_header' }, 400)

  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    console.log(body)
    console.log(parsedBodyResult.error)
    return sendRes({ error: 'invalid_json_body' }, 400)
  }

  const supabaseAdmin = await useSupabaseAdmin()
  const supabaseClient = useSupabaseClient(authToken)

  const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_admin')
  if (adminError) {
    console.error('is_admin_error', adminError)
    return sendRes({ error: 'is_admin_error' }, 500)
  }

  if (!isAdmin)
    return sendRes({ error: 'not_admin' }, 401)

  const user_id = parsedBodyResult.data.user_id

  const { data: userData, count: _userCount, error: userError } = await supabaseAdmin.from('users')
    .select('email', { count: 'exact' })
    .eq('id', user_id)
    .single()

  if (userError) {
    console.error(JSON.stringify(userError))
    return sendRes({ error: 'user_does_not_exist' }, 400)
  }

  const userEmail = userData?.email

  const { data: magicLink, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  })

  if (magicError) {
    console.error(JSON.stringify(magicError))
    return sendRes({ error: 'generate_magic_link_error' }, 500)
  }

  const tmpSupabaseClient = emptySupabase()
  const { data: authData, error: authError } = await tmpSupabaseClient.auth.verifyOtp({ token_hash: magicLink.properties.hashed_token, type: 'email' })

  if (authError) {
    console.error(JSON.stringify(authError))
    return sendRes({ error: 'auth_error' }, 500)
  }

  const jwt = authData.session?.access_token
  const refreshToken = authData.session?.refresh_token

  if (!jwt) {
    console.error('No JWT?', authData)
    return sendRes({ error: 'no_jwt' }, 500)
  }

  return sendRes({ jwt, refreshToken })
}

// await supabase.auth.verifyOtp({ token_hash: responseJson.token, type: 'email'})
serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
