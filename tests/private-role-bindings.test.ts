import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { env } from 'node:process'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { validatePrincipalAccess, validateRoleScope } from '../supabase/functions/_backend/private/role_bindings.ts'
import { getDrizzleClient } from '../supabase/functions/_backend/utils/pg.ts'
import { getAuthHeaders, getEndpointUrl, getSupabaseClient, POSTGRES_URL, USER_ID, USER_ID_2 } from './test-utils.ts'

let authHeaders: Record<string, string>
const USE_CLOUDFLARE = env.USE_CLOUDFLARE_WORKERS === 'true'

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
  if (USE_CLOUDFLARE)
    return

  authHeaders = await getAuthHeaders()
})

// /private/role_bindings is currently served by the Supabase private functions stack, not the Cloudflare API worker.
describe.skipIf(USE_CLOUDFLARE)('/private/role_bindings', () => {
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

  it('clears legacy org_users rights when an org-scope user binding is deleted', async () => {
    const id = randomUUID()
    const orgId = randomUUID()
    const supabase = getSupabaseClient()

    try {
      const { error: orgError } = await supabase.from('orgs').insert({
        id: orgId,
        created_by: USER_ID,
        name: `Role Binding Delete Org ${id}`,
        management_email: `role-binding-delete-${id}@capgo.app`,
        use_new_rbac: true,
      })
      expect(orgError).toBeNull()

      const { error: memberError } = await supabase.from('org_users').insert({
        org_id: orgId,
        user_id: USER_ID_2,
        user_right: 'super_admin',
        rbac_role_name: 'org_super_admin',
      })
      expect(memberError).toBeNull()

      const { data: superAdminRole, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'org_super_admin')
        .single()
      expect(roleError).toBeNull()

      const { error: bindingInsertError } = await supabase.from('role_bindings').insert({
        principal_type: 'user',
        principal_id: USER_ID_2,
        role_id: superAdminRole!.id,
        scope_type: 'org',
        org_id: orgId,
        granted_by: USER_ID,
        reason: 'delete advisory regression',
        is_direct: true,
      })
      expect(bindingInsertError).toBeNull()

      const { data: binding, error: bindingError } = await supabase
        .from('role_bindings')
        .select('id')
        .eq('principal_type', 'user')
        .eq('principal_id', USER_ID_2)
        .eq('scope_type', 'org')
        .eq('org_id', orgId)
        .single()

      expect(bindingError).toBeNull()
      expect(binding?.id).toBeTruthy()

      const deleteResponse = await fetch(getEndpointUrl(`/private/role_bindings/${binding!.id}`), {
        method: 'DELETE',
        headers: authHeaders,
      })

      const deleteData = await deleteResponse.json() as { success?: boolean, error?: string }
      expect(deleteResponse.status).toBe(200)
      expect(deleteData.success).toBe(true)

      const { data: legacyRows, error: legacyError } = await supabase
        .from('org_users')
        .select('user_right, rbac_role_name')
        .eq('org_id', orgId)
        .eq('user_id', USER_ID_2)
        .is('app_id', null)
        .is('channel_id', null)

      expect(legacyError).toBeNull()
      expect(legacyRows).toHaveLength(1)
      expect(legacyRows?.[0]?.user_right).toBeNull()
      expect(legacyRows?.[0]?.rbac_role_name).toBeNull()
    }
    finally {
      await supabase.from('role_bindings').delete().eq('org_id', orgId)
      await supabase.from('org_users').delete().eq('org_id', orgId)
      await supabase.from('orgs').delete().eq('id', orgId)
    }
  })
})

describe('private role bindings helpers', () => {
  let pool: Pool
  let client: PoolClient

  const query = (text: string, params?: Array<string | boolean | number | null>) => {
    return client.query(text, params)
  }

  async function createFixture(targetUserRight: 'admin' | 'invite_read') {
    const id = randomUUID()
    const orgId = randomUUID()
    const managementEmail = `role-binding-${id}@capgo.app`

    await query(`
      INSERT INTO public.orgs (id, name, management_email, created_by, use_new_rbac)
      VALUES ($1::uuid, $2, $3, $4::uuid, true)
    `, [orgId, `Role Binding Test Org ${id}`, managementEmail, USER_ID])

    await query(`
      INSERT INTO public.org_users (org_id, user_id, user_right)
      VALUES ($1::uuid, $2::uuid, $3::public.user_min_right)
    `, [orgId, USER_ID_2, targetUserRight])

    return { orgId }
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: POSTGRES_URL })
  })

  beforeEach(async () => {
    client = await pool.connect()
    await client.query('BEGIN')
  })

  afterEach(async () => {
    if (!client)
      return
    try {
      await client.query('ROLLBACK')
    }
    finally {
      client.release()
    }
  })

  afterAll(async () => {
    await pool.end()
  })

  it('accepts active org members as assignment targets', async () => {
    const fixture = await createFixture('admin')
    const drizzle = getDrizzleClient(client as any)

    const result = await validatePrincipalAccess(drizzle, 'user', USER_ID_2, fixture.orgId)

    expect(result).toEqual({ ok: true, data: null })
  })

  it('rejects pending invitees as assignment targets', async () => {
    const fixture = await createFixture('invite_read')
    const drizzle = getDrizzleClient(client as any)

    const result = await validatePrincipalAccess(drizzle, 'user', USER_ID_2, fixture.orgId)

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'User has not accepted the org invitation yet',
    })
  })

  it('accepts users with an active membership beyond invite-only legacy rows', async () => {
    const id = randomUUID()
    const orgId = randomUUID()
    const drizzle = getDrizzleClient(client as any)

    await query(`
      INSERT INTO public.orgs (id, name, management_email, created_by, use_new_rbac)
      VALUES ($1::uuid, $2, $3, $4::uuid, true)
    `, [orgId, `Role Binding Invite Overflow Org ${id}`, `role-binding-invite-overflow-${id}@capgo.app`, USER_ID])

    for (let index = 0; index < 10; index += 1) {
      await query(`
        INSERT INTO public.org_users (org_id, user_id, user_right)
        VALUES ($1::uuid, $2::uuid, 'invite_read'::public.user_min_right)
      `, [orgId, USER_ID_2])
    }

    await query(`
      INSERT INTO public.org_users (org_id, user_id, user_right)
      VALUES ($1::uuid, $2::uuid, 'admin'::public.user_min_right)
    `, [orgId, USER_ID_2])

    const result = await validatePrincipalAccess(drizzle, 'user', USER_ID_2, orgId)

    expect(result).toEqual({ ok: true, data: null })
  })

  it('accepts active scope-valid RBAC bindings as membership proof', async () => {
    const id = randomUUID()
    const orgId = randomUUID()
    const drizzle = getDrizzleClient(client as any)

    await query(`
      INSERT INTO public.orgs (id, name, management_email, created_by, use_new_rbac)
      VALUES ($1::uuid, $2, $3, $4::uuid, true)
    `, [orgId, `Role Binding Membership Org ${id}`, `role-binding-membership-${id}@capgo.app`, USER_ID])

    await query(`
      INSERT INTO public.role_bindings (
        principal_type,
        principal_id,
        role_id,
        scope_type,
        org_id,
        granted_by,
        granted_at,
        reason,
        is_direct
      )
      SELECT
        public.rbac_principal_user(),
        $1::uuid,
        r.id,
        public.rbac_scope_org(),
        $2::uuid,
        $3::uuid,
        now(),
        'membership-proof-test',
        true
      FROM public.roles r
      WHERE r.name = public.rbac_role_org_member()
    `, [USER_ID_2, orgId, USER_ID])

    const result = await validatePrincipalAccess(drizzle, 'user', USER_ID_2, orgId)

    expect(result).toEqual({ ok: true, data: null })
  })

  it('ignores expired RBAC bindings as membership proof', async () => {
    const id = randomUUID()
    const orgId = randomUUID()
    const drizzle = getDrizzleClient(client as any)

    await query(`
      INSERT INTO public.orgs (id, name, management_email, created_by, use_new_rbac)
      VALUES ($1::uuid, $2, $3, $4::uuid, true)
    `, [orgId, `Expired Role Binding Org ${id}`, `expired-role-binding-${id}@capgo.app`, USER_ID])

    await query(`
      INSERT INTO public.role_bindings (
        principal_type,
        principal_id,
        role_id,
        scope_type,
        org_id,
        granted_by,
        granted_at,
        expires_at,
        reason,
        is_direct
      )
      SELECT
        public.rbac_principal_user(),
        $1::uuid,
        r.id,
        public.rbac_scope_org(),
        $2::uuid,
        $3::uuid,
        now(),
        now() - interval '1 hour',
        'expired-membership-proof-test',
        true
      FROM public.roles r
      WHERE r.name = public.rbac_role_org_member()
    `, [USER_ID_2, orgId, USER_ID])

    const result = await validatePrincipalAccess(drizzle, 'user', USER_ID_2, orgId)

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'User is not a member of this org',
    })
  })

  it('requires the role family to match the requested binding scope', () => {
    expect(validateRoleScope('app', 'app')).toEqual({ ok: true, data: null })
    expect(validateRoleScope('org', 'app')).toEqual({
      ok: false,
      status: 400,
      error: 'Role scope_type does not match binding scope',
    })
  })
})
