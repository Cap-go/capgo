/**
 * Organization Email Domain Auto-Join - GET Endpoint
 *
 * Retrieves the allowed email domains and auto-join enabled status for an organization.
 * This endpoint is used by organization admins to view current auto-join configuration.
 *
 * @endpoint POST /private/organization_domains_get
 * @authentication JWT (requires read, write, or all permissions)
 * @returns {object} Organization domain configuration
 *   - allowed_email_domains: Array of allowed domains (e.g., ['company.com'])
 *   - sso_enabled: Boolean indicating if auto-join is enabled
 */

import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

/** Request body validation schema */
const bodySchema = z.object({
  orgId: z.string(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

/**
 * GET organization email domains and auto-join status
 *
 * Flow:
 * 1. Validate request body (orgId)
 * 2. Check user has org-level permissions (not just app/channel-level)
 * 3. Query organization's allowed_email_domains and sso_enabled fields
 * 4. Return configuration to frontend
 *
 * Security:
 * - Uses composite index on (org_id, user_id) for fast permission checks
 * - Only returns data if user has org-level access (app_id and channel_id are null)
 */
app.post('/', middlewareV2(['all', 'write', 'read']), async (c) => {
  const auth = c.get('auth')
  const requestId = c.get('requestId')

  if (!auth || !auth.userId) {
    return simpleError('unauthorized', 'Authentication required')
  }

  const body = await parseBody<any>(c)
  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    return simpleError('invalid_json_body', 'Invalid json body', { body, parsedBodyResult })
  }

  const safeBody = parsedBodyResult.data

  // Check if user has access to this org (query org-level permissions only)
  // Uses composite index idx_org_users_org_user_covering for optimal performance
  const supabase = supabaseAdmin(c)
  const { data: orgUsers, error: orgUserError } = await supabase
    .from('org_users')
    .select('user_right, app_id, channel_id')
    .eq('org_id', safeBody.orgId)
    .eq('user_id', auth.userId)

  if (orgUserError) {
    cloudlog({ requestId, message: '[organization_domains_get] Error fetching org permissions', error: orgUserError })
    return simpleError('cannot_access_organization', 'Error checking organization access', { orgId: safeBody.orgId })
  }

  if (!orgUsers || orgUsers.length === 0) {
    return simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: safeBody.orgId })
  }

  // Find org-level permission (where app_id and channel_id are null)
  // Users with only app or channel-level access cannot view/modify org settings
  const orgLevelPerm = orgUsers.find(u => u.app_id === null && u.channel_id === null)
  if (!orgLevelPerm) {
    return simpleError('cannot_access_organization', 'You don\'t have org-level access', { orgId: safeBody.orgId })
  }

  const { error, data } = await supabase
    .from('orgs')
    .select('allowed_email_domains, sso_enabled')
    .eq('id', safeBody.orgId)
    .single()

  if (error) {
    cloudlog({ requestId, message: '[organization_domains_get] Error fetching org domains', error })
    return simpleError('cannot_get_org_domains', 'Cannot get organization allowed email domains', { error: error.message })
  }

  return c.json({
    allowed_email_domains: data?.allowed_email_domains || [],
    sso_enabled: data?.sso_enabled || false,
  }, 200)
})
