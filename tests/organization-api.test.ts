import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { BASE_URL, getSupabaseClient, headers, TEST_EMAIL, USER_ADMIN_EMAIL, USER_EMAIL, USER_ID } from './test-utils.ts'

const ORG_ID = randomUUID()
const id = randomUUID()
const name = `Test Organization ${id}`

// console.log('ORG_ID', ORG_ID)

beforeEach(async () => {
  const { data } = await getSupabaseClient().from('orgs').select().eq('id', ORG_ID).single()
  if (data) {
    await getSupabaseClient().from('orgs').delete().eq('id', ORG_ID)
  }
  // console.log('name', name)
  const { error } = await getSupabaseClient().from('orgs').insert({
    id: ORG_ID,
    name,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
  })
  if (error)
    throw error
})

describe('[GET] /organization', () => {
  it('get organization', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
    })
    expect(response.status).toBe(200)
    const type = z.array(z.object({ id: z.string(), name: z.string() }))
    expect(type.parse(await response.json()).length).toBeGreaterThan(0)
  })

  it('get organization by id', async () => {
    const response = await fetch(`${BASE_URL}/organization?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const type = z.object({ id: z.string(), name: z.string() })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data).toEqual({ id: ORG_ID, name })
  })
})

describe('[GET] /organization/members', () => {
  it('get organization members', async () => {
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const type = z.array(z.object({
      uid: z.string(),
      email: z.string(),
      image_url: z.string(),
      role: z.string(),
    }))
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.length).toBe(1)
    expect(safe.data?.[0].uid).toBe(USER_ID)
    expect(safe.data?.[0].email).toBe(USER_EMAIL)
    expect(safe.data?.[0].role).toBe('super_admin')
  })
})

describe('[POST] /organization/members', () => {
  it('add organization member', async () => {
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        orgId: ORG_ID,
        email: USER_ADMIN_EMAIL,
        invite_type: 'read',
      }),
    })

    const responseData = await response.json()
    expect(response.status).toBe(200)
    const type = z.object({
      status: z.string(),
    })
    const safe = type.safeParse(responseData)
    expect(safe.success).toBe(true)
    expect(safe.data?.status).toBe('OK')

    const { data: userData, error: userError } = await getSupabaseClient().from('users').select().eq('email', USER_ADMIN_EMAIL).single()
    expect(userError).toBeNull()
    expect(userData).toBeTruthy()
    expect(userData?.email).toBe(USER_ADMIN_EMAIL)

    const { data, error } = await getSupabaseClient().from('org_users').select().eq('org_id', ORG_ID).eq('user_id', userData!.id).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.org_id).toBe(ORG_ID)
    expect(data?.user_right).toBe('invite_read')
  })
})

describe('[DELETE] /organization/members', () => {
  it('delete organization member', async () => {
    const { data: userData, error: userError } = await getSupabaseClient().from('users').select().eq('email', USER_ADMIN_EMAIL).single()
    expect(userError).toBeNull()
    expect(userData).toBeTruthy()
    expect(userData?.email).toBe(USER_ADMIN_EMAIL)

    const { error } = await getSupabaseClient().from('org_users').insert({
      org_id: ORG_ID,
      user_id: userData!.id,
      user_right: 'invite_read',
    })
    expect(error).toBeNull()

    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}&email=${USER_ADMIN_EMAIL}`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(200)
    const type = z.object({
      status: z.string(),
    })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.status).toBe('OK')

    const { data, error: orgUserError } = await getSupabaseClient().from('org_users').select().eq('org_id', ORG_ID).eq('user_id', userData!.id).single()
    expect(orgUserError).toBeTruthy()
    expect(data).toBeNull()
  })
})

describe('[POST] /organization', () => {
  it('create organization', async () => {
    const name = `Created Organization ${new Date().toISOString()}`
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    expect(response.status).toBe(200)
    const type = z.object({
      status: z.string(),
      id: z.string().uuid(),
    })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.status).toBe('Organization created')
    expect(safe.data?.id).toBeDefined()

    const { data, error } = await getSupabaseClient().from('orgs').select().eq('id', safe.data!.id).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.name).toBe(name)
  })
})

describe('[PUT] /organization', () => {
  it('update organization', async () => {
    const name = `Updated Organization ${new Date().toISOString()}`
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'PUT',
      body: JSON.stringify({ orgId: ORG_ID, name }),
    })
    expect(response.status).toBe(200)
    const type = z.object({
      status: z.string(),
    })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.status).toBe('Organization updated')

    const { data, error } = await getSupabaseClient().from('orgs').select().eq('id', ORG_ID).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.name).toBe(name)
  })
})

describe('[DELETE] /organization', () => {
  it('delete organization successfully', async () => {
    const id = randomUUID()
    const { error } = await getSupabaseClient().from('orgs').insert({
      id,
      name: `Test Organization ${new Date().toISOString()}`,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
    })
    expect(error).toBeNull()

    const { data: dataOrg, error: errorOrg } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrg).toBeNull()
    expect(dataOrg).toBeTruthy()

    const response = await fetch(`${BASE_URL}/organization?orgId=${id}`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(200)
    const responseData = await response.json() as { status: string }
    expect(responseData.status).toBe('Organization deleted')

    const { data: dataOrg2, error: errorOrg2 } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrg2).toBeTruthy()
    expect(dataOrg2).toBeNull()
  })

  it('fail to delete non-existent organization', async () => {
    const nonExistentId = randomUUID()

    const response = await fetch(`${BASE_URL}/organization?orgId=${nonExistentId}`, {
      headers,
      method: 'DELETE',
    })

    // Should return error as the organization doesn't exist
    expect(response.status).toBeGreaterThanOrEqual(400)
    const responseData = await response.json() as { status: string }
    expect(responseData.status).not.toBe('Organization deleted')
  })

  it('fail to delete organization not owned by user', async () => {
    // First, get an existing user that's not our test user
    const { data: anotherUser, error: userError } = await getSupabaseClient()
      .from('users')
      .select('id')
      .neq('id', USER_ID)
      .limit(1)
      .single()

    expect(userError).toBeNull()
    expect(anotherUser).toBeTruthy()

    // Skip the test if we couldn't find another user
    if (!anotherUser) {
      console.warn('Skipping test: Could not find another user to use as owner')
      return
    }

    // Create organization with a different owner
    const id = randomUUID()
    const differentOwnerId = anotherUser.id

    const { error } = await getSupabaseClient().from('orgs').insert({
      id,
      name: `Organization Not Owned ${new Date().toISOString()}`,
      management_email: `not-owned-${id}@example.com`,
      created_by: differentOwnerId, // Use an existing user ID
    })
    expect(error).toBeNull()

    // Verify organization was created
    const { data: dataOrg, error: errorOrg } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrg).toBeNull()
    expect(dataOrg).toBeTruthy()

    if (dataOrg) {
      expect(dataOrg.created_by).toBe(differentOwnerId)
    }

    // Add test user as a member but not owner
    const { error: memberError } = await getSupabaseClient().from('org_users').insert({
      org_id: id,
      user_id: USER_ID,
      user_right: 'admin', // Even with admin rights, shouldn't be able to delete
    })
    expect(memberError).toBeNull()

    // Try to delete the organization
    const response = await fetch(`${BASE_URL}/organization?orgId=${id}`, {
      headers,
      method: 'DELETE',
    })

    // Should be forbidden since the user isn't the owner
    expect(response.status).toBe(403)
    const responseData = await response.json() as { status: string }
    expect(responseData.status).toBe('Only the organization owner can delete an organization')

    // Verify the organization still exists
    const { data: dataOrgAfter, error: errorOrgAfter } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrgAfter).toBeNull()
    expect(dataOrgAfter).toBeTruthy()

    // Clean up
    await getSupabaseClient().from('org_users').delete().eq('org_id', id).eq('user_id', USER_ID)
    await getSupabaseClient().from('orgs').delete().eq('id', id)
  })
})
