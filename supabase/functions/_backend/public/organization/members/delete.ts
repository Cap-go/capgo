import type { Context } from '@hono/hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseApikey } from '../../../utils/supabase.ts'

const deleteBodySchema = z.object({
  orgId: z.string(),
  email: z.string().email(),
})

export async function deleteMember(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = deleteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    console.error('Invalid body', bodyParsed.error)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    console.error('You can\'t access this organization', body.orgId)
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)
  }

  const { data: userData, error: userError } = await supabaseApikey(c, apikey.key)
    .from('users')
    .select('id')
    .eq('email', body.email)
    .single()

  if (userError || !userData) {
    console.error('User not found', userError)
    return c.json({ status: 'User not found', error: userError }, 400)
  }

  const supabase = supabaseApikey(c, c.get('capgkey') as string)
  console.log(userData.id, body.orgId)
  const { error } = await supabase
    .from('org_users')
    .delete()
    .eq('user_id', userData.id)
    .eq('org_id', body.orgId)

  if (error) {
    console.error('Error deleting user from organization', error)
    return c.json({ error, status: 'KO' }, 400)
  }
  console.log('User deleted from organization', userData.id, body.orgId)
  return c.json({ status: 'OK' }, 200)
}
