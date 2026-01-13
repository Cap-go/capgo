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

function parseBody(bodyRaw: unknown) {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  return bodyParsed.data
}

function parseOrg(data: unknown) {
  const dataParsed = orgSchema.safeParse(data)
  if (!dataParsed.success) {
    throw simpleError('cannot_parse_organization', 'Cannot parse organization', { error: dataParsed.error })
  }
  return dataParsed.data
}

function parseOrgs(data: unknown) {
  const dataParsed = z.array(orgSchema).safeParse(data)
  if (!dataParsed.success) {
    throw simpleError('cannot_parse_organizations', 'Cannot parse organizations', { error: dataParsed.error })
  }
  return dataParsed.data
}

async function ensureOrgAccess(
  c: Context<MiddlewareKeyVariables>,
  apikey: Database['public']['Tables']['apikeys']['Row'],
  orgId: string,
  supabase: ReturnType<typeof supabaseApikey>,
) {
  if (!(await checkPermission(c, 'org.read', { orgId }))) {
    throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: orgId })
  }

  const orgCheck = await apikeyHasOrgRightWithPolicy(c, apikey, orgId, supabase)
  if (orgCheck.valid) {
    return
  }
  if (orgCheck.error === 'org_requires_expiring_key') {
    throw quickError(401, 'org_requires_expiring_key', 'This organization requires API keys with an expiration date. Please use a different key or update this key with an expiration date.')
  }
  throw simpleError('invalid_org_id', 'You can\'t access this organization', { org_id: orgId })
}

async function fetchOrg(
  supabase: ReturnType<typeof supabaseApikey>,
  orgId: string,
) {
  const { data, error } = await supabase
    .from('orgs')
    .select('*')
    .eq('id', orgId)
    .single()
  if (error) {
    throw simpleError('cannot_get_organization', 'Cannot get organization', { error })
  }
  return parseOrg(data)
}

async function fetchOrgs(
  supabase: ReturnType<typeof supabaseApikey>,
  page?: number,
) {
  const fetchOffset = page ?? 0
  const from = fetchOffset * fetchLimit
  const to = (fetchOffset + 1) * fetchLimit - 1
  const { data, error } = await supabase
    .from('orgs')
    .select('*')
    .range(from, to)
  if (error) {
    throw simpleError('cannot_get_organizations', 'Cannot get organizations', { error })
  }
  return parseOrgs(data)
}

export async function get(c: Context<MiddlewareKeyVariables>, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const body = parseBody(bodyRaw)
  const supabase = supabaseApikey(c, c.get('capgkey') as string)

  // Auth context is already set by middlewareKey
  if (body.orgId) {
    await ensureOrgAccess(c, apikey, body.orgId, supabase)
    const org = await fetchOrg(supabase, body.orgId)
    return c.json(org)
  }

  const orgs = await fetchOrgs(supabase, body.page)
  return c.json(orgs)
}
