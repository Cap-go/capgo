import type { Database } from '../src/types/supabase.types'
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

const orgId = randomUUID()
const orgName = `Ownership transfer ${orgId}`

function createAuthClient() {
  return createClient<Database>(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
  })
}

describe('organization ownership transfer', () => {
  const authClient = createAuthClient()

  beforeAll(async () => {
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    })
    if (signInError)
      throw signInError

    const supabase = getSupabaseClient()
    await supabase.from('orgs').insert({
      id: orgId,
      created_by: USER_ID,
      management_email: `ownership-transfer-${orgId}@capgo.app`,
      name: orgName,
      updated_at: new Date().toISOString(),
      use_new_rbac: true,
    }).throwOnError()

    await supabase.from('org_users').insert({
      org_id: orgId,
      user_id: USER_ID_2,
      user_right: 'read',
    }).throwOnError()
  })

  afterAll(async () => {
    const supabase = getSupabaseClient()
    const { data: org } = await supabase
      .from('orgs')
      .select('customer_id')
      .eq('id', orgId)
      .maybeSingle()

    await supabase.from('role_bindings').delete().eq('org_id', orgId)
    await supabase.from('org_users').delete().eq('org_id', orgId)
    await supabase.from('orgs').delete().eq('id', orgId)

    if (org?.customer_id?.startsWith('pending_')) {
      await supabase.from('stripe_info').delete().eq('customer_id', org.customer_id)
    }
  })

  it('lets an owner delegate super admin and leave the org', async () => {
    const promoteResult = await authClient.rpc('update_org_member_role', {
      p_org_id: orgId,
      p_user_id: USER_ID_2,
      p_new_role_name: 'org_super_admin',
    })

    expect(promoteResult.error).toBeNull()
    expect(promoteResult.data).toBe('OK')

    const leaveResult = await authClient.rpc('delete_org_member_role', {
      p_org_id: orgId,
      p_user_id: USER_ID,
    })

    expect(leaveResult.error).toBeNull()
    expect(leaveResult.data).toBe('OK')

    const { data: org, error: orgError } = await getSupabaseClient()
      .from('orgs')
      .select('created_by')
      .eq('id', orgId)
      .single()

    expect(orgError).toBeNull()
    expect(org?.created_by).toBe(USER_ID_2)
  })
})
