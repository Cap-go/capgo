import type { Context } from '@hono/hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { hasOrgRight, supabaseAdmin, supabaseApikey } from '../../../utils/supabase.ts'

const deleteBodySchema = z.object({
  orgId: z.string(),
  email: z.string().email(),
})

export async function deleteMember(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = deleteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  const body = bodyParsed.data

  if (!(await hasOrgRight(c, body.orgId, apikey.user_id, 'read')))
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)

  const { data: userData, error: userError } = await supabaseAdmin(c)
    .from('users')
    .select('id')
    .eq('email', body.email)
    .single()

  if (userError || !userData)
    return c.json({ status: 'User not found', error: userError }, 400)

  const supabase = supabaseApikey(c, c.get('capgkey') as string)
  console.log(userData.id, body.orgId)
  const { error } = await supabase
    .from('org_users')
    .delete()
    .eq('user_id', userData.id)
    .eq('org_id', body.orgId)

  if (!error)
    return c.json({ status: 'OK' }, 200)
  return c.json({ error, status: 'KO' }, 400)
}
