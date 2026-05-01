import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { type } from 'arktype'
import { HTTPException } from 'hono/http-exception'
import { safeParseSchema } from '../../utils/ark_validation.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { createSignedImageUrl, normalizeImagePath } from '../../utils/storage.ts'
import { getStripeCustomerName, isDeterministicStripeCustomerUpdateError, updateCustomerOrganizationName } from '../../utils/stripe.ts'
import { apikeyHasOrgRightWithPolicy, supabaseAdmin, supabaseApikey, supabaseClient } from '../../utils/supabase.ts'
import { normalizeWebsiteUrl } from './website.ts'

const bodySchema = type({
  'orgId': 'string',
  'logo?': 'string',
  'name?': 'string',
  'website?': 'string | null',
  'management_email?': 'string.email',
  'require_apikey_expiration?': 'boolean',
  'max_apikey_expiration_days?': 'number | null',
  'enforce_hashed_api_keys?': 'boolean',
  'enforcing_2fa?': 'boolean',
})

type OrgRow = Database['public']['Tables']['orgs']['Row']
type OrgUpdateFields = Partial<Database['public']['Tables']['orgs']['Update']>

interface OrganizationPutBody {
  orgId: string
  logo?: string
  name?: string
  website?: string | null
  management_email?: string
  require_apikey_expiration?: boolean
  max_apikey_expiration_days?: number | null
  enforce_hashed_api_keys?: boolean
  enforcing_2fa?: boolean
}

function parseOrganizationBody(bodyRaw: unknown): OrganizationPutBody {
  const bodyParsed = safeParseSchema(bodySchema, bodyRaw)
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

function buildUpdateFields(body: OrganizationPutBody, sanitizedName?: string) {
  const updateFields: OrgUpdateFields = {}
  if (body.name !== undefined)
    updateFields.name = sanitizedName ?? body.name
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

async function sanitizeOrgNameForSync(
  supabase: ReturnType<typeof supabaseApikey>,
  name: string,
) {
  const { data, error } = await supabase.rpc('strip_html', { input: name })

  if (error || data === null) {
    throw simpleError('cannot_update_org', 'Cannot update org', {
      error: error?.message ?? 'cannot_sanitize_org_name',
    })
  }

  const sanitizedName = data.trim()
  if (!sanitizedName) {
    throw simpleError('invalid_body', 'Invalid body', {
      error: 'sanitized_name_empty',
    })
  }

  return sanitizedName
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
  updateFields: OrgUpdateFields,
  options?: { expectedCurrentName?: string, expectedCurrentFields?: OrgUpdateFields },
) {
  let query = supabase
    .from('orgs')
    .update(updateFields)
    .eq('id', orgId)
  if (options?.expectedCurrentName !== undefined)
    query = query.eq('name', options.expectedCurrentName)
  if (options?.expectedCurrentFields) {
    for (const key of Object.keys(options.expectedCurrentFields) as Array<keyof OrgUpdateFields>) {
      const fieldValue = options.expectedCurrentFields[key]
      if (fieldValue === undefined)
        continue
      query = fieldValue === null
        ? query.is(key, null)
        : query.eq(key, fieldValue)
    }
  }

  const { error, data } = await query
    .select()
    .maybeSingle()

  if (error) {
    throw simpleError('cannot_update_org', 'Cannot update org', { error: error.message })
  }
  if (!data) {
    throw simpleError('cannot_update_org', 'Cannot update org', {
      error: 'org_name_changed',
      orgId,
    })
  }

  return data
}

function buildRollbackFields(
  currentOrg: OrgRow,
  updateFields: OrgUpdateFields,
) {
  const rollbackFields: OrgUpdateFields = {}

  for (const key of Object.keys(updateFields) as Array<keyof OrgUpdateFields>) {
    rollbackFields[key] = currentOrg[key as keyof OrgRow] as never
  }

  return rollbackFields
}

function buildExpectedCurrentFields(
  currentOrg: OrgRow,
  updateFields: OrgUpdateFields,
) {
  const expectedCurrentFields: OrgUpdateFields = {}

  for (const key of Object.keys(updateFields) as Array<keyof OrgUpdateFields>) {
    expectedCurrentFields[key] = currentOrg[key as keyof OrgRow] as never
  }

  return expectedCurrentFields
}

async function getOrgForNameSync(
  supabase: ReturnType<typeof supabaseApikey>,
  orgId: string,
): Promise<OrgRow> {
  const { error, data } = await supabase
    .from('orgs')
    .select('*')
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
  const body = parseOrganizationBody(bodyRaw)
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
  const sanitizedOrgName = body.name !== undefined
    ? await sanitizeOrgNameForSync(supabase, body.name)
    : undefined
  const updateFields = buildUpdateFields(body, sanitizedOrgName)
  const shouldSyncStripeName = body.name !== undefined
  const currentOrg = shouldSyncStripeName
    ? await getOrgForNameSync(supabase, body.orgId)
    : null

  const dataOrg: Database['public']['Tables']['orgs']['Row'] = await updateOrg(supabase, body.orgId, updateFields, {
    expectedCurrentName: shouldSyncStripeName ? currentOrg?.name : undefined,
  })

  const committedCustomerId = dataOrg.customer_id

  if (shouldSyncStripeName && currentOrg && committedCustomerId && !committedCustomerId.startsWith('pending_')) {
    try {
      await updateCustomerOrganizationName(c, committedCustomerId, dataOrg.name)
    }
    catch (stripeError) {
      const stripeCustomerName = await getStripeCustomerName(c, committedCustomerId)

      if (stripeCustomerName === dataOrg.name) {
        // Stripe can time out after persisting the update; don't roll back the DB in that case.
      }
      else if (stripeCustomerName !== undefined || isDeterministicStripeCustomerUpdateError(stripeError)) {
        const rollbackFields = buildRollbackFields(currentOrg, updateFields)

        try {
          await updateOrg(supabase, body.orgId, rollbackFields, {
            expectedCurrentName: dataOrg.name,
            expectedCurrentFields: buildExpectedCurrentFields(dataOrg, updateFields),
          })
        }
        catch (rollbackError) {
          throw simpleError('cannot_update_org', 'Cannot update org', {
            error: getErrorDetail(stripeError),
            rollbackError: getErrorDetail(rollbackError),
          })
        }

        throw simpleError('cannot_update_org', 'Cannot update org', {
          error: getErrorDetail(stripeError),
        })
      }
      else {
        throw simpleError('cannot_update_org', 'Cannot update org', {
          error: getErrorDetail(stripeError),
          stripeSyncState: 'unknown',
        })
      }
    }
  }

  if (dataOrg.logo) {
    const signedLogo = await createSignedImageUrl(c, dataOrg.logo)
    dataOrg.logo = signedLogo ?? null
  }

  return c.json({ status: 'Organization updated', id: dataOrg.id, data: dataOrg }, 200)
}
