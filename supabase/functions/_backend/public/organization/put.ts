import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { apikeyHasOrgRightWithPolicy, supabaseApikey } from '../../utils/supabase.ts'
import { createSignedImageUrl, normalizeImagePath } from '../../utils/storage.ts'

const bodySchema = z.object({
  orgId: z.string(),
  logo: z.optional(z.string()),
  name: z.optional(z.string()),
  management_email: z.optional(z.email()),
  require_apikey_expiration: z.optional(z.boolean()),
  max_apikey_expiration_days: z.optional(z.nullable(z.number())),
  enforce_hashed_api_keys: z.optional(z.boolean()),
})

function parseBody(bodyRaw: unknown) {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  return bodyParsed.data
}

async function ensureOrgAccess(
  c: Context<MiddlewareKeyVariables>,
  apikey: Database['public']['Tables']['apikeys']['Row'],
  orgId: string,
  supabase: ReturnType<typeof supabaseApikey>,
) {
  if (!(await checkPermission(c, 'org.update_settings', { orgId }))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId })
  }

  const orgCheck = await apikeyHasOrgRightWithPolicy(c, apikey, orgId, supabase)
  if (orgCheck.valid) {
    return
  }
  if (orgCheck.error === 'org_requires_expiring_key') {
    throw quickError(401, 'org_requires_expiring_key', 'This organization requires API keys with an expiration date. Please use a different key or update this key with an expiration date.')
  }
  throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId })
}

function validateMaxExpirationDays(maxDays?: number | null) {
  if (maxDays === undefined || maxDays === null) {
    return
  }
  if (maxDays < 1 || maxDays > 365) {
    throw simpleError('invalid_max_expiration_days', 'Maximum expiration days must be between 1 and 365')
  }
}

function buildUpdateFields(body: z.infer<typeof bodySchema>) {
  const updateFields: Partial<Database['public']['Tables']['orgs']['Update']> = {}
  if (body.name !== undefined)
    updateFields.name = body.name
  if (body.logo !== undefined)
    updateFields.logo = normalizeImagePath(body.logo) ?? body.logo
  if (body.management_email !== undefined)
    updateFields.management_email = body.management_email
  if (body.require_apikey_expiration !== undefined)
    updateFields.require_apikey_expiration = body.require_apikey_expiration
  if (body.max_apikey_expiration_days !== undefined)
    updateFields.max_apikey_expiration_days = body.max_apikey_expiration_days
  if (body.enforce_hashed_api_keys !== undefined)
    updateFields.enforce_hashed_api_keys = body.enforce_hashed_api_keys
  return updateFields
}

async function updateOrg(
  supabase: ReturnType<typeof supabaseApikey>,
  orgId: string,
  updateFields: Partial<Database['public']['Tables']['orgs']['Update']>,
) {
  const { error, data } = await supabase
    .from('orgs')
    .update(updateFields)
    .eq('id', orgId)
    .select()
    .single()

  if (error) {
    throw simpleError('cannot_update_org', 'Cannot update org', { error: error.message })
  }

  return data
}

export async function put(c: Context<MiddlewareKeyVariables>, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const body = parseBody(bodyRaw)
  const supabase = supabaseApikey(c, apikey.key)

  // Auth context is already set by middlewareKey
  await ensureOrgAccess(c, apikey, body.orgId, supabase)
  validateMaxExpirationDays(body.max_apikey_expiration_days)
  const updateFields = buildUpdateFields(body)
  const dataOrg = await updateOrg(supabase, body.orgId, updateFields)
  if (dataOrg.logo) {
    const signedLogo = await createSignedImageUrl(c, dataOrg.logo)
    dataOrg.logo = signedLogo ?? null
  }

  return c.json({ status: 'Organization updated', id: dataOrg.id, data: dataOrg }, 200)
}
