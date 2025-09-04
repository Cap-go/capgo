import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../utils/hono.ts'
import { supabaseApikey } from '../../utils/supabase.ts'

const bodySchema = z.object({
  name: z.string().check(z.minLength(3)),
})

export async function post(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  const supabase = supabaseApikey(c, apikey.key)
  const { data: self, error: userErr } = await supabase.from('users').select('email').eq('id', apikey.user_id).single()
  if (userErr || !self?.email) {
    throw simpleError('cannot_get_user', 'Cannot get user', { error: userErr?.message })
  }
  const { data: dataOrg, error: errorOrg } = await supabase
    .from('orgs')
    .insert({ name: body.name, created_by: apikey.user_id, management_email: self.email })
    .select('id')
    .single()
  if (errorOrg || !dataOrg?.id) {
    throw simpleError('cannot_create_org', 'Cannot create org', { error: errorOrg?.message })
  }
  return c.json({ status: 'Organization created', id: dataOrg.id }, 200)
}
