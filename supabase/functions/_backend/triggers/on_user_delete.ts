import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { unsubscribeBento } from '../utils/bento.ts'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { cancelSubscription } from '../utils/stripe.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

// on_user_delete - this is called 30 days before the user is actually deleted
// This function is used to cancel the subscriptions of the user's organizations
async function deleteUser(c: Context, record: Database['public']['Tables']['users']['Row']) {
  // Process user deletion with timeout protection
  const startTime = Date.now()
  const supabase = supabaseAdmin(c)
  const now = new Date()

  // 1. Find organizations where this user is the only super admin
  const { data: legacySuperAdminOrgs, error: legacySuperAdminError } = await supabase
    .from('org_users')
    .select('org_id')
    .eq('user_id', record.id)
    .eq('user_right', 'super_admin')

  if (legacySuperAdminError) {
    cloudlog({ requestId: c.get('requestId'), message: 'legacy super admin lookup failed', error: legacySuperAdminError })
    return c.json(BRES)
  }

  const { data: directRbacBindings, error: directRbacError } = await supabase
    .from('role_bindings')
    .select('org_id, expires_at, roles!inner(name)')
    .eq('principal_type', 'user')
    .eq('principal_id', record.id)
    .eq('scope_type', 'org')
    .in('roles.name', ['org_super_admin'])

  if (directRbacError) {
    cloudlog({ requestId: c.get('requestId'), message: 'direct RBAC super admin lookup failed', error: directRbacError })
    return c.json(BRES)
  }

  const { data: userGroups, error: userGroupsError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', record.id)

  if (userGroupsError) {
    cloudlog({ requestId: c.get('requestId'), message: 'user group lookup failed', error: userGroupsError })
    return c.json(BRES)
  }

  const groupIds = (userGroups ?? [])
    .map(group => group.group_id)
    .filter((groupId): groupId is string => Boolean(groupId))

  let groupRbacBindings: any[] = []
  if (groupIds.length > 0) {
    const { data, error } = await supabase
      .from('role_bindings')
      .select('org_id, principal_id, expires_at, roles!inner(name)')
      .eq('principal_type', 'group')
      .eq('scope_type', 'org')
      .in('principal_id', groupIds)
      .in('roles.name', ['org_super_admin'])

    if (error) {
      cloudlog({ requestId: c.get('requestId'), message: 'group RBAC super admin lookup failed', error })
      return c.json(BRES)
    }

    groupRbacBindings = data ?? []
  }

  const candidateOrgIds = new Set<string>()
  for (const org of legacySuperAdminOrgs ?? []) {
    if (org.org_id)
      candidateOrgIds.add(org.org_id)
  }

  for (const binding of directRbacBindings ?? []) {
    const expiresAt = (binding as any).expires_at as string | null | undefined
    if (expiresAt && new Date(expiresAt) <= now)
      continue
    const orgId = (binding as any).org_id as string | null | undefined
    if (orgId)
      candidateOrgIds.add(orgId)
  }

  for (const binding of groupRbacBindings ?? []) {
    const expiresAt = (binding as any).expires_at as string | null | undefined
    if (expiresAt && new Date(expiresAt) <= now)
      continue
    const orgId = (binding as any).org_id as string | null | undefined
    if (orgId)
      candidateOrgIds.add(orgId)
  }

  if (candidateOrgIds.size === 0) {
    return c.json(BRES)
  }

  const orgIds = Array.from(candidateOrgIds)

  // For each org where user is super admin, check if they are the only one
  const { data: legacySuperAdmins, error: legacyAdminsError } = await supabase
    .from('org_users')
    .select('org_id, user_id')
    .in('org_id', orgIds)
    .eq('user_right', 'super_admin')

  if (legacyAdminsError || !legacySuperAdmins) {
    cloudlog({ requestId: c.get('requestId'), message: 'legacy super admin count failed', error: legacyAdminsError })
    return c.json(BRES)
  }

  const { data: rbacUserAdmins, error: rbacUserAdminsError } = await supabase
    .from('role_bindings')
    .select('org_id, principal_id, expires_at, roles!inner(name)')
    .eq('principal_type', 'user')
    .eq('scope_type', 'org')
    .in('org_id', orgIds)
    .in('roles.name', ['org_super_admin'])

  if (rbacUserAdminsError) {
    cloudlog({ requestId: c.get('requestId'), message: 'RBAC user admin count failed', error: rbacUserAdminsError })
    return c.json(BRES)
  }

  const { data: rbacGroupAdmins, error: rbacGroupAdminsError } = await supabase
    .from('role_bindings')
    .select('org_id, principal_id, expires_at, roles!inner(name)')
    .eq('principal_type', 'group')
    .eq('scope_type', 'org')
    .in('org_id', orgIds)
    .in('roles.name', ['org_super_admin'])

  if (rbacGroupAdminsError) {
    cloudlog({ requestId: c.get('requestId'), message: 'RBAC group admin count failed', error: rbacGroupAdminsError })
    return c.json(BRES)
  }

  const activeGroupBindings = (rbacGroupAdmins ?? []).filter((binding) => {
    const expiresAt = (binding as any).expires_at as string | null | undefined
    return !expiresAt || new Date(expiresAt) > now
  })
  const rbacGroupIds = activeGroupBindings
    .map(binding => (binding as any).principal_id as string | null | undefined)
    .filter((groupId): groupId is string => Boolean(groupId))

  const groupMembersByGroup = new Map<string, string[]>()
  if (rbacGroupIds.length > 0) {
    const { data: groupMembers, error: groupMembersError } = await supabase
      .from('group_members')
      .select('group_id, user_id')
      .in('group_id', rbacGroupIds)

    if (groupMembersError) {
      cloudlog({ requestId: c.get('requestId'), message: 'RBAC group members count failed', error: groupMembersError })
      return c.json(BRES)
    }

    for (const member of groupMembers ?? []) {
      if (!member.group_id || !member.user_id)
        continue
      const existing = groupMembersByGroup.get(member.group_id) ?? []
      existing.push(member.user_id)
      groupMembersByGroup.set(member.group_id, existing)
    }
  }

  const orgAdminUsers = new Map<string, Set<string>>()
  const addOrgAdminUser = (orgId: string | null | undefined, userId: string | null | undefined) => {
    if (!orgId || !userId)
      return
    const existing = orgAdminUsers.get(orgId) ?? new Set<string>()
    existing.add(userId)
    orgAdminUsers.set(orgId, existing)
  }

  for (const item of legacySuperAdmins) {
    addOrgAdminUser(item.org_id, item.user_id)
  }

  for (const binding of rbacUserAdmins ?? []) {
    const expiresAt = (binding as any).expires_at as string | null | undefined
    if (expiresAt && new Date(expiresAt) <= now)
      continue
    addOrgAdminUser((binding as any).org_id, (binding as any).principal_id)
  }

  for (const binding of activeGroupBindings) {
    const orgId = (binding as any).org_id as string | null | undefined
    const groupId = (binding as any).principal_id as string | null | undefined
    if (!orgId || !groupId)
      continue
    const members = groupMembersByGroup.get(groupId) ?? []
    for (const userId of members) {
      addOrgAdminUser(orgId, userId)
    }
  }

  // Get orgs where user is the only super admin
  const singleSuperAdminOrgs = orgIds.filter((orgId) => {
    const admins = orgAdminUsers.get(orgId)
    return admins?.size === 1 && admins.has(record.id)
  })

  if (singleSuperAdminOrgs.length === 0) {
    return c.json(BRES)
  }

  const { data: orgs } = await supabaseAdmin(c)
    .from('orgs')
    .select('id, customer_id, management_email')
    .in('id', singleSuperAdminOrgs)

  const promises = []
  if (orgs && orgs.length > 0) {
    cloudlog({ requestId: c.get('requestId'), message: 'cleaning up orgs', count: orgs.length })

    for (const org of orgs) {
      // Cancel org subscriptions if they exist
      if (org.customer_id) {
        promises.push(cancelSubscription(c, org.customer_id))
      }
      if (org.management_email) {
        promises.push(unsubscribeBento(c, org.management_email))
      }
    }
  }

  // 2. Unsubscribe user from Bento mailing list
  if (record.email) {
    promises.push(unsubscribeBento(c, record.email))
  }

  // 3. Delete user avatar images from storage
  // User avatars are stored at: images/{user_id}/*
  const deleteUserImages = async () => {
    try {
      const { data: files } = await supabaseAdmin(c)
        .storage
        .from('images')
        .list(record.id)

      if (files && files.length > 0) {
        const filePaths = files.map(file => `${record.id}/${file.name}`)
        await supabaseAdmin(c)
          .storage
          .from('images')
          .remove(filePaths)
        cloudlog({ requestId: c.get('requestId'), message: 'deleted user images', count: files.length, user_id: record.id })
      }
    }
    catch (error) {
      cloudlog({ requestId: c.get('requestId'), message: 'error deleting user images', error, user_id: record.id })
    }
  }
  promises.push(deleteUserImages())

  await Promise.all(promises)

  // 4. Track performance metrics
  const endTime = Date.now()
  const duration = endTime - startTime

  cloudlog({
    requestId: c.get('requestId'),
    context: 'user deletion completed',
    duration_ms: duration,
    user_id: record.id,
  })

  return c.json(BRES)
}

app.post('/', middlewareAPISecret, triggerValidator('users', 'DELETE'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['users']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record?.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'no user id' })
    return c.json(BRES)
  }

  return deleteUser(c, record)
})
