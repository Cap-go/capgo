import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod'
import { simpleError } from '../../utils/hono.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

const bodySchema = z.object({
  orgId: z.string(),
  logo: z.string().optional(),
  name: z.string().optional(),
  management_email: z.string().email().optional(),

})
export async function put(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data
  const userId = apikey.user_id

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  const { data, error } = await supabaseAdmin(c).from('users').select('*').eq('id', userId).single()
  if (error) {
    throw simpleError('cannot_get_user', 'Cannot get user', { error: error.message })
  }

  const { error: errorOrg, data: dataOrg } = await supabaseAdmin(c)
    .from('orgs')
    .update({
      name: body.name,
      logo: body.logo,
      management_email: body.management_email,
    })
    .eq('id', body.orgId)
    .select()

  if (errorOrg) {
    throw simpleError('cannot_update_org', 'Cannot update org', { error: errorOrg.message })
  }
  return c.json({ status: 'Organization updated', id: data.id, data: dataOrg }, 200)
}
