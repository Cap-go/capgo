import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { and, eq } from 'drizzle-orm'
import { createHono, middlewareAuth, useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { schema } from '../utils/postgres_schema.ts'
import { checkPermission } from '../utils/rbac.ts'
import { version } from '../utils/version.ts'

const PRINCIPAL_TYPES = ['user', 'group', 'apikey'] as const
const SCOPE_TYPES = ['platform', 'org', 'app', 'channel'] as const

interface RoleBindingBody {
  principal_type: (typeof PRINCIPAL_TYPES)[number]
  principal_id: string
  role_name: string
  scope_type: (typeof SCOPE_TYPES)[number]
  org_id: string
  app_id?: string
  channel_id?: number
  reason?: string
}

type ValidationResult<T> = { ok: true, data: T } | { ok: false, status: number, error: string }

export const app = createHono('', version)

app.use('/', useCors)
app.use('/', middlewareAuth)

function parseRoleBindingBody(body: any): ValidationResult<RoleBindingBody> {
  const {
    principal_type,
    principal_id,
    role_name,
    scope_type,
    org_id,
    app_id,
    channel_id,
    reason,
  } = body ?? {}

  if (!principal_type || !principal_id || !role_name || !scope_type || !org_id) {
    return { ok: false, status: 400, error: 'Missing required fields' }
  }

  if (!PRINCIPAL_TYPES.includes(principal_type)) {
    return { ok: false, status: 400, error: 'Invalid principal_type' }
  }

  if (!SCOPE_TYPES.includes(scope_type)) {
    return { ok: false, status: 400, error: 'Invalid scope_type' }
  }

  return {
    ok: true,
    data: {
      principal_type,
      principal_id,
      role_name,
      scope_type,
      org_id,
      app_id,
      channel_id,
      reason,
    },
  }
}

function validateScope(scopeType: RoleBindingBody['scope_type'], appId?: string, channelId?: number): ValidationResult<null> {
  if (scopeType === 'app' && !appId) {
    return { ok: false, status: 400, error: 'app_id required for app scope' }
  }
  if (scopeType === 'channel' && (!appId || !channelId)) {
    return { ok: false, status: 400, error: 'app_id and channel_id required for channel scope' }
  }
  return { ok: true, data: null }
}

async function validatePrincipalAccess(
  drizzle: ReturnType<typeof getDrizzleClient>,
  principalType: RoleBindingBody['principal_type'],
  principalId: string,
  orgId: string,
): Promise<ValidationResult<null>> {
  if (principalType === 'user') {
    const targetRbacAccess = await drizzle
      .select({ id: schema.role_bindings.id })
      .from(schema.role_bindings)
      .where(
        and(
          eq(schema.role_bindings.principal_type, 'user'),
          eq(schema.role_bindings.principal_id, principalId),
          eq(schema.role_bindings.org_id, orgId),
        ),
      )
      .limit(1)

    if (targetRbacAccess.length) {
      return { ok: true, data: null }
    }

    const targetLegacyAccess = await drizzle
      .select({ id: schema.org_users.id })
      .from(schema.org_users)
      .where(
        and(
          eq(schema.org_users.user_id, principalId),
          eq(schema.org_users.org_id, orgId),
        ),
      )
      .limit(1)

    if (!targetLegacyAccess.length) {
      return { ok: false, status: 400, error: 'User is not a member of this org' }
    }

    return { ok: true, data: null }
  }

  if (principalType === 'group') {
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
  }

  return { ok: true, data: null }
}

// GET /private/role_bindings/:org_id - Liste des bindings d'un org
app.get('/:org_id', async (c: Context<MiddlewareKeyVariables>) => {
  const orgId = c.req.param('org_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    if (!(await checkPermission(c, 'org.read_members', { orgId }))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Récupérer tous les bindings de l'org avec les infos associées
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

// POST /private/role_bindings - Assigner un rôle
app.post('/', async (c: Context<MiddlewareKeyVariables>) => {
  const userId = c.get('auth')?.userId
  const body = await c.req.json()

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const parsedBody = parseRoleBindingBody(body)
  if (!parsedBody.ok) {
    return c.json({ error: parsedBody.error }, parsedBody.status as any)
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
  } = parsedBody.data

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    if (!(await checkPermission(c, 'org.update_user_roles', { orgId: org_id }))) {
      return c.json({ error: 'Forbidden - Admin rights required' }, 403)
    }

    // Récupérer le rôle par son nom
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

    const scopeValidation = validateScope(scope_type, app_id, channel_id)
    if (!scopeValidation.ok) {
      return c.json({ error: scopeValidation.error }, scopeValidation.status as any)
    }

    const principalValidation = await validatePrincipalAccess(drizzle, principal_type, principal_id, org_id)
    if (!principalValidation.ok) {
      return c.json({ error: principalValidation.error }, principalValidation.status as any)
    }

    // Créer le binding
    const [binding] = await drizzle
      .insert(schema.role_bindings)
      .values({
        principal_type,
        principal_id,
        role_id: role.id,
        scope_type,
        org_id,
        app_id: app_id || null,
        channel_id: channel_id || null,
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
      channel_id,
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
    }
    else {
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
    }

    // Gestion des erreurs de contrainte unique (SSD)
    if (error?.code === '23505') {
      return c.json({ error: 'User already has a role in this family at this scope' }, 409)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }
})

// DELETE /private/role_bindings/:binding_id - Retirer un rôle
app.delete('/:binding_id', async (c: Context<MiddlewareKeyVariables>) => {
  const bindingId = c.req.param('binding_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    // Récupérer le binding et vérifier l'accès
    const [binding] = await drizzle
      .select()
      .from(schema.role_bindings)
      .where(eq(schema.role_bindings.id, bindingId))
      .limit(1)

    if (!binding) {
      return c.json({ error: 'Role binding not found' }, 404)
    }

    if (!(await checkPermission(c, 'org.update_user_roles', { orgId: binding.org_id ?? undefined }))) {
      return c.json({ error: 'Forbidden - Admin rights required' }, 403)
    }

    // Supprimer le binding
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
