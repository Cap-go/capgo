import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod'
import { supabaseAdmin } from '../../utils/supabase.ts'

const bodySchema = z.object({
  name: z.string(),
})
export async function post(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  const body = bodyParsed.data
  const userId = apikey.user_id
  const { data, error } = await supabaseAdmin(c).from('users').select('*').eq('id', userId).single()
  if (error)
    return c.json({ status: 'Cannot get user', error: error.message }, 500)

  const { error: errorOrg } = await supabaseAdmin(c)
    .from('orgs')
    .insert({
      name: body.name,
      created_by: userId,
      management_email: data.email,
    })

  if (errorOrg) {
    console.error('Error when creating org', errorOrg)
    return c.json({ status: 'Cannot create org', error: errorOrg.message }, 500)
  }
  return c.json({ status: 'Organization created', id: data.id }, 200)
}
