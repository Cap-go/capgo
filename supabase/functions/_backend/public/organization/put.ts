import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod'
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
    console.error('Invalid body', bodyParsed.error)
    return c.json({ status: 'Invalid body', error: bodyParsed.error.message }, 400)
  }
  const body = bodyParsed.data
  const userId = apikey.user_id

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    console.error('You can\'t access this organization', body.orgId)
    return c.json({ status: 'You can\'t access this organization', orgId: body.orgId }, 400)
  }

  const { data, error } = await supabaseAdmin(c).from('users').select('*').eq('id', userId).single()
  if (error) {
    console.error('Cannot get user', error)
    return c.json({ status: 'Cannot get user', error: error.message }, 500)
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
    console.error('Error when updating org', errorOrg)
    return c.json({ status: 'Cannot update org', error: errorOrg.message }, 500)
  }
  return c.json({ status: 'Organization updated', id: data.id, data: dataOrg }, 200)
}
