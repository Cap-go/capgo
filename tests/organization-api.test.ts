import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { BASE_URL, getSupabaseClient, headers } from './test-utils.ts'

const ORG_ID = '00000000-0000-0000-0000-000000000000'

beforeEach(async () => {
  // await resetAndSeedAppData(APPNAME)
  const { data } = await getSupabaseClient().from('orgs').select().eq('id', ORG_ID).single()
  if (data) {
    await getSupabaseClient().from('orgs').delete().eq('id', ORG_ID)
  }
  const { error } = await getSupabaseClient().from('orgs').insert({
    id: ORG_ID,
    name: 'Test Organization',
    management_email: 'test@test.com',
    created_by: '6aa76066-55ef-4238-ade6-0b32334a4097',
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
    expect(safe.data).toEqual({ id: ORG_ID, name: 'Test Organization' })
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
      role: z.string()
    }))
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.length).toBe(1)
    expect(safe.data?.[0].uid).toBe('6aa76066-55ef-4238-ade6-0b32334a4097')
    expect(safe.data?.[0].email).toBe('test@capgo.app')
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
        email: 'admin@capgo.app',
        invite_type: 'read',
      }),
    })

    const res = await response.json()
    console.log(res)
    
    expect(response.status).toBe(200)
    const type = z.object({
      status: z.string(),
    })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.status).toBe('OK')

    const { data: userData, error: userError } = await getSupabaseClient().from('users').select().eq('email', 'admin@capgo.app').single()
    expect(userError).toBeNull()
    expect(userData).toBeTruthy()
    expect(userData?.email).toBe('admin@capgo.app')

    const { data, error } = await getSupabaseClient().from('org_users').select().eq('org_id', ORG_ID).eq('user_id', userData!.id).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.org_id).toBe(ORG_ID)
    expect(data?.user_right).toBe('invite_read')
  })
})

describe('[DELETE] /organization/members', () => {
  it('delete organization member', async () => {
    const { data: userData, error: userError } = await getSupabaseClient().from('users').select().eq('email', 'admin@capgo.app').single()
    expect(userError).toBeNull()
    expect(userData).toBeTruthy()
    expect(userData?.email).toBe('admin@capgo.app')

    const { error } = await getSupabaseClient().from('org_users').insert({
      org_id: ORG_ID,
      user_id: userData!.id,
      user_right: 'invite_read',
    })
    expect(error).toBeNull()

    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}&email=admin@capgo.app`, {
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
  it('update organization', async () => {
    const name = `Updated Organization ${new Date().toISOString()}`
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'POST',
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

describe('[PUT] /organization', () => {
  it('create organization', async () => {
    const name = `Created Organization ${new Date().toISOString()}`
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'PUT',
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

describe.todo('[DELETE] /organization', () => {
  it.todo('delete organization', async () => {
    const id = randomUUID()
    const { error } = await getSupabaseClient().from('orgs').insert({
      id,
      name: `Test Organization ${new Date().toISOString()}`,
      management_email: 'test@test.com',
      created_by: '6aa76066-55ef-4238-ade6-0b32334a4097',
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

    const { data: dataOrg2, error: errorOrg2 } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrg2).toBeTruthy()
    expect(dataOrg2).toBeNull()
  })
})