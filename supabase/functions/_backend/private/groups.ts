import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { and, eq } from 'drizzle-orm'
import { createHono, middlewareAuth, useCors } from '../utils/hono.ts'
import { cloudlogErr } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { checkPermission } from '../utils/rbac.ts'
import { schema } from '../utils/postgres_schema.ts'
import { version } from '../utils/version.ts'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string | undefined): value is string {
  return !!value && UUID_REGEX.test(value)
}

async function parseJsonBody(c: Context<MiddlewareKeyVariables>) {
  try {
    return { ok: true as const, data: await c.req.json() }
  }
  catch {
    return { ok: false as const, error: 'Invalid JSON body' }
  }
}

export const app = createHono('', version)

app.use('/', useCors)
app.use('/', middlewareAuth)

// GET /private/groups/:org_id - List groups for an org
app.get('/:org_id', async (c: Context<MiddlewareKeyVariables>) => {
  const orgId = c.req.param('org_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!isUuid(orgId)) {
    return c.json({ error: 'Invalid org_id' }, 400)
  }

  if (!(await checkPermission(c, 'org.read_members', { orgId }))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    // Fetch groups
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
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'groups_fetch_failed',
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

// POST /private/groups/:org_id - Create a group
app.post('/:org_id', async (c: Context<MiddlewareKeyVariables>) => {
  const orgId = c.req.param('org_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!isUuid(orgId)) {
    return c.json({ error: 'Invalid org_id' }, 400)
  }

  if (!(await checkPermission(c, 'org.update_user_roles', { orgId }))) {
    return c.json({ error: 'Forbidden - Admin rights required' }, 403)
  }

  const parsedBody = await parseJsonBody(c)
  if (!parsedBody.ok) {
    return c.json({ error: parsedBody.error }, 400)
  }
  const body = parsedBody.data

  const { name, description } = body

  if (!name) {
    return c.json({ error: 'Name is required' }, 400)
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    // Create the group
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
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'group_create_failed',
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

// PUT /private/groups/:group_id - Update a group
app.put('/:group_id', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!isUuid(groupId)) {
    return c.json({ error: 'Invalid group_id' }, 400)
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    // Fetch the group and verify access
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

    const parsedBody = await parseJsonBody(c)
    if (!parsedBody.ok) {
      return c.json({ error: parsedBody.error }, 400)
    }
    const { name, description } = parsedBody.data

    // Update
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
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'group_update_failed',
      groupId,
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

// DELETE /private/groups/:group_id - Delete a group
app.delete('/:group_id', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!isUuid(groupId)) {
    return c.json({ error: 'Invalid group_id' }, 400)
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    // Fetch the group and verify access
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

    // Delete atomically (cascade removes group_members)
    await drizzle.transaction(async (tx) => {
      await tx
        .delete(schema.role_bindings)
        .where(
          and(
            eq(schema.role_bindings.principal_type, 'group'),
            eq(schema.role_bindings.principal_id, groupId),
          ),
        )

      await tx
        .delete(schema.groups)
        .where(eq(schema.groups.id, groupId))
    })

    return c.json({ success: true })
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'group_delete_failed',
      groupId,
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

// GET /private/groups/:group_id/members - Group members
app.get('/:group_id/members', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!isUuid(groupId)) {
    return c.json({ error: 'Invalid group_id' }, 400)
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    // Fetch the group and verify access
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

    // Fetch members with details
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
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'group_members_fetch_failed',
      groupId,
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

// POST /private/groups/:group_id/members - Add a member
app.post('/:group_id/members', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!isUuid(groupId)) {
    return c.json({ error: 'Invalid group_id' }, 400)
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    // Fetch the group and verify access
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

    const parsedBody = await parseJsonBody(c)
    if (!parsedBody.ok) {
      return c.json({ error: parsedBody.error }, 400)
    }

    targetUserId = parsedBody.data?.user_id

    if (!targetUserId) {
      return c.json({ error: 'user_id is required' }, 400)
    }

    if (!isUuid(targetUserId)) {
      return c.json({ error: 'Invalid user_id' }, 400)
    }

    // Verify the target user belongs to the org
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

    // Add member (ON CONFLICT DO NOTHING for idempotency)
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
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'group_member_add_failed',
      groupId,
      targetUserId,
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

// DELETE /private/groups/:group_id/members/:user_id - Remove a member
app.delete('/:group_id/members/:user_id', async (c: Context<MiddlewareKeyVariables>) => {
  const groupId = c.req.param('group_id')
  const targetUserId = c.req.param('user_id')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!isUuid(groupId)) {
    return c.json({ error: 'Invalid group_id' }, 400)
  }

  if (!isUuid(targetUserId)) {
    return c.json({ error: 'Invalid user_id' }, 400)
  }

  let pgClient
  try {
    pgClient = getPgClient(c)
    const drizzle = getDrizzleClient(pgClient)

    // Fetch the group and verify access
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

    // Remove the member
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
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'group_member_remove_failed',
      groupId,
      targetUserId,
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
