import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod/mini'
import { quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { createSignedImageUrl, normalizeImagePath } from '../../utils/storage.ts'
import { updateCustomerOrganizationName } from '../../utils/stripe.ts'
import { apikeyHasOrgRightWithPolicy, supabaseAdmin, supabaseApikey, supabaseClient } from '../../utils/supabase.ts'
import { normalizeWebsiteUrl } from './website.ts'

const bodySchema = z.object({
  orgId: z.string(),
  logo: z.optional(z.string()),
  name: z.optional(z.string()),
  website: z.optional(z.nullable(z.string())),
  management_email: z.optional(z.email()),
  require_apikey_expiration: z.optional(z.boolean()),
  max_apikey_expiration_days: z.optional(z.nullable(z.number())),
  enforce_hashed_api_keys: z.optional(z.boolean()),
  enforcing_2fa: z.optional(z.boolean()),
})

type OrgNameSyncRow = Pick<Database['public']['Tables']['orgs']['Row'], 'id' | 'name' | 'customer_id'>

function parseBody(bodyRaw: unknown) {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  return bodyParsed.data
}

async function ensureOrgAccess(
  c: Context<MiddlewareKeyVariables>,
  apikey: Database['public']['Tables']['apikeys']['Row'] | null | undefined,
  orgId: string,
  supabase: ReturnType<typeof supabaseApikey>,
) {
  if (!(await checkPermission(c, 'org.update_settings', { orgId }))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId })
  }

  if (!apikey) {
    return
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
  if (body.website !== undefined)
    updateFields.website = normalizeWebsiteUrl(body.website)
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
  if (body.enforcing_2fa !== undefined)
    updateFields.enforcing_2fa = body.enforcing_2fa
  return updateFields
}

async function enforceSelf2faRequirement(authUserId: string, c: Context<MiddlewareKeyVariables>) {
  const { data: has2faEnabled, error } = await supabaseAdmin(c)
    .rpc('has_2fa_enabled', { user_id: authUserId })

  if (error) {
    throw quickError(500, 'cannot_check_2fa', 'Cannot verify your 2FA status', { error: error.message })
  }
  if (!has2faEnabled) {
    throw simpleError('requires_2fa_to_enforce_2fa', 'You must enable 2FA before enforcing it for your organization')
  }
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

async function getOrgForNameSync(
  supabase: ReturnType<typeof supabaseApikey>,
  orgId: string,
): Promise<OrgNameSyncRow> {
  const { error, data } = await supabase
    .from('orgs')
    .select('id, name, customer_id')
    .eq('id', orgId)
    .single()

  if (error) {
    throw simpleError('cannot_get_org', 'Cannot get org', { error: error.message })
  }

  return data
}

function getErrorDetail(error: unknown) {
  if (error instanceof HTTPException) {
    const httpErrorDetail = (error.cause as { moreInfo?: { error?: unknown } } | undefined)?.moreInfo?.error
    if (httpErrorDetail !== undefined)
      return httpErrorDetail
  }

  if (error instanceof Error)
    return error.message

  return error
}

export async function put(
  c: Context<MiddlewareKeyVariables>,
  bodyRaw: any,
  apikey: Database['public']['Tables']['apikeys']['Row'] | null | undefined,
): Promise<Response> {
  const body = parseBody(bodyRaw)
  const auth = c.get('auth')
  if (!auth?.userId) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  const supabase = auth.authType === 'jwt' && auth.jwt
    ? supabaseClient(c, auth.jwt)
    : supabaseApikey(c, apikey?.key)
  const authUserId = auth.userId

  // Auth context is already set by middlewareV2
  await ensureOrgAccess(c, apikey, body.orgId, supabase)

  if (body.enforcing_2fa) {
    await enforceSelf2faRequirement(authUserId, c)
  }

  validateMaxExpirationDays(body.max_apikey_expiration_days)
  const updateFields = buildUpdateFields(body)
  const shouldSyncStripeName = body.name !== undefined
  const currentOrg = shouldSyncStripeName
    ? await getOrgForNameSync(supabase, body.orgId)
    : null
  const shouldUpdateStripeCustomerName = shouldSyncStripeName
    && !!currentOrg?.customer_id
    && !currentOrg.customer_id.startsWith('pending_')
    && body.name !== currentOrg.name

  if (shouldUpdateStripeCustomerName) {
    await updateCustomerOrganizationName(c, currentOrg.customer_id!, body.name!)
  }

  let dataOrg: Database['public']['Tables']['orgs']['Row']
  try {
    dataOrg = await updateOrg(supabase, body.orgId, updateFields)
  }
  catch (error) {
    if (shouldUpdateStripeCustomerName) {
      let rollbackOrg: Database['public']['Tables']['orgs']['Row']

      try {
        rollbackOrg = await getOrgForNameSync(supabase, body.orgId)
      }
      catch (rollbackLookupError) {
        throw simpleError('cannot_update_org', 'Cannot update org', {
          error: getErrorDetail(error),
          rollbackLookupError: getErrorDetail(rollbackLookupError),
        })
      }

      try {
        await updateCustomerOrganizationName(c, currentOrg.customer_id!, rollbackOrg.name)
      }
      catch (rollbackError) {
        throw simpleError('cannot_update_org', 'Cannot update org', {
          error: getErrorDetail(error),
          rollbackError: rollbackError instanceof Error ? rollbackError.message : rollbackError,
        })
      }
    }
    throw error
  }

  if (dataOrg.logo) {
    const signedLogo = await createSignedImageUrl(c, dataOrg.logo)
    dataOrg.logo = signedLogo ?? null
  }

  return c.json({ status: 'Organization updated', id: dataOrg.id, data: dataOrg }, 200)
}
