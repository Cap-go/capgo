import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { quickError, simpleError } from '../../utils/hono.ts'
import { apikeyHasOrgRightWithPolicy, supabaseApikey } from '../../utils/supabase.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { fetchLimit } from '../../utils/utils.ts'

const bodySchema = z.object({
  orgId: z.optional(z.string()),
  page: z.optional(z.number()),
})
const orgSchema = z.object({
  id: z.uuid(),
  created_by: z.uuid(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  logo: z.nullable(z.string()),
  name: z.string(),
  management_email: z.email(),
  customer_id: z.nullable(z.string()),
})

export async function get(c: Context<MiddlewareKeyVariables>, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data
  const supabase = supabaseApikey(c, c.get('capgkey') as string)

  // Auth context is already set by middlewareKey
  if (body.orgId && !(await checkPermission(c, 'org.read', { orgId: body.orgId }))) {
    throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: body.orgId })
  }

  if (body.orgId) {
    // Check org access AND policy requirements
    const orgCheck = await apikeyHasOrgRightWithPolicy(c, apikey, body.orgId, supabase)
    if (!orgCheck.valid) {
      if (orgCheck.error === 'org_requires_expiring_key') {
        throw quickError(401, 'org_requires_expiring_key', 'This organization requires API keys with an expiration date. Please use a different key or update this key with an expiration date.')
      }
      throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: body.orgId })
    }
    const { data, error } = await supabase
      .from('orgs')
      .select('*')
      .eq('id', body.orgId)
      .single()
    if (error) {
      throw simpleError('cannot_get_organization', 'Cannot get organization', { error })
    }
    const dataParsed = orgSchema.safeParse(data)
    if (!dataParsed.success) {
      throw simpleError('cannot_parse_organization', 'Cannot parse organization', { error: dataParsed.error })
    }
    return c.json(dataParsed.data)
  }
  else {
    const fetchOffset = body.page ?? 0
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1

    const { data, error } = await supabase
      .from('orgs')
      .select('*')
      .range(from, to)
    if (error) {
      throw simpleError('cannot_get_organizations', 'Cannot get organizations', { error })
    }
    const dataParsed = z.array(orgSchema).safeParse(data)
    if (!dataParsed.success) {
      throw simpleError('cannot_parse_organizations', 'Cannot parse organizations', { error: dataParsed.error })
    }
    return c.json(dataParsed.data)
  }
}
