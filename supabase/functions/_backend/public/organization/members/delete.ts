import type { Context } from 'hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod'
import { quickError, simpleError } from '../../../utils/hono.ts'
import { cloudlog } from '../../../utils/loggin.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseAdmin, supabaseApikey } from '../../../utils/supabase.ts'

const deleteBodySchema = z.object({
  orgId: z.string(),
  email: z.string().email(),
})

export async function deleteMember(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = deleteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  const { data: userData, error: userError } = await supabaseAdmin(c)
    .from('users')
    .select('id')
    .eq('email', body.email)
    .single()

  if (userError || !userData) {
    throw quickError(404, 'user_not_found', 'User not found', { error: userError })
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
    throw simpleError('error_deleting_user_from_organization', 'Error deleting user from organization', { error })
  }
  cloudlog({ requestId: c.get('requestId'), message: 'User deleted from organization', data: { user_id: userData.id, org_id: body.orgId } })
  return c.json({ status: 'OK' }, 200)
}
