import { randomUUID } from 'node:crypto'
import { env } from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getAuthHeaders,
  getAuthHeadersForCredentials,
  getEndpointUrl,
  getSupabaseClient,
  USER_ID,
  USER_ID_2,
  USER_PASSWORD,
} from './test-utils.ts'

const USE_CLOUDFLARE = env.USE_CLOUDFLARE_WORKERS === 'true'
const fixtureId = randomUUID()
const orgId = randomUUID()

let adminAuthHeaders: Record<string, string>
let memberAuthHeaders: Record<string, string>
let groupId: string

beforeAll(async () => {
  if (USE_CLOUDFLARE)
    return

  adminAuthHeaders = await getAuthHeaders()
  memberAuthHeaders = await getAuthHeadersForCredentials('test2@capgo.app', USER_PASSWORD)

  const supabase = getSupabaseClient()

  const { error: orgError } = await supabase.from('orgs').insert({
    id: orgId,
    created_by: USER_ID,
    name: `Private Groups Access Org ${fixtureId}`,
    management_email: `private-groups-${fixtureId}@capgo.app`,
    use_new_rbac: true,
  })
  if (orgError)
    throw orgError

  const { error: orgUsersError } = await supabase.from('org_users').insert({
    org_id: orgId,
    user_id: USER_ID_2,
    user_right: 'read',
  })
  if (orgUsersError)
    throw orgUsersError

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      org_id: orgId,
      name: `Private Groups Access ${fixtureId}`,
      description: 'Private API authorization regression',
      created_by: USER_ID,
    })
    .select('id')
    .single()
  if (groupError)
    throw groupError

  groupId = group.id

  const { error: groupMemberError } = await supabase.from('group_members').insert({
    group_id: groupId,
    user_id: USER_ID,
    added_by: USER_ID,
  })
  if (groupMemberError)
    throw groupMemberError
})

afterAll(async () => {
  if (USE_CLOUDFLARE)
    return

  await getSupabaseClient().from('orgs').delete().eq('id', orgId)
})

describe.skipIf(USE_CLOUDFLARE)('/private/groups access', () => {
  it('denies org members from reading group members', async () => {
    const response = await fetch(getEndpointUrl(`/private/groups/${groupId}/members`), {
      headers: memberAuthHeaders,
    })

    expect(response.status).toBe(403)
  })

  it('allows org admins to read group members', async () => {
    const response = await fetch(getEndpointUrl(`/private/groups/${groupId}/members`), {
      headers: adminAuthHeaders,
    })

    expect(response.status).toBe(200)
    const data = await response.json() as Array<{ user_id: string }>
    expect(data.some(row => row.user_id === USER_ID)).toBe(true)
  })
})
