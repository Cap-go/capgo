import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../utils/hono.ts'
import { supabaseApikey } from '../../utils/supabase.ts'

const bodySchema = z.object({
  name: z.string().check(z.minLength(3)),
  email: z.optional(z.email()),
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
  const newOrg = { name: body.name, created_by: apikey.user_id, management_email: body.email ?? self.email ?? '' }
  const { error: errorOrg } = await supabase
    .from('orgs')
    .insert(newOrg)

  if (errorOrg) {
    throw simpleError('cannot_create_org', 'Cannot create org', { error: errorOrg?.message })
  }
  // Read the created org - the insert trigger creates org_users so RLS should allow access
  const { data: dataOrg, error: errorOrg2 } = await supabase
    .from('orgs')
    .select('id')
    .eq('created_by', apikey.user_id)
    .eq('name', body.name)
    .single()
  if (errorOrg2 || !dataOrg) {
    throw simpleError('cannot_get_org', 'Cannot get created org', { error: errorOrg2?.message })
  }
  return c.json({ status: 'Organization created', id: dataOrg.id }, 200)
}
