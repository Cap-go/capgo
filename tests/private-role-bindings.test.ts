import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { getAuthHeaders, getEndpointUrl, getSupabaseClient, USER_ID, USER_ID_2 } from './test-utils.ts'

let authHeaders: Record<string, string>

interface RoleBindingFixture {
  attackerOrgId: string
  attackerAppUuid: string
  attackerChannelRbacId: string
  victimOrgId: string
  victimAppUuid: string
  victimPublicAppId: string
  cleanup: () => Promise<void>
}

async function createRoleBindingFixture(): Promise<RoleBindingFixture> {
  const id = randomUUID()
  const attackerOrgId = randomUUID()
  const attackerAppUuid = randomUUID()
  const attackerPublicAppId = `com.role-binding.attacker.${id}`
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

  const { error: attackerAppError } = await supabase.from('apps').insert({
    id: attackerAppUuid,
    app_id: attackerPublicAppId,
    owner_org: attackerOrgId,
    icon_url: 'role-binding-test-icon',
    name: `Attacker App ${id}`,
  })
  if (attackerAppError)
    throw attackerAppError

  const { error: victimAppError } = await supabase.from('apps').insert({
    id: victimAppUuid,
    app_id: victimPublicAppId,
    owner_org: victimOrgId,
    icon_url: 'role-binding-test-icon',
    name: `Victim App ${id}`,
  })
  if (victimAppError)
    throw victimAppError

  const { data: attackerVersion, error: attackerVersionError } = await supabase
    .from('app_versions')
    .insert({
      app_id: attackerPublicAppId,
      name: `role-binding-version-${id.slice(0, 8)}`,
      owner_org: attackerOrgId,
      user_id: USER_ID,
      checksum: `checksum-${id}`,
      storage_provider: 'r2',
      r2_path: `orgs/${attackerOrgId}/apps/${attackerPublicAppId}/${id}.zip`,
      deleted: false,
    })
    .select('id')
    .single()
  if (attackerVersionError)
    throw attackerVersionError

  const { data: attackerChannel, error: attackerChannelError } = await supabase
    .from('channels')
    .insert({
      app_id: attackerPublicAppId,
      name: `role-binding-channel-${id.slice(0, 8)}`,
      version: attackerVersion.id,
      owner_org: attackerOrgId,
      created_by: USER_ID,
      public: false,
      allow_emulator: false,
    })
    .select('id, rbac_id')
    .single()
  if (attackerChannelError)
    throw attackerChannelError

  return {
    attackerOrgId,
    attackerAppUuid,
    attackerChannelRbacId: attackerChannel.rbac_id,
    victimOrgId,
    victimAppUuid,
    victimPublicAppId,
    cleanup: async () => {
      await supabase.from('role_bindings').delete().in('org_id', [attackerOrgId, victimOrgId])
      await supabase.from('org_users').delete().in('org_id', [attackerOrgId, victimOrgId])
      await supabase.from('channels').delete().eq('owner_org', attackerOrgId)
      await supabase.from('app_versions').delete().eq('owner_org', attackerOrgId)
      await supabase.from('apps').delete().in('id', [attackerAppUuid, victimAppUuid])
      await supabase.from('orgs').delete().in('id', [attackerOrgId, victimOrgId])
    },
  }
}

beforeAll(async () => {
  authHeaders = await getAuthHeaders()
})

describe('[POST] /private/role_bindings', () => {
  it('accepts channel-scoped bindings when channel_id is the channel RBAC uuid', async () => {
    const fixture = await createRoleBindingFixture()

    try {
      const createResponse = await fetch(getEndpointUrl('/private/role_bindings'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          principal_type: 'user',
          principal_id: USER_ID,
          role_name: 'channel_admin',
          scope_type: 'channel',
          org_id: fixture.attackerOrgId,
          app_id: fixture.attackerAppUuid,
          channel_id: fixture.attackerChannelRbacId,
          reason: 'channel uuid regression',
        }),
      })

      const createData = await createResponse.json() as { id: string, app_id: string, channel_id: string, scope_type: string }
      expect(createResponse.status).toBe(200)
      expect(createData.scope_type).toBe('channel')
      expect(createData.app_id).toBe(fixture.attackerAppUuid)
      expect(createData.channel_id).toBe(fixture.attackerChannelRbacId)

      const { data: binding, error: bindingError } = await getSupabaseClient()
        .from('role_bindings')
        .select('channel_id')
        .eq('id', createData.id)
        .single()

      expect(bindingError).toBeNull()
      expect(binding?.channel_id).toBe(fixture.attackerChannelRbacId)
    }
    finally {
      await fixture.cleanup()
    }
  })

  it('rejects app-scoped bindings when the target app belongs to another org', async () => {
    const fixture = await createRoleBindingFixture()

    try {
      const createResponse = await fetch(getEndpointUrl('/private/role_bindings'), {
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
      expect(['App not found in this org', 'not_found']).toContain(createData.error)

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
