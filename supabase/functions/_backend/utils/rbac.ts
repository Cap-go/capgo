/**
 * RBAC Permission System
 *
 * This module provides a unified permission checking system that routes between
 * legacy role-based checks (check_min_rights) and the new RBAC permission system
 * based on the org's feature flag.
 *
 * Usage:
 *   import { checkPermission } from './rbac.ts'
 *
 *   // Check app-level permission
 *   const allowed = await checkPermission(c, 'app.upload_bundle', { appId: 'com.example.app' })
 *
 *   // Check channel-level permission (appId and orgId are auto-derived)
 *   const allowed = await checkPermission(c, 'channel.promote_bundle', { channelId: 123 })
 *
 *   // Check org-level permission
 *   const allowed = await checkPermission(c, 'org.invite_user', { orgId: 'uuid...' })
 */
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from './hono.ts'
import type { Database } from './supabase.types.ts'
import { sql } from 'drizzle-orm'
import { cloudlog, cloudlogErr } from './logging.ts'
import { closeClient, getDrizzleClient, getPgClient, logPgError } from './pg.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * All available RBAC permissions from the permissions table.
 * These match exactly the keys in public.permissions.
 */
export type Permission
  // Org permissions
  = | 'org.read'
  | 'org.update_settings'
  | 'org.read_members'
  | 'org.invite_user'
  | 'org.update_user_roles'
  | 'org.read_billing'
  | 'org.update_billing'
  | 'org.read_invoices'
  | 'org.read_audit'
  | 'org.read_billing_audit'
  // App permissions
  | 'app.read'
  | 'app.update_settings'
  | 'app.delete'
  | 'app.read_bundles'
  | 'app.upload_bundle'
  | 'app.create_channel'
  | 'app.read_channels'
  | 'app.read_logs'
  | 'app.manage_devices'
  | 'app.read_devices'
  | 'app.build_native'
  | 'app.read_audit'
  // Bundle permissions
  | 'bundle.delete'
  // Channel permissions
  | 'channel.read'
  | 'channel.update_settings'
  | 'channel.delete'
  | 'channel.read_history'
  | 'channel.promote_bundle'
  | 'channel.rollback_bundle'
  | 'channel.manage_forced_devices'
  | 'channel.read_forced_devices'
  | 'channel.read_audit'
  // Platform permissions (internal only)
  | 'platform.impersonate_user'
  | 'platform.manage_orgs_any'
  | 'platform.manage_apps_any'
  | 'platform.manage_channels_any'
  | 'platform.run_maintenance_jobs'
  | 'platform.delete_orphan_users'
  | 'platform.read_all_audit'
  | 'platform.db_break_glass'

/**
 * Scope types for RBAC permissions
 */
export type ScopeType = 'platform' | 'org' | 'app' | 'channel'

/**
 * Scope identifiers for permission checks.
 * At least one must be provided. More specific scopes (channelId) will auto-derive
 * parent scopes (appId, orgId) if not explicitly provided.
 */
export interface PermissionScope {
  orgId?: string
  appId?: string
  channelId?: number
}

/**
 * Extended context interface with RBAC information
 */
export interface RbacContextVariables {
  rbacEnabled?: boolean
  resolvedOrgId?: string
}

// =============================================================================
// Legacy Mapping
// =============================================================================

/**
 * Maps RBAC permissions to legacy user_min_right values.
 * Used for fallback when org doesn't have RBAC enabled.
 */
const PERMISSION_TO_LEGACY_RIGHT: Record<Permission, Database['public']['Enums']['user_min_right']> = {
  // Org permissions
  'org.read': 'read',
  'org.update_settings': 'admin',
  'org.read_members': 'read',
  'org.invite_user': 'admin',
  'org.update_user_roles': 'super_admin',
  'org.read_billing': 'admin',
  'org.update_billing': 'super_admin',
  'org.read_invoices': 'admin',
  'org.read_audit': 'admin',
  'org.read_billing_audit': 'super_admin',
  // App permissions
  'app.read': 'read',
  'app.update_settings': 'write',
  'app.delete': 'admin',
  'app.read_bundles': 'read',
  'app.upload_bundle': 'upload',
  'app.create_channel': 'write',
  'app.read_channels': 'read',
  'app.read_logs': 'read',
  'app.manage_devices': 'write',
  'app.read_devices': 'read',
  'app.build_native': 'write',
  'app.read_audit': 'admin',
  // Bundle permissions
  'bundle.delete': 'admin',
  // Channel permissions
  'channel.read': 'read',
  'channel.update_settings': 'write',
  'channel.delete': 'admin',
  'channel.read_history': 'read',
  'channel.promote_bundle': 'write',
  'channel.rollback_bundle': 'write',
  'channel.manage_forced_devices': 'write',
  'channel.read_forced_devices': 'read',
  'channel.read_audit': 'admin',
  // Platform permissions - require super_admin (will fail for regular users)
  'platform.impersonate_user': 'super_admin',
  'platform.manage_orgs_any': 'super_admin',
  'platform.manage_apps_any': 'super_admin',
  'platform.manage_channels_any': 'super_admin',
  'platform.run_maintenance_jobs': 'super_admin',
  'platform.delete_orphan_users': 'super_admin',
  'platform.read_all_audit': 'super_admin',
  'platform.db_break_glass': 'super_admin',
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Check if RBAC is enabled for an organization.
 * Caches the result in context to avoid repeated queries.
 */
export async function isRbacEnabledForOrg(
  c: Context<MiddlewareKeyVariables>,
  orgId: string | null,
): Promise<boolean> {
  // Check cache first
  const cached = c.get('rbacEnabled')
  if (cached !== undefined) {
    return cached
  }

  if (!orgId) {
    return false
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)

    const result = await drizzleClient.execute(
      sql`SELECT public.rbac_is_enabled_for_org(${orgId}::uuid) as enabled`,
    )

    const enabled = (result.rows[0] as any)?.enabled === true
    // Cache the result
    c.set('rbacEnabled', enabled)
    return enabled
  }
  catch (e) {
    logPgError(c, 'isRbacEnabledForOrg', e)
    return false
  }
  finally {
    if (pgClient) {
      closeClient(c, pgClient)
    }
  }
}

/**
 * Main permission check function.
 *
 * Uses the SQL function rbac_check_permission_direct which automatically
 * routes between legacy (check_min_rights) and RBAC systems based on
 * the org's feature flag.
 *
 * @param c - Hono context with auth info
 * @param permission - The RBAC permission to check (e.g., 'app.upload_bundle')
 * @param scope - Scope identifiers (orgId, appId, channelId). Parent scopes are auto-derived by SQL function.
 * @returns true if the user has the permission, false otherwise
 *
 * @example
 * // Check app-level permission
 * if (await checkPermission(c, 'app.upload_bundle', { appId: 'com.example.app' })) {
 *   // User can upload bundles
 * }
 *
 * @example
 * // Check channel-level permission (appId and orgId are auto-derived)
 * if (await checkPermission(c, 'channel.promote_bundle', { channelId: 123 })) {
 *   // User can promote bundles on this channel
 * }
 *
 * @example
 * // Check org-level permission
 * if (await checkPermission(c, 'org.invite_user', { orgId: 'uuid...' })) {
 *   // User can invite members
 * }
 */
export async function checkPermission(
  c: Context<MiddlewareKeyVariables>,
  permission: Permission,
  scope: PermissionScope,
): Promise<boolean> {
  const auth = c.get('auth')
  if (!auth?.userId) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkPermission: no auth',
      permission,
    })
    return false
  }

  const { userId, apikey } = auth
  // For hashed keys, apikey.key is null, so we use capgkey from the request header
  const apikeyString = apikey?.key ?? c.get('capgkey') ?? null
  const { orgId = null, appId = null, channelId = null } = scope

  cloudlog({
    requestId: c.get('requestId'),
    message: 'checkPermission: checking',
    permission,
    scope,
    userId,
    hasApikey: !!apikeyString,
  })

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)

    // Use the unified SQL function that handles legacy/RBAC routing
    const result = await drizzleClient.execute(
      sql`SELECT public.rbac_check_permission_direct(
        ${permission},
        ${userId}::uuid,
        ${orgId}::uuid,
        ${appId},
        ${channelId}::bigint,
        ${apikeyString}
      ) as allowed`,
    )

    const allowed = (result.rows[0] as any)?.allowed === true

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkPermission: result',
      permission,
      scope,
      allowed,
    })

    return allowed
  }
  catch (e) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'checkPermission error',
      error: e,
      permission,
      scope,
    })
    return false
  }
  finally {
    if (pgClient) {
      closeClient(c, pgClient)
    }
  }
}

/**
 * Require a permission, throwing an error if not allowed.
 * Use this for endpoints that should return 403 if permission is denied.
 *
 * @throws HTTPException with status 403 if permission is denied
 */
export async function requirePermission(
  c: Context<MiddlewareKeyVariables>,
  permission: Permission,
  scope: PermissionScope,
): Promise<void> {
  const allowed = await checkPermission(c, permission, scope)
  if (!allowed) {
    const { quickError } = await import('./hono.ts')
    quickError(403, 'permission_denied', `Permission denied: ${permission}`, {
      permission,
      scope,
    })
  }
}

/**
 * Check multiple permissions at once.
 * Returns true only if ALL permissions are granted.
 */
export async function checkPermissions(
  c: Context<MiddlewareKeyVariables>,
  permissions: Permission[],
  scope: PermissionScope,
): Promise<boolean> {
  for (const permission of permissions) {
    if (!(await checkPermission(c, permission, scope))) {
      return false
    }
  }
  return true
}

/**
 * Check if ANY of the given permissions is granted.
 */
export async function checkAnyPermission(
  c: Context<MiddlewareKeyVariables>,
  permissions: Permission[],
  scope: PermissionScope,
): Promise<boolean> {
  for (const permission of permissions) {
    if (await checkPermission(c, permission, scope)) {
      return true
    }
  }
  return false
}

/**
 * Check permission using an existing Drizzle client.
 * Use this when you already have a connection open and want to avoid opening a new one.
 *
 * @param c - Hono context with auth info
 * @param permission - The RBAC permission to check
 * @param scope - Scope identifiers
 * @param drizzleClient - An existing Drizzle client
 * @param userId - User ID to check (required, as it may come from API key lookup)
 * @param apikeyString - Optional API key string for additional validation
 */
export async function checkPermissionPg(
  c: Context<MiddlewareKeyVariables>,
  permission: Permission,
  scope: PermissionScope,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  userId: string,
  apikeyString?: string | null,
): Promise<boolean> {
  if (!userId) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkPermissionPg: no userId',
      permission,
    })
    return false
  }

  const { orgId = null, appId = null, channelId = null } = scope

  cloudlog({
    requestId: c.get('requestId'),
    message: 'checkPermissionPg: checking',
    permission,
    scope,
    userId,
    hasApikey: !!apikeyString,
  })

  try {
    // Use the unified SQL function that handles legacy/RBAC routing
    const result = await drizzleClient.execute(
      sql`SELECT public.rbac_check_permission_direct(
        ${permission},
        ${userId}::uuid,
        ${orgId}::uuid,
        ${appId},
        ${channelId}::bigint,
        ${apikeyString ?? null}
      ) as allowed`,
    )

    const allowed = (result.rows[0] as any)?.allowed === true

    cloudlog({
      requestId: c.get('requestId'),
      message: 'checkPermissionPg: result',
      permission,
      scope,
      allowed,
    })

    return allowed
  }
  catch (e) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'checkPermissionPg error',
      error: e,
      permission,
      scope,
    })
    return false
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the legacy right equivalent for a permission.
 * Useful for compatibility layers.
 */
export function getLegacyRightForPermission(permission: Permission): Database['public']['Enums']['user_min_right'] {
  return PERMISSION_TO_LEGACY_RIGHT[permission]
}

/**
 * Infer the scope type from a permission key.
 */
export function getScopeTypeFromPermission(permission: Permission): ScopeType {
  if (permission.startsWith('org.'))
    return 'org'
  if (permission.startsWith('app.') || permission.startsWith('bundle.'))
    return 'app'
  if (permission.startsWith('channel.'))
    return 'channel'
  if (permission.startsWith('platform.'))
    return 'platform'
  return 'org' // Default fallback
}
