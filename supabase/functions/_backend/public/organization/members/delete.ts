import type { Context } from '@hono/hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { cloudlog, cloudlogErr } from '../../../utils/loggin.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseAdmin, supabaseApikey } from '../../../utils/supabase.ts'

const deleteBodySchema = z.object({
  orgId: z.string(),
  email: z.string().email(),
})

export async function deleteMember(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = deleteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Invalid body', error: bodyParsed.error })
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'You can\'t access this organization', org_id: body.orgId })
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)
  }

  const { data: userData, error: userError } = await supabaseAdmin(c)
    .from('users')
    .select('id')
    .eq('email', body.email)
    .single()

  if (userError || !userData) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'User not found', error: userError })
    return c.json({ status: 'User not found', error: userError }, 400)
  }

  const supabase = supabaseApikey(c, c.get('capgkey') as string)
  cloudlog({ requestId: c.get('requestId'), message: 'userData.id', data: userData.id })
  cloudlog({ requestId: c.get('requestId'), message: 'body.orgId', data: body.orgId })
  const { error } = await supabase
    .from('org_users')
    .delete()
    .eq('user_id', userData.id)
    .eq('org_id', body.orgId)

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error deleting user from organization', error })
    return c.json({ error, status: 'KO' }, 400)
  }
  cloudlog({ requestId: c.get('requestId'), message: 'User deleted from organization', data: { user_id: userData.id, org_id: body.orgId } })
  return c.json({ status: 'OK' }, 200)
}
