import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { useCors } from '../utils/hono.ts'
import { middlewareAuth } from '../utils/hono.ts'
import { getDrizzleClient } from '../utils/pg.ts'
import { eq, and } from 'drizzle-orm'
import { schema } from '../utils/postgres_schema.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)
app.use('/', middlewareAuth)

// GET /private/role_bindings/:org_id - Liste des bindings d'un org
app.get('/:org_id', async (c: Context<MiddlewareKeyVariables>) => {
  const orgId = c.req.param('org_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Vérifier que l'utilisateur a accès à cet org
    const orgAccess = await drizzle
      .select()
      .from(schema.org_users)
      .where(
        and(
          eq(schema.org_users.user_id, userId),
          eq(schema.org_users.org_id, orgId),
        ),
      )
      .limit(1)

    if (!orgAccess.length) {
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

    return c.json(bindings)
  }
  catch (error) {
    console.error('Error fetching role bindings:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /private/role_bindings - Assigner un rôle
app.post('/', async (c: Context<MiddlewareKeyVariables>) => {
  const userId = c.get('auth')?.userId
  const body = await c.req.json()

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
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
  } = body

  // Validation
  if (!principal_type || !principal_id || !role_name || !scope_type || !org_id) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  if (!['user', 'group', 'apikey'].includes(principal_type)) {
    return c.json({ error: 'Invalid principal_type' }, 400)
  }

  if (!['platform', 'org', 'app', 'channel'].includes(scope_type)) {
    return c.json({ error: 'Invalid scope_type' }, 400)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Vérifier les droits admin sur l'org
    const orgAccess = await drizzle
      .select()
      .from(schema.org_users)
      .where(
        and(
          eq(schema.org_users.user_id, userId),
          eq(schema.org_users.org_id, org_id),
        ),
      )
      .limit(1)

    if (!orgAccess.length || orgAccess[0].user_right < 'admin') {
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

    // Vérifier la cohérence du scope
    if (scope_type === 'app' && !app_id) {
      return c.json({ error: 'app_id required for app scope' }, 400)
    }
    if (scope_type === 'channel' && (!app_id || !channel_id)) {
      return c.json({ error: 'app_id and channel_id required for channel scope' }, 400)
    }

    // Si principal_type est user, vérifier qu'il fait partie de l'org
    if (principal_type === 'user') {
      const targetOrgAccess = await drizzle
        .select()
        .from(schema.org_users)
        .where(
          and(
            eq(schema.org_users.user_id, principal_id),
            eq(schema.org_users.org_id, org_id),
          ),
        )
        .limit(1)

      if (!targetOrgAccess.length) {
        return c.json({ error: 'User is not a member of this org' }, 400)
      }
    }

    // Si principal_type est group, vérifier qu'il appartient à l'org
    if (principal_type === 'group') {
      const [group] = await drizzle
        .select()
        .from(schema.groups)
        .where(
          and(
            eq(schema.groups.id, principal_id),
            eq(schema.groups.org_id, org_id),
          ),
        )
        .limit(1)

      if (!group) {
        return c.json({ error: 'Group not found in this org' }, 400)
      }
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

    return c.json(binding)
  }
  catch (error: any) {
    console.error('Error creating role binding:', error)

    // Gestion des erreurs de contrainte unique (SSD)
    if (error?.code === '23505') {
      return c.json({ error: 'User already has a role in this family at this scope' }, 409)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /private/role_bindings/:binding_id - Retirer un rôle
app.delete('/:binding_id', async (c: Context<MiddlewareKeyVariables>) => {
  const bindingId = c.req.param('binding_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Récupérer le binding et vérifier l'accès
    const [binding] = await drizzle
      .select()
      .from(schema.role_bindings)
      .where(eq(schema.role_bindings.id, bindingId))
      .limit(1)

    if (!binding) {
      return c.json({ error: 'Role binding not found' }, 404)
    }

    // Vérifier les droits admin sur l'org
    const orgAccess = await drizzle
      .select()
      .from(schema.org_users)
      .where(
        and(
          eq(schema.org_users.user_id, userId),
          eq(schema.org_users.org_id, binding.org_id),
        ),
      )
      .limit(1)

    if (!orgAccess.length || orgAccess[0].user_right < 'admin') {
      return c.json({ error: 'Forbidden - Admin rights required' }, 403)
    }

    // Supprimer le binding
    await drizzle
      .delete(schema.role_bindings)
      .where(eq(schema.role_bindings.id, bindingId))

    return c.json({ success: true })
  }
  catch (error) {
    console.error('Error deleting role binding:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})
