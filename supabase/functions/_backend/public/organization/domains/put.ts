import type { Context } from 'hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { simpleError } from '../../../utils/hono.ts'
import { cloudlog } from '../../../utils/logging.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseApikey } from '../../../utils/supabase.ts'

const bodySchema = z.object({
  orgId: z.string(),
  domains: z.array(z.string().check(z.minLength(1))),
})

/**
 * Update an organization's allowed email domains and optionally its SSO enabled flag.
 *
 * Normalizes and validates the provided domains, rejects public email providers, and requires admin rights for the target organization.
 *
 * @param c - Hono context object
 * @param bodyRaw - Request body containing `orgId: string`, `domains: string[]`, and optional `enabled: boolean` to set `sso_enabled`
 * @param apikey - The API key row used to authorize and scope the query
 * @returns A JSON Response with `status`, `orgId`, `allowed_email_domains` (array of strings), and `sso_enabled` (boolean)
 * @throws simpleError with code `invalid_body` when the request body fails validation
 * @throws simpleError with code `cannot_access_organization` when the caller lacks admin rights for the organization
 * @throws simpleError with code `invalid_domain` when any provided domain is syntactically invalid
 * @throws simpleError with code `blocked_domain` when any provided domain is a blocked/public email provider
 * @throws simpleError with code `domain_conflict` when a domain conflict prevents the update
 * @throws simpleError with code `cannot_update_org_domains` for other update failures
 */
export async function putDomains(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data
  const enabled = typeof bodyRaw.enabled === 'boolean' ? bodyRaw.enabled : undefined

  // Check if user has admin rights for this org
  if (!(await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'admin', apikey.key)) || !(apikeyHasOrgRight(apikey, body.orgId))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization (requires admin rights)', { orgId: body.orgId })
  }

  // Validate and normalize domains
  const normalizedDomains = body.domains.map((domain) => {
    const trimmed = domain.trim().toLowerCase()
    // Remove any @ symbols if present
    const cleaned = trimmed.replace(/^@+/, '')

    // Basic domain validation (must have at least one dot)
    if (!cleaned.includes('.') || cleaned.length < 3) {
      throw simpleError('invalid_domain', `Invalid domain: ${domain}`, { domain })
    }

    return cleaned
  })

  // Check for blocked domains using the database function
  const supabase = supabaseApikey(c, apikey.key)
  for (const domain of normalizedDomains) {
    const { data: isBlocked } = await supabase.rpc('is_blocked_email_domain', { domain })
    if (isBlocked) {
      throw simpleError('blocked_domain', `Domain ${domain} is a public email provider and cannot be used for organization auto-join. Please use a custom domain owned by your organization.`, { domain })
    }
  }

  cloudlog({
    requestId: c.get('requestId'),
    context: 'Updating allowed_email_domains',
    orgId: body.orgId,
    domains: normalizedDomains,
    enabled,
  })

  const updateData: any = {
    allowed_email_domains: normalizedDomains,
  }

  // Only update sso_enabled if it's explicitly provided
  if (enabled !== undefined) {
    updateData.sso_enabled = enabled
  }

  const { error: errorOrg, data: dataOrg } = await supabase
    .from('orgs')
    .update(updateData)
    .eq('id', body.orgId)
    .select()

  if (errorOrg) {
    // Handle specific PostgreSQL errors
    if (errorOrg.code === 'P0001' && errorOrg.message?.includes('public email provider')) {
      throw simpleError('blocked_domain', errorOrg.message, { error: errorOrg.message })
    }
    if (errorOrg.code === '23505' || (errorOrg.message?.includes('already claimed') && errorOrg.message?.includes('SSO enabled'))) {
      throw simpleError('domain_conflict', errorOrg.message, { error: errorOrg.message })
    }
    throw simpleError('cannot_update_org_domains', 'Cannot update organization allowed email domains', { error: errorOrg.message })
  }

  // Verify the update affected a row
  if (!dataOrg || dataOrg.length === 0) {
    return c.json({ status: 'Organization not found', orgId: body.orgId }, 404)
  }

  return c.json({
    status: 'Organization allowed email domains updated',
    orgId: body.orgId,
    allowed_email_domains: dataOrg[0]?.allowed_email_domains || [],
    sso_enabled: dataOrg[0]?.sso_enabled || false,
  }, 200)
}
