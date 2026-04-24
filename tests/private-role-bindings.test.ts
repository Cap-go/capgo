import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getAuthHeaders, getSupabaseClient, USER_ID, USER_ID_2 } from './test-utils.ts'

let authHeaders: Record<string, string>

interface RoleBindingFixture {
  attackerOrgId: string
  victimOrgId: string
  victimAppUuid: string
  victimPublicAppId: string
  cleanup: () => Promise<void>
}

async function createRoleBindingFixture(): Promise<RoleBindingFixture> {
  const id = randomUUID()
  const attackerOrgId = randomUUID()
  const victimOrgId = randomUUID()
  const victimAppUuid = randomUUID()
  const victimPublicAppId = `com.role-binding.victim.${id}`
  const supabase = getSupabaseClient()

  const { error: attackerOrgError } = await supabase.from('orgs').insert({
    id: attackerOrgId,
    created_by: USER_ID,
    name: `Role Binding Attacker Org ${id}`,
    management_email: `role-binding-attacker-${id}@capgo.app`,
    use_new_rbac: true,
  })
  if (attackerOrgError)
    throw attackerOrgError

  const { error: victimOrgError } = await supabase.from('orgs').insert({
    id: victimOrgId,
    created_by: USER_ID_2,
    name: `Role Binding Victim Org ${id}`,
    management_email: `role-binding-victim-${id}@capgo.app`,
    use_new_rbac: true,
  })
  if (victimOrgError)
    throw victimOrgError

  const { error: victimAppError } = await supabase.from('apps').insert({
    id: victimAppUuid,
    app_id: victimPublicAppId,
    owner_org: victimOrgId,
    icon_url: 'role-binding-test-icon',
    name: `Victim App ${id}`,
  })
  if (victimAppError)
    throw victimAppError

  return {
    attackerOrgId,
    victimOrgId,
    victimAppUuid,
    victimPublicAppId,
    cleanup: async () => {
      await supabase.from('role_bindings').delete().in('org_id', [attackerOrgId, victimOrgId])
      await supabase.from('org_users').delete().in('org_id', [attackerOrgId, victimOrgId])
      await supabase.from('apps').delete().eq('id', victimAppUuid)
      await supabase.from('orgs').delete().in('id', [attackerOrgId, victimOrgId])
    },
  }
}

beforeAll(async () => {
  authHeaders = await getAuthHeaders()
})

describe('[POST] /private/role_bindings', () => {
  it('rejects app-scoped bindings when the target app belongs to another org', async () => {
    const fixture = await createRoleBindingFixture()

    try {
      const createResponse = await fetch(`${BASE_URL}/private/role_bindings`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          principal_type: 'user',
          principal_id: USER_ID,
          role_name: 'app_admin',
          scope_type: 'app',
          org_id: fixture.attackerOrgId,
          app_id: fixture.victimAppUuid,
          reason: 'cross-org regression',
        }),
      })

      const createData = await createResponse.json() as { error: string }
      expect(createResponse.status).toBe(404)
      expect(createData.error).toBe('App not found in this org')

      const { data: bindings, error: bindingsError } = await getSupabaseClient()
        .from('role_bindings')
        .select('id')
        .eq('org_id', fixture.attackerOrgId)
        .eq('app_id', fixture.victimAppUuid)
        .eq('principal_type', 'user')
        .eq('principal_id', USER_ID)

      expect(bindingsError).toBeNull()
      expect(bindings ?? []).toHaveLength(0)
    }
    finally {
      await fixture.cleanup()
    }
  })
})
