import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { sValidator } from '@hono/standard-validator'
import { and, eq, sql } from 'drizzle-orm'
import { createHono, middlewareAuth, useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { schema } from '../utils/postgres_schema.ts'
import { checkPermission } from '../utils/rbac.ts'
import { version } from '../utils/version.ts'
import {
  bindingIdParamSchema,
  createRoleBindingBodyHook,
  createRoleBindingBodySchema,
  invalidBindingIdHook,
  invalidOrgIdHook,
  orgIdParamSchema,
  updateRoleBindingBodyHook,
  updateRoleBindingBodySchema,
  validateJsonBody,
} from './rbac_validation.ts'

type PrincipalType = 'user' | 'group' | 'apikey'
type ScopeType = 'org' | 'app' | 'channel'

interface RoleBindingBody {
  principal_type: PrincipalType
  principal_id: string
  role_name: string
  scope_type: ScopeType
  org_id: string
  app_id?: string | null
  channel_id?: string | number | null
  reason?: string
}

type ValidationResult<T> = { ok: true, data: T } | { ok: false, status: number, error: string }
type RouteValidationResult<T> = { ok: true, data: T } | { ok: false, response: Response }
type RoleBindingRecord = typeof schema.role_bindings.$inferSelect
const INVALID_APIKEY_ACCESS_ERROR = 'Invalid API key or access'

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAuth)

async function requireUserAuth(c: Context<MiddlewareKeyVariables>, next: () => Promise<void>) {
  if (!c.get('auth')?.userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
}

function isSupportedChannelId(channelId: RoleBindingBody['channel_id']): channelId is string | number {
  if (typeof channelId === 'number') {
    return Number.isSafeInteger(channelId) && channelId > 0
  }

  return typeof channelId === 'string' && channelId.trim().length > 0
}

function getLegacyChannelRowId(channelId: string | number): number | null {
  if (typeof channelId === 'number') {
    return channelId
  }

  const trimmedChannelId = channelId.trim()
  if (!/^\d+$/.test(trimmedChannelId)) {
    return null
  }

  const parsedChannelId = Number(trimmedChannelId)
  return Number.isSafeInteger(parsedChannelId) && parsedChannelId > 0 ? parsedChannelId : null
}

function validateScope(scopeType: RoleBindingBody['scope_type'], appId?: string | null, channelId?: RoleBindingBody['channel_id']): ValidationResult<null> {
  if (scopeType === 'app' && !appId) {
    return { ok: false, status: 400, error: 'app_id required for app scope' }
  }
  if (scopeType === 'channel' && (!appId || !isSupportedChannelId(channelId))) {
    return { ok: false, status: 400, error: 'app_id and channel_id required for channel scope' }
  }
  return { ok: true, data: null }
}

async function validateScopedAppOwnership(
  drizzle: ReturnType<typeof getDrizzleClient>,
  scopeType: RoleBindingBody['scope_type'],
  orgId: string,
  appId?: string | null,
  channelId?: RoleBindingBody['channel_id'],
): Promise<ValidationResult<{ channelRbacId: string | null }>> {
  if (scopeType !== 'app' && scopeType !== 'channel') {
    return { ok: true, data: { channelRbacId: null } }
  }

  const [app] = await drizzle
    .select({
      id: schema.apps.id,
      publicAppId: schema.apps.app_id,
    })
    .from(schema.apps)
    .where(
      and(
        eq(schema.apps.id, appId!),
        eq(schema.apps.owner_org, orgId),
      ),
    )
    .limit(1)

  if (!app) {
    return { ok: false, status: 404, error: 'App not found in this org' }
  }

  if (scopeType === 'channel') {
    if (!isSupportedChannelId(channelId)) {
      return { ok: false, status: 400, error: 'app_id and channel_id required for channel scope' }
    }

    const legacyChannelRowId = getLegacyChannelRowId(channelId)
    const normalizedChannelId = typeof channelId === 'string' ? channelId.trim() : `${channelId}`
    const [channel] = await drizzle
      .select({ rbacId: schema.channels.rbac_id })
      .from(schema.channels)
      .where(
        and(
          legacyChannelRowId !== null
            ? eq(schema.channels.id, legacyChannelRowId)
            : eq(schema.channels.rbac_id, normalizedChannelId),
          eq(schema.channels.app_id, app.publicAppId),
          eq(schema.channels.owner_org, orgId),
        ),
      )
      .limit(1)

    if (!channel) {
      return { ok: false, status: 404, error: 'Channel not found in this app/org' }
    }

    return { ok: true, data: { channelRbacId: channel.rbacId } }
  }

  return { ok: true, data: { channelRbacId: null } }
}

export function validateRoleScope(roleScopeType: string, bindingScopeType: string): ValidationResult<null> {
  if (roleScopeType !== bindingScopeType) {
    return { ok: false, status: 400, error: 'Role scope_type does not match binding scope' }
  }
  return { ok: true, data: null }
}

async function validateUserPrincipalAccess(
  drizzle: ReturnType<typeof getDrizzleClient>,
  principalId: string,
  orgId: string,
): Promise<ValidationResult<null>> {
  const activeMembership = await drizzle
    .select({ user_right: schema.org_users.user_right })
    .from(schema.org_users)
    .where(
      and(
        eq(schema.org_users.user_id, principalId),
        eq(schema.org_users.org_id, orgId),
        sql`(${schema.org_users.user_right} IS NULL OR ${schema.org_users.user_right}::text NOT LIKE 'invite_%')`,
      ),
    )
    .limit(1)

  if (activeMembership.length) {
    return { ok: true, data: null }
  }

  const pendingInvite = await drizzle
    .select({ user_right: schema.org_users.user_right })
    .from(schema.org_users)
    .where(
      and(
        eq(schema.org_users.user_id, principalId),
        eq(schema.org_users.org_id, orgId),
        sql`${schema.org_users.user_right}::text LIKE 'invite_%'`,
      ),
    )
    .limit(1)

  if (pendingInvite.length) {
    return { ok: false, status: 400, error: 'User has not accepted the org invitation yet' }
  }

  const targetRbacAccess = await drizzle
    .select({ id: schema.role_bindings.id })
    .from(schema.role_bindings)
    .innerJoin(schema.roles, and(
      eq(schema.role_bindings.role_id, schema.roles.id),
      eq(schema.role_bindings.scope_type, schema.roles.scope_type),
    ))
    .where(
      and(
        eq(schema.role_bindings.principal_type, 'user'),
        eq(schema.role_bindings.principal_id, principalId),
        eq(schema.role_bindings.org_id, orgId),
        sql`(${schema.role_bindings.expires_at} IS NULL OR ${schema.role_bindings.expires_at} > now())`,
      ),
    )
    .limit(1)

  if (!targetRbacAccess.length) {
    return { ok: false, status: 400, error: 'User is not a member of this org' }
  }

  return { ok: true, data: null }
}

async function validateGroupPrincipalAccess(
  drizzle: ReturnType<typeof getDrizzleClient>,
  principalId: string,
  orgId: string,
): Promise<ValidationResult<null>> {
  const [group] = await drizzle
    .select()
    .from(schema.groups)
    .where(
      and(
        eq(schema.groups.id, principalId),
        eq(schema.groups.org_id, orgId),
      ),
    )
    .limit(1)

  if (!group) {
    return { ok: false, status: 400, error: 'Group not found in this org' }
  }

  return { ok: true, data: null }
}

async function validateApiKeyPrincipalAccess(
  drizzle: ReturnType<typeof getDrizzleClient>,
  principalId: string,
  orgId: string,
): Promise<ValidationResult<null>> {
  const [apiKey] = await drizzle
    .select({
      user_id: schema.apikeys.user_id,
      limited_to_orgs: schema.apikeys.limited_to_orgs,
    })
    .from(schema.apikeys)
    .where(eq(schema.apikeys.rbac_id, principalId))
    .limit(1)

  if (!apiKey) {
    cloudlogErr({
      message: 'validatePrincipalAccess: missing apiKey for role binding principal',
      principalId,
      orgId,
    })
    return { ok: false, status: 400, error: INVALID_APIKEY_ACCESS_ERROR }
  }

  if (apiKey.limited_to_orgs?.length && !apiKey.limited_to_orgs.includes(orgId)) {
    cloudlogErr({
      message: 'validatePrincipalAccess: apiKey limited_to_orgs scope excludes target org',
      principalId,
      orgId,
      apiKeyUserId: apiKey.user_id,
    })
    return { ok: false, status: 400, error: INVALID_APIKEY_ACCESS_ERROR }
  }

  const [membership] = await drizzle
    .select({ id: schema.org_users.id })
    .from(schema.org_users)
    .where(
      and(
        eq(schema.org_users.user_id, apiKey.user_id),
        eq(schema.org_users.org_id, orgId),
      ),
    )
    .limit(1)

  if (membership) {
    return { ok: true, data: null }
  }

  cloudlogErr({
    message: 'validatePrincipalAccess: apiKey owner legacy membership not found',
    principalId,
    orgId,
    apiKeyUserId: apiKey.user_id,
  })

  const [ownerRbacAccess] = await drizzle
    .select({ id: schema.role_bindings.id })
    .from(schema.role_bindings)
    .where(
      and(
        eq(schema.role_bindings.principal_type, 'user'),
        eq(schema.role_bindings.principal_id, apiKey.user_id),
        eq(schema.role_bindings.org_id, orgId),
      ),
    )
    .limit(1)

  if (!ownerRbacAccess) {
    cloudlogErr({
      message: 'validatePrincipalAccess: apiKey owner RBAC access not found',
      principalId,
      orgId,
      apiKeyUserId: apiKey.user_id,
    })
    return { ok: false, status: 400, error: INVALID_APIKEY_ACCESS_ERROR }
  }

  return { ok: true, data: null }
}

export async function validatePrincipalAccess(
  drizzle: ReturnType<typeof getDrizzleClient>,
  principalType: RoleBindingBody['principal_type'],
  principalId: string,
  orgId: string,
): Promise<ValidationResult<null>> {
  if (principalType === 'user') {
    return validateUserPrincipalAccess(drizzle, principalId, orgId)
  }

  if (principalType === 'group') {
    return validateGroupPrincipalAccess(drizzle, principalId, orgId)
  }

  if (principalType === 'apikey') {
    return validateApiKeyPrincipalAccess(drizzle, principalId, orgId)
  }

  return { ok: true, data: null }
}

async function loadManagedBinding(
  c: Context<MiddlewareKeyVariables>,
  drizzle: ReturnType<typeof getDrizzleClient>,
  bindingId: string,
): Promise<RouteValidationResult<RoleBindingRecord>> {
  const [binding] = await drizzle
    .select()
    .from(schema.role_bindings)
    .where(eq(schema.role_bindings.id, bindingId))
    .limit(1)

  if (!binding) {
    return { ok: false, response: c.json({ error: 'Role binding not found' }, 404) }
  }

  if (!(await checkPermission(c, 'org.update_user_roles', { orgId: binding.org_id ?? undefined }))) {
    return { ok: false, response: c.json({ error: 'Forbidden - Admin rights required' }, 403) }
  }

  return { ok: true, data: binding }
}

async function getCallerMaxPriorityRank(
  drizzle: ReturnType<typeof getDrizzleClient>,
  authType: 'apikey' | 'jwt',
  principalId: string,
  orgId: string,
): Promise<number> {
  const principalType = authType === 'apikey' ? 'apikey' : 'user'
  const result = await drizzle
    .select({ max_rank: sql<number>`MAX(${schema.roles.priority_rank})` })
    .from(schema.role_bindings)
    .innerJoin(schema.roles, and(
      eq(schema.role_bindings.role_id, schema.roles.id),
      eq(schema.role_bindings.scope_type, schema.roles.scope_type),
    ))
    .where(
      and(
        eq(schema.role_bindings.principal_type, principalType),
        eq(schema.role_bindings.principal_id, principalId),
        eq(schema.role_bindings.org_id, orgId),
      ),
    )
    .limit(1)

  return result[0]?.max_rank ?? 0
}

// GET /private/role_bindings/:org_id - List role bindings for an org
app.get('/:org_id', requireUserAuth, sValidator('param', orgIdParamSchema, invalidOrgIdHook), async (c) => {
  const { org_id: orgId } = c.req.valid('param')

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    if (!(await checkPermission(c, 'org.read_members', { orgId }))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Retrieve all role bindings for the org with associated info
    const bindings = await drizzle
      .select({
        id: schema.role_bindings.id,
        principal_type: schema.role_bindings.principal_type,
        principal_id: schema.role_bindings.principal_id,
        role_id: schema.role_bindings.role_id,
        role_name: schema.roles.name,
        role_description: schema.roles.description,
        scope_type: schema.role_bindings.scope_type,
        org_id: schema.role_bindings.org_id,
        app_id: schema.role_bindings.app_id,
        channel_id: schema.role_bindings.channel_id,
        granted_at: schema.role_bindings.granted_at,
        granted_by: schema.role_bindings.granted_by,
        expires_at: schema.role_bindings.expires_at,
        reason: schema.role_bindings.reason,
        is_direct: schema.role_bindings.is_direct,
      })
      .from(schema.role_bindings)
      .innerJoin(schema.roles, eq(schema.role_bindings.role_id, schema.roles.id))
      .where(eq(schema.role_bindings.org_id, orgId))
      .orderBy(schema.role_bindings.granted_at)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'role_bindings_fetch',
      orgId,
      count: bindings.length,
    })

    return c.json(bindings)
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'role_bindings_fetch_failed',
      orgId,
      error,
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }
})

// POST /private/role_bindings - Assign a role
app.post('/', requireUserAuth, async (c) => {
  const auth = c.get('auth')!
  const userId = auth.userId

  const bodyResult = await validateJsonBody(c, createRoleBindingBodySchema, createRoleBindingBodyHook)
  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const {
    principal_type,
    principal_id,
    role_name,
    scope_type,
    org_id,
    app_id,
    channel_id,
    reason,
  } = bodyResult.data

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    if (!(await checkPermission(c, 'org.update_user_roles', { orgId: org_id }))) {
      return c.json({ error: 'Forbidden - Admin rights required' }, 403)
    }

    // Retrieve the role by name
    const [role] = await drizzle
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, role_name))
      .limit(1)

    if (!role) {
      return c.json({ error: 'Role not found' }, 404)
    }

    if (!role.is_assignable) {
      return c.json({ error: 'Role is not assignable' }, 403)
    }

    const roleScopeValidation = validateRoleScope(role.scope_type, scope_type)
    if (!roleScopeValidation.ok) {
      return c.json({ error: roleScopeValidation.error }, roleScopeValidation.status as any)
    }

    // Prevent privilege escalation: caller cannot assign a role with higher priority than their own
    const callerPrincipalId = auth.authType === 'apikey' ? auth.apikey!.rbac_id : auth.userId
    const callerMaxRank = await getCallerMaxPriorityRank(drizzle, auth.authType, callerPrincipalId, org_id)
    if (role.priority_rank > callerMaxRank) {
      return c.json({ error: 'Cannot assign a role with higher privileges than your own' }, 403)
    }

    const scopeValidation = validateScope(scope_type, app_id, channel_id)
    if (!scopeValidation.ok) {
      return c.json({ error: scopeValidation.error }, scopeValidation.status as any)
    }

    const scopedAppValidation = await validateScopedAppOwnership(drizzle, scope_type, org_id, app_id, channel_id)
    if (!scopedAppValidation.ok) {
      return c.json({ error: scopedAppValidation.error }, scopedAppValidation.status as any)
    }
    const normalizedChannelId = scopedAppValidation.data.channelRbacId

    const principalValidation = await validatePrincipalAccess(drizzle, principal_type, principal_id, org_id)
    if (!principalValidation.ok) {
      return c.json({ error: principalValidation.error }, principalValidation.status as any)
    }

    // Create the binding
    const [binding] = await drizzle
      .insert(schema.role_bindings)
      .values({
        principal_type,
        principal_id,
        role_id: role.id,
        scope_type,
        org_id,
        app_id: app_id || null,
        channel_id: normalizedChannelId,
        granted_by: userId,
        reason: reason || null,
        is_direct: true,
      })
      .returning()

    cloudlog({
      requestId: c.get('requestId'),
      message: 'role_binding_created',
      orgId: org_id,
      bindingId: binding?.id,
      principal_type,
      principal_id,
      role_id: role.id,
      scope_type,
      app_id,
      channel_id: normalizedChannelId,
      granted_by: userId,
    })

    return c.json(binding)
  }
  catch (error: any) {
    if (error?.code === '23505') {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'role_binding_duplicate',
        orgId: org_id,
        principal_type,
        principal_id,
        scope_type,
        app_id,
        channel_id,
      })
      return c.json({ error: 'User already has a role in this family at this scope' }, 409)
    }

    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'role_binding_create_failed',
      orgId: org_id,
      principal_type,
      principal_id,
      scope_type,
      app_id,
      channel_id,
      error,
    })

    return c.json({ error: 'Internal server error' }, 500)
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }
})

// PATCH /private/role_bindings/:binding_id - Update a role binding
app.patch(
  '/:binding_id',
  requireUserAuth,
  sValidator('param', bindingIdParamSchema, invalidBindingIdHook),
  async (c) => {
    const { binding_id: bindingId } = c.req.valid('param')
    const auth = c.get('auth')!

    const bodyResult = await validateJsonBody(c, updateRoleBindingBodySchema, updateRoleBindingBodyHook)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const { role_name: roleName } = bodyResult.data

    let pgClient
    try {
      pgClient = getPgClient(c)
      const drizzle = getDrizzleClient(pgClient)
      const bindingResult = await loadManagedBinding(c, drizzle, bindingId)
      if (!bindingResult.ok)
        return bindingResult.response
      const binding = bindingResult.data

      const [role] = await drizzle
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.name, roleName))
        .limit(1)

      if (!role) {
        return c.json({ error: 'Role not found' }, 404)
      }

      if (!role.is_assignable) {
        return c.json({ error: 'Role is not assignable' }, 403)
      }

      const principalValidation = binding.org_id
        ? await validatePrincipalAccess(drizzle, binding.principal_type as RoleBindingBody['principal_type'], binding.principal_id, binding.org_id)
        : { ok: true as const, data: null }
      if (!principalValidation.ok) {
        return c.json({ error: principalValidation.error }, principalValidation.status as any)
      }

      const roleScopeValidation = validateRoleScope(role.scope_type, binding.scope_type)
      if (!roleScopeValidation.ok) {
        return c.json({ error: roleScopeValidation.error }, roleScopeValidation.status as any)
      }

      // Prevent privilege escalation: caller cannot assign a role with higher priority than their own
      const callerPrincipalId = auth.authType === 'apikey' ? auth.apikey!.rbac_id : auth.userId
      const callerMaxRank = await getCallerMaxPriorityRank(drizzle, auth.authType, callerPrincipalId, binding.org_id!)
      if (role.priority_rank > callerMaxRank) {
        return c.json({ error: 'Cannot assign a role with higher privileges than your own' }, 403)
      }

      // Prevent privilege escalation: caller cannot modify a binding for a role with higher priority than their own
      const [existingRole] = await drizzle
        .select({ priority_rank: schema.roles.priority_rank })
        .from(schema.roles)
        .where(eq(schema.roles.id, binding.role_id!))
        .limit(1)

      if (existingRole && existingRole.priority_rank > callerMaxRank) {
        return c.json({ error: 'Cannot modify a binding for a role with higher privileges than your own' }, 403)
      }

      const [updated] = await drizzle
        .update(schema.role_bindings)
        .set({ role_id: role.id })
        .where(eq(schema.role_bindings.id, bindingId))
        .returning()

      cloudlog({
        requestId: c.get('requestId'),
        message: 'role_binding_updated',
        bindingId,
        orgId: binding.org_id,
        principal_type: binding.principal_type,
        principal_id: binding.principal_id,
        old_role_id: binding.role_id,
        new_role_id: role.id,
        scope_type: binding.scope_type,
        app_id: binding.app_id,
        channel_id: binding.channel_id,
      })

      return c.json(updated)
    }
    catch (error) {
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'role_binding_update_failed',
        bindingId,
        error,
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
    finally {
      if (pgClient) {
        await closeClient(c, pgClient)
      }
    }
  },
)

// DELETE /private/role_bindings/:binding_id - Remove a role
app.delete('/:binding_id', requireUserAuth, sValidator('param', bindingIdParamSchema, invalidBindingIdHook), async (c) => {
  const { binding_id: bindingId } = c.req.valid('param')

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)
    const bindingResult = await loadManagedBinding(c, drizzle, bindingId)
    if (!bindingResult.ok)
      return bindingResult.response
    const binding = bindingResult.data

    // Prevent privilege escalation: caller cannot delete a binding for a role with higher priority than their own
    const auth = c.get('auth')!
    const callerPrincipalId = auth.authType === 'apikey' ? auth.apikey!.rbac_id : auth.userId
    const callerMaxRank = await getCallerMaxPriorityRank(drizzle, auth.authType, callerPrincipalId, binding.org_id!)

    const [targetRole] = await drizzle
      .select({ priority_rank: schema.roles.priority_rank })
      .from(schema.roles)
      .where(eq(schema.roles.id, binding.role_id!))
      .limit(1)

    if (targetRole && targetRole.priority_rank > callerMaxRank) {
      return c.json({ error: 'Cannot delete a binding for a role with higher privileges than your own' }, 403)
    }
    await drizzle
      .delete(schema.role_bindings)
      .where(eq(schema.role_bindings.id, bindingId))

    cloudlog({
      requestId: c.get('requestId'),
      message: 'role_binding_deleted',
      bindingId,
      orgId: binding.org_id,
      principal_type: binding.principal_type,
      principal_id: binding.principal_id,
      role_id: binding.role_id,
      scope_type: binding.scope_type,
      app_id: binding.app_id,
      channel_id: binding.channel_id,
    })

    return c.json({ success: true })
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'role_binding_delete_failed',
      bindingId,
      error,
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }
})
