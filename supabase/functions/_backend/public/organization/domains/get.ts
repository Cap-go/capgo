import type { Context } from 'hono'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { quickError, simpleError } from '../../../utils/hono.ts'
import { apikeyHasOrgRight, hasOrgRightApikey, supabaseApikey } from '../../../utils/supabase.ts'

const bodySchema = z.object({
  orgId: z.string(),
})

/**
 * Retrieves allowed email domains and SSO status for the specified organization.
 *
 * Validates the request body, enforces read access for the provided API key, queries the org record, and returns the organization's allowed email domains and SSO enabled flag.
 *
 * @param c - Hono context object
 * @param bodyRaw - Request body expected to contain `{ orgId: string }`
 * @param apikey - The API key row used to authorize and scope the query
 * @returns A JSON object with `status: 'ok'`, `orgId`, `allowed_email_domains` (array), and `sso_enabled` (boolean)
 * @throws `invalid_body` when the request body fails validation
 * @throws `cannot_access_organization` when the API key does not have read rights for the organization
 * @throws `cannot_get_org_domains` when the database query for the organization fails
 */
export async function getDomains(c: Context, bodyRaw: any, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const bodyParsed = bodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  // Check if user has read rights for this org
  const hasUserRight = await hasOrgRightApikey(c, body.orgId, apikey.user_id, 'read', c.get('capgkey') as string)
  const hasApiKeyRight = apikeyHasOrgRight(apikey, body.orgId)
  if (!hasUserRight || !hasApiKeyRight) {
    throw quickError(401, 'cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
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
