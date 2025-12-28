import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { quickError, simpleError } from '../../utils/hono.ts'
import { apikeyHasOrgRightWithPolicy, hasOrgRightApikey, supabaseApikey } from '../../utils/supabase.ts'

const bodySchema = z.object({
  orgId: z.string(),
  logo: z.optional(z.string()),
  name: z.optional(z.string()),
  management_email: z.optional(z.email()),
  require_apikey_expiration: z.optional(z.boolean()),
  max_apikey_expiration_days: z.optional(z.nullable(z.number())),
})
export async function put(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data
  const userId = apikey.user_id
  const supabase = supabaseApikey(c, apikey.key)

  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', c.get('capgkey') as string))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  // Check org access AND policy requirements
  const orgCheck = await apikeyHasOrgRightWithPolicy(c, apikey, body.orgId, supabase)
  if (!orgCheck.valid) {
    if (orgCheck.error === 'org_requires_expiring_key') {
      throw quickError(401, 'org_requires_expiring_key', 'This organization requires API keys with an expiration date. Please use a different key or update this key with an expiration date.')
    }
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  // Validate max_apikey_expiration_days if provided
  if (body.max_apikey_expiration_days !== undefined && body.max_apikey_expiration_days !== null) {
    if (body.max_apikey_expiration_days < 1 || body.max_apikey_expiration_days > 365) {
      throw simpleError('invalid_max_expiration_days', 'Maximum expiration days must be between 1 and 365')
    }
  }

  const { data, error } = await supabase.from('users').select('*').eq('id', userId).single()
  if (error) {
    throw simpleError('cannot_get_user', 'Cannot get user', { error: error.message })
  }

  // Build update object, only including fields that were provided
  const updateFields: Partial<Database['public']['Tables']['orgs']['Update']> = {}
  if (body.name !== undefined)
    updateFields.name = body.name
  if (body.logo !== undefined)
    updateFields.logo = body.logo
  if (body.management_email !== undefined)
    updateFields.management_email = body.management_email
  if (body.require_apikey_expiration !== undefined)
    updateFields.require_apikey_expiration = body.require_apikey_expiration
  if (body.max_apikey_expiration_days !== undefined)
    updateFields.max_apikey_expiration_days = body.max_apikey_expiration_days

  const { error: errorOrg, data: dataOrg } = await supabase
    .from('orgs')
    .update(updateFields)
    .eq('id', body.orgId)
    .select()

  if (errorOrg) {
    throw simpleError('cannot_update_org', 'Cannot update org', { error: errorOrg.message })
  }
  return c.json({ status: 'Organization updated', id: data.id, data: dataOrg }, 200)
}
