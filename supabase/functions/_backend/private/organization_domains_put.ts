/**
 * Organization Email Domain Auto-Join - PUT Endpoint
 *
 * Updates the allowed email domains and auto-join enabled status for an organization.
 * This endpoint is restricted to organization admins and super_admins only.
 *
 * @endpoint POST /private/organization_domains_put
 * @authentication JWT (requires admin or super_admin permissions)
 * @param {string} orgId - Organization UUID
 * @param {string[]} domains - Array of email domains (e.g., ['company.com'])
 * @param {boolean} enabled - Whether auto-join is enabled (default: false)
 * @returns {object} Updated organization domain configuration
 *
 * Security Constraints:
 * - Blocks public email domains (gmail.com, yahoo.com, etc.) via CHECK constraint
 * - Enforces unique SSO domain constraint (one domain can only belong to one SSO-enabled org)
 * - Requires admin or super_admin role to modify
 */

import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod/mini'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { org_users, orgs } from '../utils/postgres_schema.ts'

/** Request body validation schema */
const bodySchema = z.object({
  orgId: z.string(),
  domains: z.array(z.string()),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

/**
 * UPDATE organization email domains and auto-join status
 *
 * Flow:
 * 1. Validate request body (orgId, domains, enabled)
 * 2. Check user has admin or super_admin permissions for the organization
 * 3. Update orgs table with new domains and enabled state
 * 4. Handle constraint violations (blocked domains, SSO conflicts)
 * 5. Return updated configuration
 *
 * Error Handling:
 * - Returns specific error codes for constraint violations
 * - Provides user-friendly messages for blocked domains
 * - Handles SSO domain conflicts gracefully
 */
app.post('/', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')
  const requestId = c.get('requestId')

  if (!auth?.userId) {
    return simpleError('unauthorized', 'Authentication required')
  }

  const body = await parseBody<any>(c)

  // Read enabled from bodyRaw directly (not in zod schema since zod/mini doesn't support optional/nullable)
  const enabled = body.enabled === true || body.enabled === false ? body.enabled : false

  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    return simpleError('invalid_json_body', 'Invalid json body', { body, parsedBodyResult })
  }

  const safeBody = parsedBodyResult.data

  // Initialize Drizzle client once for all database operations
  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    // Check if user has admin rights for this org (query org-level permissions only)
    let orgUsersResult
    try {
      orgUsersResult = await drizzleClient
        .select({
          user_right: org_users.user_right,
          app_id: org_users.app_id,
          channel_id: org_users.channel_id,
        })
        .from(org_users)
        .where(and(
          eq(org_users.org_id, safeBody.orgId),
          eq(org_users.user_id, auth.userId),
        ))
    }
    catch (error: any) {
      await closeClient(c, pgClient)
      cloudlog({ requestId, message: '[organization_domains_put] Error fetching org permissions', error })
      return simpleError('cannot_access_organization', 'Error checking organization access', { orgId: safeBody.orgId })
    }

    if (!orgUsersResult || orgUsersResult.length === 0) {
      await closeClient(c, pgClient)
      return simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: safeBody.orgId })
    }

    // Find org-level permission (where app_id and channel_id are null)
    const orgLevelPerm = orgUsersResult.find(u => u.app_id === null && u.channel_id === null)
    if (!orgLevelPerm) {
      await closeClient(c, pgClient)
      return simpleError('cannot_access_organization', 'You don\'t have org-level access', { orgId: safeBody.orgId })
    }

    // Check if user has admin or super_admin rights
    if (orgLevelPerm.user_right !== 'admin' && orgLevelPerm.user_right !== 'super_admin') {
      await closeClient(c, pgClient)
      return simpleError('insufficient_permissions', 'You need admin rights to modify organization domains', { orgId: safeBody.orgId, userRight: orgLevelPerm.user_right })
    }

    // Update the allowed domains and enabled state using Drizzle ORM
    const updatedOrgs = await drizzleClient
      .update(orgs)
      .set({
        allowed_email_domains: safeBody.domains,
        sso_enabled: enabled,
      })
      .where(eq(orgs.id, safeBody.orgId))
      .returning({
        allowed_email_domains: orgs.allowed_email_domains,
        sso_enabled: orgs.sso_enabled,
      })

    await closeClient(c, pgClient)

    // Verify the update affected a row
    if (!updatedOrgs || updatedOrgs.length === 0) {
      cloudlog({ requestId, message: '[organization_domains_put] No organization found to update', orgId: safeBody.orgId })
      return c.json({ status: 'Organization not found', orgId: safeBody.orgId }, 404)
    }

    const data = updatedOrgs[0]
    return c.json({
      allowed_email_domains: data?.allowed_email_domains || [],
      sso_enabled: data?.sso_enabled || false,
    }, 200)
  }
  catch (error: any) {
    await closeClient(c, pgClient)
    cloudlog({ requestId, message: '[organization_domains_put] Error updating org domains', error })

    // Check for PostgreSQL constraint violations
    // Drizzle returns error.code for PostgreSQL error codes
    if (error.code === '23514' || error.message?.includes('blocked_domain') || error.message?.includes('public email provider')) {
      return simpleError('blocked_domain', 'This domain is a public email provider and cannot be used', { domains: safeBody.domains })
    }
    if (error.code === '23505' || error.message?.includes('unique_sso_domain') || error.message?.includes('already claimed')) {
      return simpleError('domain_already_used', 'This domain is already in use by another organization', { domains: safeBody.domains })
    }
    return simpleError('cannot_update_org_domains', 'Cannot update organization allowed email domains', { error: error.message })
  }
})
