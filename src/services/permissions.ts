/**
 * RBAC Permission System - Frontend
 *
 * This module provides the frontend interface to the backend RBAC permission system.
 * It calls the SQL function rbac_check_permission() which automatically routes
 * between legacy (org_users) and new RBAC (role_bindings) systems based on the org's
 * use_new_rbac flag.
 *
 * Usage:
 *   import { hasPermission } from '~/services/permissions'
 *
 *   // Check app-level permission
 *   const canUpload = await hasPermission('app.upload_bundle', { appId: 'com.example.app' })
 *
 *   // Check org-level permission
 *   const canInvite = await hasPermission('org.invite_user', { orgId })
 *
 *   // Check channel-level permission (orgId and appId are auto-derived by backend)
 *   const canPromote = await hasPermission('channel.promote_bundle', { channelId: 123 })
 */

import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

/**
 * All available RBAC permissions.
 * These match exactly the keys in the public.permissions table.
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
    | 'app.update_user_roles'
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
  // Platform permissions (internal only, not exposed to users)
    | 'platform.impersonate_user'
    | 'platform.manage_orgs_any'
    | 'platform.manage_apps_any'
    | 'platform.manage_channels_any'
    | 'platform.run_maintenance_jobs'
    | 'platform.delete_orphan_users'
    | 'platform.read_all_audit'
    | 'platform.db_break_glass'

/**
 * Scope identifiers for permission checks.
 * At least one must be provided. More specific scopes (channelId) will auto-derive
 * parent scopes (appId, orgId) if not explicitly provided by the backend.
 */
export interface PermissionScope {
  orgId?: string
  appId?: string
  channelId?: number
}

/**
 * Main permission check function.
 *
 * Calls the SQL function rbac_check_permission() which automatically
 * routes between legacy (check_min_rights) and RBAC systems based on the org's
 * feature flag.
 *
 * The backend will:
 * 1. Auto-derive parent scopes (orgId from appId, appId from channelId) if needed
 * 2. Detect if the org has use_new_rbac enabled
 * 3. If RBAC: check role_bindings → roles → role_permissions → permissions
 * 4. If legacy: map permission to min_right and check org_users table
 *
 * @param permission - The RBAC permission to check (e.g., 'app.upload_bundle')
 * @param scope - Scope identifiers. Parent scopes are auto-derived by the backend.
 * @returns Promise<boolean> - true if the user has the permission, false otherwise
 *
 * @example
 * // Check if user can upload bundles to an app
 * if (await hasPermission('app.upload_bundle', { appId: 'com.example.app' })) {
 *   // Show upload button
 * }
 *
 * @example
 * // Check if user can invite members to org
 * if (await hasPermission('org.invite_user', { orgId })) {
 *   // Show invite button
 * }
 *
 * @example
 * // Check channel permission (backend will auto-derive appId and orgId)
 * if (await hasPermission('channel.promote_bundle', { channelId: 123 })) {
 *   // Allow bundle promotion
 * }
 */
export async function hasPermission(
  permission: Permission,
  scope: PermissionScope,
): Promise<boolean> {
  const mainStore = useMainStore()
  const supabase = useSupabase()

  // Get current user ID
  const userId = mainStore.user?.id
  if (!userId) {
    console.warn('[hasPermission] No user ID found')
    return false
  }

  try {
    const { data, error } = await supabase.rpc('rbac_check_permission', {
      p_permission_key: permission,
      p_org_id: scope.orgId ?? null,
      p_app_id: scope.appId ?? null,
      p_channel_id: scope.channelId ?? null,
    })

    if (error) {
      console.error('[hasPermission] RPC error:', error)
      return false
    }

    return data === true
  }
  catch (err) {
    console.error('[hasPermission] Exception:', err)
    return false
  }
}

/**
 * Check if user has ANY of the provided permissions (OR logic).
 *
 * @example
 * // Check if user can either read or update app
 * if (await hasAnyPermission(['app.read', 'app.update_settings'], { appId })) {
 *   // Show app details
 * }
 */
export async function hasAnyPermission(
  permissions: Permission[],
  scope: PermissionScope,
): Promise<boolean> {
  const results = await Promise.all(
    permissions.map(perm => hasPermission(perm, scope)),
  )
  return results.some(allowed => allowed)
}

/**
 * Check if user has ALL of the provided permissions (AND logic).
 *
 * @example
 * // Check if user can both update settings AND delete app
 * if (await hasAllPermissions(['app.update_settings', 'app.delete'], { appId })) {
 *   // Show dangerous actions
 * }
 */
export async function hasAllPermissions(
  permissions: Permission[],
  scope: PermissionScope,
): Promise<boolean> {
  const results = await Promise.all(
    permissions.map(perm => hasPermission(perm, scope)),
  )
  return results.every(allowed => allowed)
}

/**
 * Batch check multiple permissions in different scopes.
 * Returns a map of permission keys to boolean results.
 *
 * @example
 * const permissions = await checkPermissionsBatch([
 *   { permission: 'app.upload_bundle', scope: { appId: 'com.example.app' } },
 *   { permission: 'org.invite_user', scope: { orgId: 'uuid...' } },
 * ])
 * // permissions = { 'app.upload_bundle': true, 'org.invite_user': false }
 */
export async function checkPermissionsBatch(
  checks: Array<{ permission: Permission, scope: PermissionScope }>,
): Promise<Record<string, boolean>> {
  const results = await Promise.all(
    checks.map(async ({ permission, scope }) => ({
      key: permission,
      allowed: await hasPermission(permission, scope),
    })),
  )

  return Object.fromEntries(
    results.map(({ key, allowed }) => [key, allowed]),
  )
}
