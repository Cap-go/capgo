import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, ORG_ID, resetAndSeedAppData, resetAppData, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.app.expiration.${id}`

// Org for testing expiration policies
const POLICY_ORG_ID = randomUUID()
const POLICY_ORG_CUSTOMER_ID = `cus_test_policy_${id}`
const POLICY_ORG_NAME = `Test Policy Org ${id}`

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)

  // Create a test org with specific expiration policies
  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: POLICY_ORG_CUSTOMER_ID,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_${id}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  const { error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: POLICY_ORG_ID,
    name: POLICY_ORG_NAME,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: POLICY_ORG_CUSTOMER_ID,
    require_apikey_expiration: true,
    max_apikey_expiration_days: 30,
  })
  if (orgError)
    throw orgError
})

afterAll(async () => {
  await resetAppData(APPNAME)
  // Clean up policy org
  await getSupabaseClient().from('orgs').delete().eq('id', POLICY_ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', POLICY_ORG_CUSTOMER_ID)
})

describe('[POST] /apikey with expiration', () => {
  it('create api key with valid expiration date', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-with-expiration',
        expires_at: futureDate,
      }),
    })
    const data = await response.json<{ key: string, id: number, expires_at: string }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('key')
    expect(data).toHaveProperty('id')
    expect(data).toHaveProperty('expires_at')
    expect(new Date(data.expires_at).getTime()).toBeCloseTo(new Date(futureDate).getTime(), -3)
  })

  it('create api key without expiration (null)', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-no-expiration',
      }),
    })
    const data = await response.json<{ key: string, id: number, expires_at: string | null }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('key')
    expect(data.expires_at).toBeNull()
  })

  it('fail to create api key with past expiration date', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-past-expiration',
        expires_at: pastDate,
      }),
    })
    const data = await response.json() as { error: string }
    expect(response.status).toBe(400)
    expect(data.error).toBe('invalid_expiration_date')
  })

  it('fail to create api key with invalid expiration date format', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-invalid-date',
        expires_at: 'not-a-date',
      }),
    })
    const data = await response.json() as { error: string }
    expect(response.status).toBe(400)
    expect(data.error).toBe('invalid_expiration_date')
  })
})

describe('[PUT] /apikey/:id with expiration', () => {
  let testKeyId: number

  beforeAll(async () => {
    // Create a key to update
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-for-update-expiration',
      }),
    })
    const data = await response.json<{ id: number }>()
    testKeyId = data.id
  })

  it('update api key to add expiration date', async () => {
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days from now
    const response = await fetch(`${BASE_URL}/apikey/${testKeyId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        expires_at: futureDate,
      }),
    })
    const data = await response.json<{ id: number, expires_at: string }>()
    expect(response.status).toBe(200)
    expect(data.id).toBe(testKeyId)
    expect(new Date(data.expires_at).getTime()).toBeCloseTo(new Date(futureDate).getTime(), -3)
  })

  it('update api key to change expiration date', async () => {
    const newFutureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
    const response = await fetch(`${BASE_URL}/apikey/${testKeyId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        expires_at: newFutureDate,
      }),
    })
    const data = await response.json<{ id: number, expires_at: string }>()
    expect(response.status).toBe(200)
    expect(new Date(data.expires_at).getTime()).toBeCloseTo(new Date(newFutureDate).getTime(), -3)
  })

  it('update api key to remove expiration (set to null)', async () => {
    const response = await fetch(`${BASE_URL}/apikey/${testKeyId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        expires_at: null,
      }),
    })
    const data = await response.json<{ id: number, expires_at: string | null }>()
    expect(response.status).toBe(200)
    expect(data.expires_at).toBeNull()
  })

  it('fail to update api key with past expiration date', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const response = await fetch(`${BASE_URL}/apikey/${testKeyId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        expires_at: pastDate,
      }),
    })
    const data = await response.json() as { error: string }
    expect(response.status).toBe(400)
    expect(data.error).toBe('invalid_expiration_date')
  })
})

describe('[GET] /apikey with expiration info', () => {
  let keyWithExpiration: { id: number, key: string }
  let keyWithoutExpiration: { id: number, key: string }

  beforeAll(async () => {
    // Create key with expiration
    const response1 = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-with-exp-get-test',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
    keyWithExpiration = await response1.json()

    // Create key without expiration
    const response2 = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-without-exp-get-test',
      }),
    })
    keyWithoutExpiration = await response2.json()
  })

  it('get api key includes expires_at field when set', async () => {
    const response = await fetch(`${BASE_URL}/apikey/${keyWithExpiration.id}`, {
      method: 'GET',
      headers,
    })
    const data = await response.json<{ id: number, expires_at: string | null }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('expires_at')
    expect(data.expires_at).not.toBeNull()
  })

  it('get api key includes expires_at as null when not set', async () => {
    const response = await fetch(`${BASE_URL}/apikey/${keyWithoutExpiration.id}`, {
      method: 'GET',
      headers,
    })
    const data = await response.json<{ id: number, expires_at: string | null }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('expires_at')
    expect(data.expires_at).toBeNull()
  })

  it('list all api keys includes expires_at field', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'GET',
      headers,
    })
    const data = await response.json() as Array<{ id: number, expires_at: string | null }>
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)

    // Find our test keys
    const withExp = data.find(k => k.id === keyWithExpiration.id)
    const withoutExp = data.find(k => k.id === keyWithoutExpiration.id)

    expect(withExp).toBeDefined()
    expect(withExp?.expires_at).not.toBeNull()

    expect(withoutExp).toBeDefined()
    expect(withoutExp?.expires_at).toBeNull()
  })
})

describe('Organization API key expiration policy', () => {
  it('fail to create api key without expiration for org requiring expiration', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-policy-test',
        limited_to_orgs: [POLICY_ORG_ID],
      }),
    })
    const data = await response.json() as { error: string }
    expect(response.status).toBe(400)
    expect(data.error).toBe('expiration_required')
  })

  it('fail to create api key with expiration exceeding org max days', async () => {
    // Org has max 30 days, try to create with 60 days
    const tooFarDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-policy-exceeds-max',
        limited_to_orgs: [POLICY_ORG_ID],
        expires_at: tooFarDate,
      }),
    })
    const data = await response.json() as { error: string }
    expect(response.status).toBe(400)
    expect(data.error).toBe('expiration_exceeds_max')
  })

  it('create api key with valid expiration for org with policy', async () => {
    // Org has max 30 days, create with 15 days
    const validDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-policy-valid',
        limited_to_orgs: [POLICY_ORG_ID],
        expires_at: validDate,
      }),
    })
    const data = await response.json<{ key: string, id: number, expires_at: string }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('key')
    expect(data.expires_at).not.toBeNull()
  })

  it('create api key without expiration for org without policy', async () => {
    // Use the default org which doesn't have expiration policy
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-no-policy-org',
        limited_to_orgs: [ORG_ID],
      }),
    })
    const data = await response.json<{ key: string, id: number, expires_at: string | null }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('key')
    // Should succeed even without expiration since org doesn't require it
  })
})

describe('[PUT] /organization with API key policy', () => {
  const updateOrgId = randomUUID()
  const updateOrgCustomerId = `cus_test_update_${id}`

  beforeAll(async () => {
    // Create a test org for updating
    const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
      customer_id: updateOrgCustomerId,
      status: 'succeeded',
      product_id: 'prod_LQIregjtNduh4q',
      subscription_id: `sub_update_${id}`,
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })
    if (stripeError)
      throw stripeError

    const { error: orgError } = await getSupabaseClient().from('orgs').insert({
      id: updateOrgId,
      name: `Test Update Org ${id}`,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      customer_id: updateOrgCustomerId,
    })
    if (orgError)
      throw orgError
  })

  afterAll(async () => {
    await getSupabaseClient().from('orgs').delete().eq('id', updateOrgId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', updateOrgCustomerId)
  })

  it('update organization to require API key expiration', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: updateOrgId,
        require_apikey_expiration: true,
      }),
    })
    expect(response.status).toBe(200)

    // Verify the update
    const { data, error } = await getSupabaseClient().from('orgs').select('require_apikey_expiration').eq('id', updateOrgId).single()
    expect(error).toBeNull()
    expect(data?.require_apikey_expiration).toBe(true)
  })

  it('update organization to set max API key expiration days', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: updateOrgId,
        max_apikey_expiration_days: 90,
      }),
    })
    expect(response.status).toBe(200)

    // Verify the update
    const { data, error } = await getSupabaseClient().from('orgs').select('max_apikey_expiration_days').eq('id', updateOrgId).single()
    expect(error).toBeNull()
    expect(data?.max_apikey_expiration_days).toBe(90)
  })

  it('update organization to remove max expiration (set to null)', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: updateOrgId,
        max_apikey_expiration_days: null,
      }),
    })
    expect(response.status).toBe(200)

    // Verify the update
    const { data, error } = await getSupabaseClient().from('orgs').select('max_apikey_expiration_days').eq('id', updateOrgId).single()
    expect(error).toBeNull()
    expect(data?.max_apikey_expiration_days).toBeNull()
  })

  it('fail to set invalid max expiration days (negative)', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: updateOrgId,
        max_apikey_expiration_days: -1,
      }),
    })
    expect(response.status).toBe(400)
  })

  it('fail to set invalid max expiration days (too large)', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        orgId: updateOrgId,
        max_apikey_expiration_days: 500,
      }),
    })
    expect(response.status).toBe(400)
  })
})

describe('Expired API key rejection', () => {
  let expiredKeyValue: string
  let validKeyValue: string

  beforeAll(async () => {
    // Create an API key with expiration, then manually set it to expired via DB
    const response1 = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-to-be-expired',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
    const data1 = await response1.json<{ id: number, key: string }>()
    expiredKeyValue = data1.key

    // Manually set the key to expired (1 day ago)
    const { error } = await getSupabaseClient().from('apikeys')
      .update({ expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', data1.id)
    if (error)
      throw error

    // Create a valid key for comparison
    const response2 = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'key-valid-for-test',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
    const data2 = await response2.json<{ key: string }>()
    validKeyValue = data2.key
  })

  it('expired API key should be rejected when used for authentication', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': expiredKeyValue,
      },
    })
    // Should be rejected as unauthorized
    expect(response.status).toBe(401)
  })

  it('valid (non-expired) API key should work for authentication', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': validKeyValue,
      },
    })
    expect(response.status).toBe(200)
  })
})
