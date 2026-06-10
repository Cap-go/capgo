import { beforeAll, describe, expect, it } from 'vitest'
import { getAuthHeadersForCredentials, getEndpointUrl, getSupabaseClient, ORG_ID_2, USER_ADMIN_EMAIL, USER_ID, USER_ID_2, USER_ID_STATS } from './test-utils.ts'

let adminHeaders: Record<string, string>
const STALE_CREATED_BY_ORG_ID = 'f7a8b9c0-d1e2-4f3a-9b4c-5d6e7f8a9b05'

function getJwtSub(jwt: string): string {
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as { sub?: string }
  return payload.sub ?? ''
}

async function callLogAs(body: Record<string, string>) {
  const response = await fetch(getEndpointUrl('/private/log_as'), {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(body),
  })

  const data = await response.json() as { jwt?: string, refreshToken?: string, error?: string }

  expect(response.status).toBe(200)
  expect(data.error).toBeUndefined()
  expect(data.jwt).toBeTruthy()
  expect(data.refreshToken).toBeTruthy()

  return data.jwt!
}

async function seedStaleCreatedByOrg() {
  const supabase = getSupabaseClient()

  const { error: cleanupError } = await supabase
    .from('orgs')
    .delete()
    .eq('id', STALE_CREATED_BY_ORG_ID)
  expect(cleanupError).toBeNull()

  const { error: stripeCleanupError } = await supabase
    .from('stripe_info')
    .delete()
    .eq('customer_id', 'pending_' + STALE_CREATED_BY_ORG_ID)
  expect(stripeCleanupError).toBeNull()

  const { error: orgError } = await supabase
    .from('orgs')
    .insert({
      id: STALE_CREATED_BY_ORG_ID,
      created_by: USER_ID,
      name: 'Log as stale created_by org',
      management_email: 'log-as-stale-owner@capgo.app',
    })
  expect(orgError).toBeNull()

  const { data: superAdminRole, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'org_super_admin')
    .eq('scope_type', 'org')
    .single()
  expect(roleError).toBeNull()
  expect(superAdminRole?.id).toBeTruthy()

  const { error: currentAdminError } = await supabase
    .from('role_bindings')
    .insert({
      principal_type: 'user',
      principal_id: USER_ID_2,
      role_id: superAdminRole!.id,
      scope_type: 'org',
      org_id: STALE_CREATED_BY_ORG_ID,
      granted_by: USER_ID_2,
    })
  expect(currentAdminError).toBeNull()

  const { error: staleLegacyError } = await supabase
    .from('org_users')
    .delete()
    .eq('org_id', STALE_CREATED_BY_ORG_ID)
    .eq('user_id', USER_ID)
  expect(staleLegacyError).toBeNull()

  const { error: staleBindingError } = await supabase
    .from('role_bindings')
    .delete()
    .eq('org_id', STALE_CREATED_BY_ORG_ID)
    .eq('principal_id', USER_ID)
  expect(staleBindingError).toBeNull()
}

describe('[POST] /private/log_as', () => {
  beforeAll(async () => {
    adminHeaders = await getAuthHeadersForCredentials(USER_ADMIN_EMAIL, 'adminadmin')
  })

  it('keeps user_id impersonation compatibility', async () => {
    const jwt = await callLogAs({ user_id: USER_ID })

    expect(getJwtSub(jwt)).toBe(USER_ID)
  })

  it('impersonates a user by auth email', async () => {
    const jwt = await callLogAs({ identifier: 'stats@capgo.app' })

    expect(getJwtSub(jwt)).toBe(USER_ID_STATS)
  })

  it('impersonates an organization owner by org id', async () => {
    const jwt = await callLogAs({ org_id: ORG_ID_2 })

    expect(getJwtSub(jwt)).toBe(USER_ID_2)
  })

  it('impersonates a current organization owner when created_by is stale', async () => {
    await seedStaleCreatedByOrg()

    const jwt = await callLogAs({ org_id: STALE_CREATED_BY_ORG_ID })

    expect(getJwtSub(jwt)).toBe(USER_ID_2)
  })

  it('treats an unresolved UUID identifier as an organization id', async () => {
    const jwt = await callLogAs({ identifier: ORG_ID_2 })

    expect(getJwtSub(jwt)).toBe(USER_ID_2)
  })
})
