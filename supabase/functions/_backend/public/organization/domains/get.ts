import type { Context } from 'hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../../utils/hono.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseApikey } from '../../../utils/supabase.ts'

const bodySchema = z.object({
  orgId: z.string(),
})

export async function getDomains(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  // Check if user has read rights for this org
  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'read', c.get('capgkey') as string)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  const { error, data } = await supabaseApikey(c, apikey.key)
    .from('orgs')
    .select('allowed_email_domains, sso_enabled')
    .eq('id', body.orgId)
    .single()

  if (error) {
    throw simpleError('cannot_get_org_domains', 'Cannot get organization allowed email domains', { error: error.message })
  }

  return c.json({
    status: 'ok',
    orgId: body.orgId,
    allowed_email_domains: data.allowed_email_domains || [],
    sso_enabled: data.sso_enabled || false,
  }, 200)
}
