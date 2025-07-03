import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod'
import { simpleError } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

const bodySchema = z.object({
  name: z.string(),
})

export async function post(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  const userId = apikey.user_id
  const { data, error } = await supabaseAdmin(c).from('users').select('*').eq('id', userId).single()
  if (error) {
    throw simpleError('cannot_get_user', 'Cannot get user', { error: error.message })
  }

  const { data: dataOrg, error: errorOrg } = await supabaseAdmin(c)
    .from('orgs')
    .insert({
      name: body.name,
      created_by: userId,
      management_email: data.email,
    })
    .select()
    .single()

  if (errorOrg) {
    throw simpleError('cannot_create_org', 'Cannot create org', { error: errorOrg.message })
  }
  return c.json({ status: 'Organization created', id: dataOrg.id }, 200)
}
