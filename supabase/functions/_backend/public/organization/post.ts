import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod'
import { cloudlogErr } from '../../utils/loggin.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

const bodySchema = z.object({
  name: z.string(),
})

export async function post(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Invalid body', error: bodyParsed.error })
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  const userId = apikey.user_id
  const { data, error } = await supabaseAdmin(c).from('users').select('*').eq('id', userId).single()
  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get user', error })
    return c.json({ status: 'Cannot get user', error: error.message }, 500)
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error when creating org', error: errorOrg })
    return c.json({ status: 'Cannot create org', error: errorOrg.message }, 500)
  }
  return c.json({ status: 'Organization created', id: dataOrg.id }, 200)
}
