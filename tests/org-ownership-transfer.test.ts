import type { Database } from '~/types/supabase.types'
import { randomUUID } from 'node:crypto'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getSupabaseClient,
  SUPABASE_ANON_KEY,
  SUPABASE_BASE_URL,
  USER_ID,
  USER_ID_2,
} from './test-utils.ts'

const transferOrgId = randomUUID()
const protectedOrgId = randomUUID()
const orgIds = [transferOrgId, protectedOrgId]

async function createTestAccessToken(userId: string) {
  const jwtSecret = env.JWT_SECRET
  if (!jwtSecret)
    throw new Error('JWT_SECRET is required to create local test auth tokens')

  return new SignJWT({
    aud: 'authenticated',
    role: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('supabase-demo')
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(jwtSecret))
}

function createAuthClient(userId: string) {
  const accessToken = createTestAccessToken(userId)

  return createClient<Database>(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, {
    accessToken: () => accessToken,
  })
}

async function createOrgWithMember(orgId: string) {
  const supabase = getSupabaseClient()

  await supabase.from('orgs').insert({
    id: orgId,
    created_by: USER_ID,
    management_email: `ownership-transfer-${orgId}@capgo.app`,
    name: `Ownership transfer ${orgId}`,
    updated_at: new Date().toISOString(),
  }).throwOnError()

  await supabase.from('org_users').insert({
    org_id: orgId,
    user_id: USER_ID_2,
    rbac_role_name: 'org_member',
    is_invite: false,
  }).throwOnError()

  const { data: memberRole, error: memberRoleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'org_member')
    .eq('scope_type', 'org')
    .single()
  if (memberRoleError || !memberRole)
    throw memberRoleError ?? new Error('Expected org_member role')

  await supabase.from('role_bindings').insert({
    principal_type: 'user',
    principal_id: USER_ID_2,
    role_id: memberRole.id,
    scope_type: 'org',
    org_id: orgId,
    granted_by: USER_ID,
    reason: 'Ownership transfer test member fixture',
    is_direct: true,
  }).throwOnError()
}

describe('organization ownership transfer', () => {
  const ownerClient = createAuthClient(USER_ID)
  const memberClient = createAuthClient(USER_ID_2)

  beforeAll(async () => {
    for (const orgId of orgIds) {
      await createOrgWithMember(orgId)
    }
  })

  afterAll(async () => {
    const supabase = getSupabaseClient()
    const { data: orgs } = await supabase
      .from('orgs')
      .select('customer_id')
      .in('id', orgIds)
      .throwOnError()

    // Delete orgs first so role_bindings cascade without hitting
    // prevent_last_super_admin_binding_delete on direct binding deletes.
    await supabase.from('orgs').delete().in('id', orgIds).throwOnError()

    for (const org of orgs ?? []) {
      if (org.customer_id?.startsWith('pending_')) {
        await supabase.from('stripe_info').delete().eq('customer_id', org.customer_id).throwOnError()
      }
    }
  })

  it.concurrent('lets an owner delegate super admin and leave the org', async () => {
    const promoteResult = await ownerClient.rpc('update_org_member_role', {
      p_org_id: transferOrgId,
      p_user_id: USER_ID_2,
      p_new_role_name: 'org_super_admin',
    })

    expect(promoteResult.error).toBeNull()
    expect(promoteResult.data).toBe('OK')

    const leaveResult = await ownerClient.rpc('delete_org_member_role', {
      p_org_id: transferOrgId,
      p_user_id: USER_ID,
    })

    expect(leaveResult.error).toBeNull()
    expect(leaveResult.data).toBe('OK')

    const { data: org, error: orgError } = await getSupabaseClient()
      .from('orgs')
      .select('created_by')
      .eq('id', transferOrgId)
      .single()

    expect(orgError).toBeNull()
    expect(org?.created_by).toBe(USER_ID_2)
  })

  it.concurrent('does not let another super admin remove the owner', async () => {
    const promoteResult = await ownerClient.rpc('update_org_member_role', {
      p_org_id: protectedOrgId,
      p_user_id: USER_ID_2,
      p_new_role_name: 'org_super_admin',
    })

    expect(promoteResult.error).toBeNull()
    expect(promoteResult.data).toBe('OK')

    const removeOwnerResult = await memberClient.rpc('delete_org_member_role', {
      p_org_id: protectedOrgId,
      p_user_id: USER_ID,
    })

    expect(removeOwnerResult.data).toBeNull()
    expect(removeOwnerResult.error?.message).toContain('CANNOT_CHANGE_OWNER_ROLE')

    const { data: org, error: orgError } = await getSupabaseClient()
      .from('orgs')
      .select('created_by')
      .eq('id', protectedOrgId)
      .single()

    expect(orgError).toBeNull()
    expect(org?.created_by).toBe(USER_ID)
  })
})
