import { sql } from 'drizzle-orm'
import type { getDrizzleClient } from '../../utils/pg.ts'
import { quickError, simpleError } from '../../utils/hono.ts'

export const APIKEY_GLOBAL_PERMISSION_ORG_CREATE = 'org.create'

const SUPPORTED_APIKEY_GLOBAL_PERMISSIONS = new Set([
  APIKEY_GLOBAL_PERMISSION_ORG_CREATE,
])

const ORG_CREATE_ROLE_NAMES = new Set([
  'org_super_admin',
  'org_admin',
])

interface ApiKeyGlobalPermissionBinding {
  role_name: string
  scope_type: string
}

type DrizzleExecutor = Pick<ReturnType<typeof getDrizzleClient>, 'execute'>

export function parseApiKeyGlobalPermissions(value: unknown, requestId?: string): string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value)) {
    throw simpleError('invalid_global_permissions', 'global_permissions must be an array', { requestId })
  }

  const permissions = [...new Set(value)]
  for (const permission of permissions) {
    if (typeof permission !== 'string' || !SUPPORTED_APIKEY_GLOBAL_PERMISSIONS.has(permission)) {
      throw simpleError('invalid_global_permissions', 'Unsupported API key global permission', { requestId, permission })
    }
  }

  return permissions
}

export function apiKeyBindingsAllowOrgCreate(bindings: ApiKeyGlobalPermissionBinding[]) {
  return bindings.some(binding =>
    binding.scope_type === 'org' && ORG_CREATE_ROLE_NAMES.has(binding.role_name),
  )
}

export function validateApiKeyGlobalPermissionsForBindings(
  permissions: string[],
  bindings: ApiKeyGlobalPermissionBinding[],
  requestId?: string,
) {
  if (!permissions.includes(APIKEY_GLOBAL_PERMISSION_ORG_CREATE)) {
    return
  }

  if (!apiKeyBindingsAllowOrgCreate(bindings)) {
    throw quickError(400, 'invalid_global_permissions', 'org.create requires an org-scoped admin API key binding', { requestId })
  }
}

export async function replaceApiKeyGlobalPermissions(
  db: DrizzleExecutor,
  apikeyRbacId: string,
  permissions: string[],
  grantedBy: string,
) {
  await db.execute(sql`
    DELETE FROM public.apikey_global_permissions
    WHERE apikey_rbac_id = ${apikeyRbacId}::uuid
  `)

  if (!permissions.includes(APIKEY_GLOBAL_PERMISSION_ORG_CREATE)) {
    return
  }

  await db.execute(sql`
    INSERT INTO public.apikey_global_permissions (
      apikey_rbac_id,
      permission_key,
      granted_by,
      reason
    )
    VALUES (
      ${apikeyRbacId}::uuid,
      public.rbac_perm_org_create(),
      ${grantedBy}::uuid,
      'Granted from API key management'
    )
    ON CONFLICT (apikey_rbac_id, permission_key) DO UPDATE
    SET
      granted_by = EXCLUDED.granted_by,
      reason = EXCLUDED.reason
  `)
}

export async function assertApiKeyCanKeepOrgCreateGrant(
  db: DrizzleExecutor,
  apikeyRbacId: string,
  permissions: string[],
  requestId?: string,
) {
  if (!permissions.includes(APIKEY_GLOBAL_PERMISSION_ORG_CREATE)) {
    return
  }

  const result = await db.execute<{ allowed: boolean }>(sql`
    SELECT public.apikey_has_current_org_create_capability(${apikeyRbacId}::uuid) AS allowed
  `)
  if (result.rows[0]?.allowed !== true) {
    throw quickError(400, 'invalid_global_permissions', 'org.create requires an org-scoped admin API key binding', { requestId })
  }
}

export function attachApiKeyGlobalPermissions<T extends { rbac_id: string | null }>(
  apikeys: T[],
  permissionRows: Array<{ apikey_rbac_id: string, permission_key: string }>,
) {
  const permissionsByRbacId = new Map<string, string[]>()

  for (const permission of permissionRows) {
    const existing = permissionsByRbacId.get(permission.apikey_rbac_id) ?? []
    existing.push(permission.permission_key)
    permissionsByRbacId.set(permission.apikey_rbac_id, existing)
  }

  return apikeys.map(apikey => ({
    ...apikey,
    global_permissions: apikey.rbac_id ? permissionsByRbacId.get(apikey.rbac_id) ?? [] : [],
  }))
}
