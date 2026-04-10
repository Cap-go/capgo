import { sValidator } from '@hono/standard-validator'
import { and, eq } from 'drizzle-orm'
import { createHono, middlewareAuth, useCors } from '../utils/hono.ts'
import { cloudlogErr } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { schema } from '../utils/postgres_schema.ts'
import { checkPermission } from '../utils/rbac.ts'
import { version } from '../utils/version.ts'
import {
  addGroupMemberBodyHook,
  addGroupMemberBodySchema,
  createGroupBodyHook,
  createGroupBodySchema,
  groupIdParamSchema,
  groupMemberParamSchema,
  invalidGroupIdHook,
  invalidGroupMemberParamHook,
  invalidOrgIdHook,
  orgIdParamSchema,
  updateGroupBodyHook,
  updateGroupBodySchema,
  validateJsonBody,
} from './rbac_validation.ts'

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAuth)

// GET /private/groups/:org_id - List groups for an org
app.get('/:org_id', sValidator('param', orgIdParamSchema, invalidOrgIdHook), async (c) => {
  const { org_id: orgId } = c.req.valid('param')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
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
app.post(
  '/:org_id',
  sValidator('param', orgIdParamSchema, invalidOrgIdHook),
  async (c) => {
    const { org_id: orgId } = c.req.valid('param')
    const userId = c.get('auth')?.userId

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const bodyResult = await validateJsonBody(c, createGroupBodySchema, createGroupBodyHook)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    if (!(await checkPermission(c, 'org.update_user_roles', { orgId }))) {
      return c.json({ error: 'Forbidden - Admin rights required' }, 403)
    }

    const { name, description } = bodyResult.data

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
  },
)

// PUT /private/groups/:group_id - Update a group
app.put(
  '/:group_id',
  sValidator('param', groupIdParamSchema, invalidGroupIdHook),
  async (c) => {
    const { group_id: groupId } = c.req.valid('param')
    const userId = c.get('auth')?.userId

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const bodyResult = await validateJsonBody(c, updateGroupBodySchema, updateGroupBodyHook)
    if (!bodyResult.ok) {
      return bodyResult.response
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

      const { name, description } = bodyResult.data

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
  },
)

// DELETE /private/groups/:group_id - Delete a group
app.delete('/:group_id', sValidator('param', groupIdParamSchema, invalidGroupIdHook), async (c) => {
  const { group_id: groupId } = c.req.valid('param')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
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
app.get('/:group_id/members', sValidator('param', groupIdParamSchema, invalidGroupIdHook), async (c) => {
  const { group_id: groupId } = c.req.valid('param')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
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
app.post(
  '/:group_id/members',
  sValidator('param', groupIdParamSchema, invalidGroupIdHook),
  async (c) => {
    const { group_id: groupId } = c.req.valid('param')
    const userId = c.get('auth')?.userId

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const bodyResult = await validateJsonBody(c, addGroupMemberBodySchema, addGroupMemberBodyHook)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    let pgClient
    let targetUserId: string | undefined
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

      targetUserId = bodyResult.data.user_id

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
  },
)

// DELETE /private/groups/:group_id/members/:user_id - Remove a member
app.delete('/:group_id/members/:user_id', sValidator('param', groupMemberParamSchema, invalidGroupMemberParamHook), async (c) => {
  const { group_id: groupId, user_id: targetUserId } = c.req.valid('param')
  const userId = c.get('auth')?.userId

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
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
