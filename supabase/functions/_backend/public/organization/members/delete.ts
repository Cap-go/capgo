import type { Context } from '@hono/hono'
import type { AuthInfo } from '../../../utils/hono.ts'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { apikeyHasOrgRight, hasOrgRight, hasOrgRightApikey, supabaseAdmin, supabaseApikey } from '../../../utils/supabase.ts'

const deleteBodySchema = z.object({
  orgId: z.string(),
  email: z.string().email(),
})

export async function deleteMember(c: Context, bodyRaw: any, _apikey: Database['public']['Tables']['apikeys']['Row'] | null) {
  const bodyParsed = deleteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    console.error('Invalid body', bodyParsed.error)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  const auth = c.get('auth') as AuthInfo
  if (auth.authType === 'apikey') {
    // For API key auth
    if (!(await hasOrgRightApikey(c, body.orgId, auth.userId, 'admin', auth.apikey!.key)) || !(apikeyHasOrgRight(auth.apikey!, body.orgId))) {
      console.error('You can\'t access this organization', body.orgId)
      return c.json({ status: 'You can\'t access this organization', orgId: body.orgId, error: 'Insufficient permissions or invalid organization ID' }, 400)
    }
  }
  else {
    // For JWT auth
    if (!(await hasOrgRight(c, body.orgId, auth.userId, 'admin'))) {
      console.error('You can\'t access this organization', body.orgId)
      return c.json({ status: 'You can\'t access this organization', orgId: body.orgId, error: 'Insufficient permissions or invalid organization ID' }, 400)
    }
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

  const supabase = auth.authType === 'apikey'
    ? supabaseApikey(c, auth.apikey!.key)
    : supabaseAdmin(c)

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
