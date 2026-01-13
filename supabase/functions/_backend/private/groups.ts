import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { getDrizzleClient } from '../utils/pg.ts'
import { checkPermission } from '../utils/rbac.ts'
import { schema } from '../utils/postgres_schema.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)
app.use('/', middlewareAuth)

// GET /private/groups/:org_id - Liste des groupes d'un org
app.get('/:org_id', async (c: Context<MiddlewareKeyVariables>) => {
  const orgId = c.req.param('org_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!(await checkPermission(c, 'org.read_members', { orgId }))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Récupérer les groupes
    const groups = await drizzle
      .select({
        id: schema.groups.id,
        name: schema.groups.name,
        description: schema.groups.description,
        is_system: schema.groups.is_system,
        created_at: schema.groups.created_at,
      })
      .from(schema.groups)
      .where(eq(schema.groups.org_id, orgId))
      .orderBy(schema.groups.name)

    return c.json(groups)
  }
  catch (error) {
    console.error('Error fetching groups:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /private/groups/:org_id - Créer un groupe
app.post('/:org_id', async (c: Context<MiddlewareKeyVariables>) => {
  const orgId = c.req.param('org_id')
  const userId = c.get('auth')?.userId
  const body = await c.req.json()

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!(await checkPermission(c, 'org.update_user_roles', { orgId }))) {
    return c.json({ error: 'Forbidden - Admin rights required' }, 403)
  }

  const { name, description } = body

  if (!name) {
    return c.json({ error: 'Name is required' }, 400)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Créer le groupe
    const [group] = await drizzle
      .insert(schema.groups)
      .values({
        org_id: orgId,
        name,
        description: description || null,
        created_by: userId,
        is_system: false,
      })
      .returning()

    return c.json(group)
  }
  catch (error) {
    console.error('Error creating group:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PUT /private/groups/:group_id - Modifier un groupe
app.put('/:group_id', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const userId = c.get('auth')?.userId
  const body = await c.req.json()

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { name, description } = body

  try {
    const drizzle = await getDrizzleClient(c)

    // Récupérer le groupe et vérifier l'accès
    const [group] = await drizzle
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, groupId))
      .limit(1)

    if (!group) {
      return c.json({ error: 'Group not found' }, 404)
    }

    if (group.is_system) {
      return c.json({ error: 'Cannot modify system group' }, 403)
    }

    if (!(await checkPermission(c, 'org.update_user_roles', { orgId: group.org_id }))) {
      return c.json({ error: 'Forbidden - Admin rights required' }, 403)
    }

    // Mettre à jour
    const [updated] = await drizzle
      .update(schema.groups)
      .set({
        name: name || group.name,
        description: description !== undefined ? description : group.description,
      })
      .where(eq(schema.groups.id, groupId))
      .returning()

    return c.json(updated)
  }
  catch (error) {
    console.error('Error updating group:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /private/groups/:group_id - Supprimer un groupe
app.delete('/:group_id', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Récupérer le groupe et vérifier l'accès
    const [group] = await drizzle
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, groupId))
      .limit(1)

    if (!group) {
      return c.json({ error: 'Group not found' }, 404)
    }

    if (group.is_system) {
      return c.json({ error: 'Cannot delete system group' }, 403)
    }

    if (!(await checkPermission(c, 'org.update_user_roles', { orgId: group.org_id }))) {
      return c.json({ error: 'Forbidden - Admin rights required' }, 403)
    }

    // Supprimer (cascade supprimera group_members et role_bindings)
    await drizzle
      .delete(schema.groups)
      .where(eq(schema.groups.id, groupId))

    return c.json({ success: true })
  }
  catch (error) {
    console.error('Error deleting group:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /private/groups/:group_id/members - Membres d'un groupe
app.get('/:group_id/members', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Récupérer le groupe et vérifier l'accès
    const [group] = await drizzle
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, groupId))
      .limit(1)

    if (!group) {
      return c.json({ error: 'Group not found' }, 404)
    }

    if (!(await checkPermission(c, 'org.read_members', { orgId: group.org_id }))) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Récupérer les membres avec leurs infos
    const members = await drizzle
      .select({
        user_id: schema.group_members.user_id,
        email: schema.users.email,
        added_at: schema.group_members.added_at,
      })
      .from(schema.group_members)
      .innerJoin(schema.users, eq(schema.group_members.user_id, schema.users.id))
      .where(eq(schema.group_members.group_id, groupId))
      .orderBy(schema.users.email)

    return c.json(members)
  }
  catch (error) {
    console.error('Error fetching group members:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /private/groups/:group_id/members - Ajouter un membre
app.post('/:group_id/members', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const userId = c.get('auth')?.userId
  const body = await c.req.json()

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { user_id: targetUserId } = body

  if (!targetUserId) {
    return c.json({ error: 'user_id is required' }, 400)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Récupérer le groupe et vérifier l'accès
    const [group] = await drizzle
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, groupId))
      .limit(1)

    if (!group) {
      return c.json({ error: 'Group not found' }, 404)
    }

    if (!(await checkPermission(c, 'org.update_user_roles', { orgId: group.org_id }))) {
      return c.json({ error: 'Forbidden - Admin rights required' }, 403)
    }

    // Vérifier que le target user fait partie de l'org
    const targetRbacAccess = await drizzle
      .select({ id: schema.role_bindings.id })
      .from(schema.role_bindings)
      .where(
        and(
          eq(schema.role_bindings.principal_type, 'user'),
          eq(schema.role_bindings.principal_id, targetUserId),
          eq(schema.role_bindings.org_id, group.org_id),
        ),
      )
      .limit(1)

    if (!targetRbacAccess.length) {
      const targetLegacyAccess = await drizzle
        .select({ id: schema.org_users.id })
        .from(schema.org_users)
        .where(
          and(
            eq(schema.org_users.user_id, targetUserId),
            eq(schema.org_users.org_id, group.org_id),
          ),
        )
        .limit(1)

      if (!targetLegacyAccess.length) {
        return c.json({ error: 'User is not a member of this org' }, 400)
      }
    }

    // Ajouter le membre (ON CONFLICT DO NOTHING pour idempotence)
    const [member] = await drizzle
      .insert(schema.group_members)
      .values({
        group_id: groupId,
        user_id: targetUserId,
        added_by: userId,
      })
      .onConflictDoNothing()
      .returning()

    return c.json(member || { message: 'User already in group' })
  }
  catch (error) {
    console.error('Error adding group member:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /private/groups/:group_id/members/:user_id - Retirer un membre
app.delete('/:group_id/members/:user_id', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const targetUserId = c.req.param('user_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const drizzle = await getDrizzleClient(c)

    // Récupérer le groupe et vérifier l'accès
    const [group] = await drizzle
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.id, groupId))
      .limit(1)

    if (!group) {
      return c.json({ error: 'Group not found' }, 404)
    }

    if (!(await checkPermission(c, 'org.update_user_roles', { orgId: group.org_id }))) {
      return c.json({ error: 'Forbidden - Admin rights required' }, 403)
    }

    // Retirer le membre
    await drizzle
      .delete(schema.group_members)
      .where(
        and(
          eq(schema.group_members.group_id, groupId),
          eq(schema.group_members.user_id, targetUserId),
        ),
      )

    return c.json({ success: true })
  }
  catch (error) {
    console.error('Error removing group member:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})
