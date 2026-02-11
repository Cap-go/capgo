import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, ORG_ID, TEST_EMAIL, USER_ID } from './test-utils.ts'

// Test organization for admin credits tests
const TEST_ORG_ID = randomUUID()
const TEST_ORG_NAME = `Admin Credits Test Org ${TEST_ORG_ID}`
const TEST_CUSTOMER_ID = `cus_admin_credits_test_${TEST_ORG_ID}`

beforeAll(async () => {
  // Create stripe_info for the test org
  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: TEST_CUSTOMER_ID,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_${TEST_ORG_ID}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  // Create a test organization
  const { error } = await getSupabaseClient().from('orgs').insert({
    id: TEST_ORG_ID,
    name: TEST_ORG_NAME,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: TEST_CUSTOMER_ID,
  })
  if (error)
    throw error
})

afterAll(async () => {
  // Clean up test data
  await getSupabaseClient().from('orgs').delete().eq('id', TEST_ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', TEST_CUSTOMER_ID)
})

describe('[POST] /private/admin_credits/grant - Admin Access Control', () => {
  it('should return 401 when no authorization header is provided', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        org_id: TEST_ORG_ID,
        amount: 100,
        notes: 'Test grant',
      }),
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it('should return 400 not_admin when non-admin user tries to grant credits', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: TEST_ORG_ID,
        amount: 100,
        notes: 'Test grant',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })

  it('should return 400 for invalid JSON body (admin check happens first)', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/grant`, {
      method: 'POST',
      headers,
      body: 'invalid json',
    })
    // The not_admin check happens before body validation for authenticated users
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })

  it('should return 400 when org_id is missing', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: 100,
        notes: 'Test grant',
      }),
    })
    // The not_admin check happens before body validation for authenticated users
    expect(response.status).toBe(400)
  })

  it('should return 400 when amount is missing', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: TEST_ORG_ID,
        notes: 'Test grant',
      }),
    })
    // The not_admin check happens before body validation for authenticated users
    expect(response.status).toBe(400)
  })

  it('should return 400 when amount is less than 1', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/grant`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: TEST_ORG_ID,
        amount: 0,
        notes: 'Test grant',
      }),
    })
    // The not_admin check happens before body validation
    expect(response.status).toBe(400)
  })
})

describe('[GET] /private/admin_credits/search-orgs - Admin Access Control', () => {
  it('should return 401 when no authorization header is provided', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/search-orgs?q=test`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it('should return 400 not_admin when non-admin user tries to search orgs', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/search-orgs?q=test`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })

  it('should return 400 not_admin even when search term is empty', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/search-orgs?q=`, {
      method: 'GET',
      headers,
    })
    // The not_admin check happens before validating the search term
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })

  it('should return 400 not_admin even when searching by UUID', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/search-orgs?q=${ORG_ID}`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })

  it('should reject SQL injection attempts with not_admin', async () => {
    // Test various SQL injection patterns - all should be blocked by admin check first
    const injectionPatterns = [
      'test%\'; DROP TABLE orgs; --',
      'test\' OR \'1\'=\'1',
      'test%,test2',
      '%()',
    ]

    for (const pattern of injectionPatterns) {
      const response = await fetch(`${BASE_URL}/private/admin_credits/search-orgs?q=${encodeURIComponent(pattern)}`, {
        method: 'GET',
        headers,
      })
      expect(response.status).toBe(400)
      const data = await response.json() as { error: string }
      expect(data.error).toBe('not_admin')
    }
  })
})

describe('[GET] /private/admin_credits/org-balance/:orgId - Admin Access Control', () => {
  it('should return 401 when no authorization header is provided', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/org-balance/${TEST_ORG_ID}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it('should return 400 not_admin when non-admin user tries to view org balance', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/org-balance/${TEST_ORG_ID}`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })

  it('should return 400 not_admin even for non-existent org', async () => {
    const nonExistentOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/private/admin_credits/org-balance/${nonExistentOrgId}`, {
      method: 'GET',
      headers,
    })
    // The not_admin check happens before org validation
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })

  it('should return 400 not_admin even with invalid UUID format', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/org-balance/invalid-uuid`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })
})

describe('[GET] /private/admin_credits/org-stats/:orgId - Admin Access Control', () => {
  it('should return 401 when no authorization header is provided', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/org-stats/${TEST_ORG_ID}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it('should return 400 not_admin when non-admin user tries to view org stats', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/org-stats/${TEST_ORG_ID}`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })
})

describe('[GET] /private/admin_credits/grants-history - Admin Access Control', () => {
  it('should return 401 when no authorization header is provided', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/grants-history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it('should return 400 not_admin when non-admin user tries to view grant history', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/grants-history`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('not_admin')
  })
})

describe('[OPTIONS] /private/admin_credits/* - CORS preflight', () => {
  it('should return CORS headers for grant preflight request', async () => {
    const response = await fetch(`${BASE_URL}/private/admin_credits/grant`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })

    expect([200, 204]).toContain(response.status)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toContain('OPTIONS')
    const allowHeaders = response.headers.get('access-control-allow-headers') || ''
    expect(allowHeaders.toLowerCase()).toContain('authorization')
  })
})

describe('admin credits - consistent error responses', () => {
  it('all endpoints should return consistent not_admin error for unauthorized users', async () => {
    const endpoints = [
      { method: 'POST', path: '/private/admin_credits/grant', body: JSON.stringify({ org_id: TEST_ORG_ID, amount: 100 }) },
      { method: 'GET', path: '/private/admin_credits/search-orgs?q=test', body: null },
      { method: 'GET', path: `/private/admin_credits/org-balance/${TEST_ORG_ID}`, body: null },
      { method: 'GET', path: `/private/admin_credits/org-stats/${TEST_ORG_ID}`, body: null },
      { method: 'GET', path: '/private/admin_credits/grants-history', body: null },
    ]

    for (const endpoint of endpoints) {
      const response = await fetch(`${BASE_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers,
        body: endpoint.body,
      })

      expect(response.status).toBe(400)
      const data = await response.json() as { error: string }
      expect(data.error).toBe('not_admin')
    }
  })

  it('all endpoints should return consistent unauthorized error when auth header is missing', async () => {
    const endpoints = [
      { method: 'POST', path: '/private/admin_credits/grant', body: JSON.stringify({ org_id: TEST_ORG_ID, amount: 100 }) },
      { method: 'GET', path: '/private/admin_credits/search-orgs?q=test', body: null },
      { method: 'GET', path: `/private/admin_credits/org-balance/${TEST_ORG_ID}`, body: null },
      { method: 'GET', path: `/private/admin_credits/org-stats/${TEST_ORG_ID}`, body: null },
      { method: 'GET', path: '/private/admin_credits/grants-history', body: null },
    ]

    for (const endpoint of endpoints) {
      const response = await fetch(`${BASE_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: endpoint.body,
      })

      expect(response.status).toBe(401)
      const data = await response.json() as { error: string }
      expect(data.error).toBe('no_jwt_apikey_or_subkey')
    }
  })
})
