import type { Database } from '~/types/supabase.types'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getSupabaseClient,
  SUPABASE_ANON_KEY,
  SUPABASE_BASE_URL,
  USER_EMAIL,
  USER_ID,
  USER_ID_2,
  USER_PASSWORD,
} from './test-utils.ts'

const USER_EMAIL_2 = 'test2@capgo.app'
const transferOrgId = randomUUID()
const protectedOrgId = randomUUID()
const orgIds = [transferOrgId, protectedOrgId]

function createAuthClient() {
  return createClient<Database>(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
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
    use_new_rbac: true,
  }).throwOnError()

  await supabase.from('org_users').insert({
    org_id: orgId,
    user_id: USER_ID_2,
    user_right: 'read',
  }).throwOnError()
}

describe('organization ownership transfer', () => {
  const ownerClient = createAuthClient()
  const memberClient = createAuthClient()

  beforeAll(async () => {
    const { error: ownerSignInError } = await ownerClient.auth.signInWithPassword({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    })
    if (ownerSignInError)
      throw ownerSignInError

    const { error: memberSignInError } = await memberClient.auth.signInWithPassword({
      email: USER_EMAIL_2,
      password: USER_PASSWORD,
    })
    if (memberSignInError)
      throw memberSignInError

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

    await supabase.from('role_bindings').delete().in('org_id', orgIds).throwOnError()
    await supabase.from('org_users').delete().in('org_id', orgIds).throwOnError()
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
