import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../utils/supabase.types.ts'
import { quickError } from '../utils/hono.ts'

type AdminClient = SupabaseClient<Database>

type InvitationRecord = Pick<
  Database['public']['Tables']['tmp_users']['Row'],
  'org_id' | 'role' | 'rbac_role_name'
>

type InvitationOrg = Pick<
  Database['public']['Tables']['orgs']['Row'],
  'use_new_rbac'
>

const rbacRoleToLegacy: Record<string, 'read' | 'admin' | 'super_admin'> = {
  org_member: 'read',
  org_billing_admin: 'read',
  org_admin: 'admin',
  org_super_admin: 'super_admin',
}

export async function ensureOrgMembership(
  supabaseAdmin: AdminClient,
  userId: string,
  invitation: InvitationRecord,
  org: InvitationOrg,
) {
  const rbacRoleName = invitation.rbac_role_name
  const useRbacInvite = org?.use_new_rbac === true

  if (useRbacInvite && !rbacRoleName) {
    return quickError(500, 'failed_to_accept_invitation', 'Failed to resolve RBAC role', { error: 'Missing RBAC role name' })
  }

  const rbacRoleNameValue = rbacRoleName ?? ''
  const legacyRight = useRbacInvite
    ? rbacRoleToLegacy[rbacRoleNameValue] ?? 'read'
    : invitation.role
  let rbacRoleId: string | null = null

  if (useRbacInvite) {
    const { data: role, error: roleError } = await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('name', rbacRoleNameValue)
      .eq('scope_type', 'org')
      .single()

    if (roleError || !role) {
      return quickError(500, 'failed_to_accept_invitation', 'Failed to resolve RBAC role', { error: roleError?.message ?? 'Role not found' })
    }

    rbacRoleId = role.id
  }

  // Avoid creating duplicates: org_users does not have a unique constraint on (org_id, user_id).
  const { data: existingMembershipRows, error: existingMembershipError } = await supabaseAdmin
    .from('org_users')
    .select('id')
    .eq('user_id', userId)
    .eq('org_id', invitation.org_id)
    .is('app_id', null)
    .is('channel_id', null)

  if (existingMembershipError) {
    return quickError(500, 'failed_to_accept_invitation', 'Failed to check existing org membership', { error: existingMembershipError.message })
  }

  if (existingMembershipRows && existingMembershipRows.length > 0) {
    const { error: updateMembershipError } = await supabaseAdmin
      .from('org_users')
      .update({
        user_right: legacyRight,
        rbac_role_name: useRbacInvite ? rbacRoleName : null,
      })
      .eq('user_id', userId)
      .eq('org_id', invitation.org_id)
      .is('app_id', null)
      .is('channel_id', null)

    if (updateMembershipError) {
      return quickError(500, 'failed_to_accept_invitation', 'Failed to update org membership', { error: updateMembershipError.message })
    }
  }
  else {
    const { error: insertIntoMainTableError } = await supabaseAdmin.from('org_users').insert({
      user_id: userId,
      org_id: invitation.org_id,
      user_right: legacyRight,
      rbac_role_name: useRbacInvite ? rbacRoleName : null,
    })

    if (insertIntoMainTableError) {
      return quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation insert into org_users', { error: insertIntoMainTableError.message })
    }
  }

  if (useRbacInvite) {
    const { error: deleteBindingError } = await supabaseAdmin
      .from('role_bindings')
      .delete()
      .eq('principal_type', 'user')
      .eq('principal_id', userId)
      .eq('scope_type', 'org')
      .eq('org_id', invitation.org_id)

    if (deleteBindingError) {
      return quickError(500, 'failed_to_accept_invitation', 'Failed to clear existing RBAC role bindings', { error: deleteBindingError.message })
    }

    const { error: insertBindingError } = await supabaseAdmin
      .from('role_bindings')
      .insert({
        principal_type: 'user',
        principal_id: userId,
        role_id: rbacRoleId as string,
        scope_type: 'org',
        org_id: invitation.org_id,
        granted_by: userId,
        granted_at: new Date().toISOString(),
        reason: 'Accepted invitation',
        is_direct: true,
      })

    if (insertBindingError) {
      return quickError(500, 'failed_to_accept_invitation', 'Failed to create RBAC role binding', { error: insertBindingError.message })
    }
  }
}
