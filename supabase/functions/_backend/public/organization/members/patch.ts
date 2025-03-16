import type { Context } from '@hono/hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseAdmin, supabaseApikey } from '../../../utils/supabase.ts'

const updateBodySchema = z.object({
  orgId: z.string(),
  email: z.string().email(),
  user_right: z.enum([
    'read',
    'upload',
    'write',
    'admin',
    'super_admin',
    'invite_read',
    'invite_upload',
    'invite_write',
    'invite_admin',
    'invite_super_admin',
  ]),
})

export async function patch(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = updateBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    console.error('Invalid body', bodyParsed.error)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    console.error('You can\'t access this organization', body.orgId)
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId, error: 'Insufficient permissions or invalid organization ID' }, 400)
  }

  const { data: userData, error: userError } = await supabaseAdmin(c)
    .from('users')
    .select('id')
    .eq('email', body.email)
    .single()

  if (userError || !userData) {
    console.error('User not found', userError)
    return c.json({ status: 'User not found', error: userError }, 400)
  }

  const supabase = supabaseApikey(c, c.get('capgkey') as string)
  const { error } = await supabase
    .from('org_users')
    .update({ user_right: body.user_right })
    .eq('user_id', userData.id)
    .eq('org_id', body.orgId)

  if (error) {
    console.error('Error updating user permission in organization', error)
    return c.json({ error, status: 'KO' }, 400)
  }
  console.log('User permission updated in organization', userData.id, body.orgId, body.user_right)
  return c.json({ status: 'OK' }, 200)
}
