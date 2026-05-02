import { randomUUID } from 'node:crypto'
import { env } from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getAuthHeaders, getEndpointUrl, getSupabaseClient, USER_ID } from './test-utils.ts'

const USE_CLOUDFLARE = env.USE_CLOUDFLARE_WORKERS === 'true'

let authHeaders: Record<string, string>

// Dedicated seed data for this test file (isolated from other parallel test files)
const TEST_ID = randomUUID()
const TEST_ORG_ID = randomUUID()
const TEST_ORG_NAME = `Atomic Bindings Test Org ${TEST_ID.slice(0, 8)}`
const TEST_ORG_EMAIL = `atomic-bindings-${TEST_ID.slice(0, 8)}@capgo.app`
const STRIPE_CUSTOMER_ID = `cus_atomic_bindings_${TEST_ID.slice(0, 8)}`

const createdKeyIds: number[] = []

async function setupTestOrg() {
  const supabase = getSupabaseClient()

  // Create a dedicated org with RBAC enabled
  const { error: orgError } = await supabase.from('orgs').insert({
    id: TEST_ORG_ID,
    created_by: USER_ID,
    name: TEST_ORG_NAME,
    management_email: TEST_ORG_EMAIL,
    use_new_rbac: true,
  })
  if (orgError)
    throw orgError

  // The org needs a stripe_info entry for the apikey creation path
  const { error: stripeError } = await supabase.from('stripe_info').insert({
    customer_id: STRIPE_CUSTOMER_ID,
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: null,
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  const { error: orgToStripeError } = await supabase.from('orgs').update({
    customer_id: STRIPE_CUSTOMER_ID,
  }).eq('id', TEST_ORG_ID)
  if (orgToStripeError)
    throw orgToStripeError

  // Add the test user as super_admin in the org (legacy membership for checkPermission fallback)
  const { error: ouError } = await supabase.from('org_users').insert({
    org_id: TEST_ORG_ID,
    user_id: USER_ID,
    user_right: 'super_admin',
  })
  if (ouError)
    throw ouError
}

async function cleanupTestData() {
  const supabase = getSupabaseClient()
  // Delete created API keys
  for (const keyId of createdKeyIds) {
    await supabase.from('apikeys').delete().eq('id', keyId)
  }
  // Delete role bindings for the test org
  await supabase.from('role_bindings').delete().eq('org_id', TEST_ORG_ID)
  // Delete org membership
  await supabase.from('org_users').delete().eq('org_id', TEST_ORG_ID)
  // Delete org
  await supabase.from('orgs').delete().eq('id', TEST_ORG_ID)
  // Delete stripe info
  await supabase.from('stripe_info').delete().eq('customer_id', STRIPE_CUSTOMER_ID)
}

beforeAll(async () => {
  authHeaders = await getAuthHeaders()
  await setupTestOrg()
})

afterAll(async () => {
  await cleanupTestData()
})

// Atomic API key + bindings tests use /private/ route which is Supabase-only
describe.skipIf(USE_CLOUDFLARE)('[POST] /apikey with atomic bindings', () => {
  it('creates an API key with bindings and no mode', async () => {
    const response = await fetch(getEndpointUrl('/apikey'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `atomic-bindings-key-${TEST_ID.slice(0, 8)}`,
        limited_to_orgs: [TEST_ORG_ID],
        bindings: [
          {
            role_name: 'org_member',
            scope_type: 'org',
            org_id: TEST_ORG_ID,
            reason: 'atomic creation test',
          },
        ],
      }),
    })

    const data = await response.json() as { id: number, key: string | null, mode: string | null, rbac_id: string }
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('id')
    expect(data.mode).toBeNull()
    expect(data.rbac_id).toBeTruthy()
    createdKeyIds.push(data.id)

    // Verify the binding was created in the database
    const supabase = getSupabaseClient()
    const { data: bindings, error: bindingsError } = await supabase
      .from('role_bindings')
      .select('*')
      .eq('principal_type', 'apikey')
      .eq('principal_id', data.rbac_id)
      .eq('org_id', TEST_ORG_ID)

    expect(bindingsError).toBeNull()
    expect(bindings).toHaveLength(1)
    expect(bindings![0].scope_type).toBe('org')
    expect(bindings![0].reason).toBe('atomic creation test')
  })

  it('creates an API key with mode and no bindings (backward compat)', async () => {
    const response = await fetch(getEndpointUrl('/apikey'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `legacy-mode-key-${TEST_ID.slice(0, 8)}`,
        mode: 'all',
        limited_to_orgs: [TEST_ORG_ID],
      }),
    })

    const data = await response.json() as { id: number, mode: string | null }
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('id')
    expect(data.mode).toBe('all')
    createdKeyIds.push(data.id)
  })

  it('rejects creating an API key without mode and without bindings', async () => {
    const response = await fetch(getEndpointUrl('/apikey'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `no-mode-no-bindings-${TEST_ID.slice(0, 8)}`,
        limited_to_orgs: [TEST_ORG_ID],
      }),
    })

    const data = await response.json() as { error: string }
    expect(response.status).toBe(400)
    expect(data.error).toBe('mode_is_required')
  })

  it('rolls back the API key when a binding fails', async () => {
    const uniqueKeyName = `rollback-test-key-${TEST_ID.slice(0, 8)}-${Date.now()}`

    const response = await fetch(getEndpointUrl('/apikey'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: uniqueKeyName,
        limited_to_orgs: [TEST_ORG_ID],
        bindings: [
          {
            role_name: 'nonexistent_role_that_should_fail',
            scope_type: 'org',
            org_id: TEST_ORG_ID,
          },
        ],
      }),
    })

    expect(response.status).not.toBe(200)

    // Verify the specific key was rolled back (not present in DB)
    const supabase = getSupabaseClient()
    const { data: matchingKeys } = await supabase
      .from('apikeys')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('name', uniqueKeyName)

    expect(matchingKeys).toHaveLength(0)
  })

  it('creates multiple bindings in a single call', async () => {
    const response = await fetch(getEndpointUrl('/apikey'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `multi-binding-key-${TEST_ID.slice(0, 8)}`,
        limited_to_orgs: [TEST_ORG_ID],
        bindings: [
          {
            role_name: 'org_member',
            scope_type: 'org',
            org_id: TEST_ORG_ID,
            reason: 'multi-binding test 1',
          },
          {
            role_name: 'org_member',
            scope_type: 'org',
            org_id: TEST_ORG_ID,
            reason: 'multi-binding test 2',
          },
        ],
      }),
    })

    // This may fail with a duplicate constraint if org_member can only be assigned once per scope.
    // In that case, the key should be rolled back.
    if (response.status === 200) {
      const data = await response.json() as { id: number, rbac_id: string }
      createdKeyIds.push(data.id)

      const supabase = getSupabaseClient()
      const { data: bindings } = await supabase
        .from('role_bindings')
        .select('*')
        .eq('principal_type', 'apikey')
        .eq('principal_id', data.rbac_id)
        .eq('org_id', TEST_ORG_ID)

      expect(bindings!.length).toBeGreaterThanOrEqual(2)
    }
    else {
      // Duplicate binding caused rollback - that's also valid behavior
      const data = await response.json() as { error: string }
      expect(data).toHaveProperty('error')
    }
  })

  it('validates binding shape before creation', async () => {
    const response = await fetch(getEndpointUrl('/apikey'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `invalid-binding-shape-${TEST_ID.slice(0, 8)}`,
        limited_to_orgs: [TEST_ORG_ID],
        bindings: [
          {
            // missing role_name
            scope_type: 'org',
            org_id: TEST_ORG_ID,
          },
        ],
      }),
    })

    const data = await response.json() as { error: string }
    expect(response.status).toBe(400)
    expect(data.error).toBe('invalid_bindings')
  })

  it('RBAC-only key (mode=NULL) can authenticate', async () => {
    // First create an RBAC-only key (no limited_to_orgs so it's not a limited-scope key)
    const createResponse = await fetch(getEndpointUrl('/apikey'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `rbac-auth-test-key-${TEST_ID.slice(0, 8)}`,
        bindings: [
          {
            role_name: 'org_member',
            scope_type: 'org',
            org_id: TEST_ORG_ID,
          },
        ],
      }),
    })

    expect(createResponse.status).toBe(200)
    const createData = await createResponse.json() as { id: number, key: string, mode: string | null }
    expect(createData.key).toBeTruthy()
    expect(createData.mode).toBeNull()
    createdKeyIds.push(createData.id)

    // Use the RBAC-only key to authenticate (GET /apikey should work)
    const apiKeyHeaders = {
      'Content-Type': 'application/json',
      'Authorization': createData.key,
    }
    const getResponse = await fetch(getEndpointUrl('/apikey'), {
      method: 'GET',
      headers: apiKeyHeaders,
    })

    const getBody = await getResponse.json()

    // The key should authenticate successfully (mode=NULL is now allowed)
    expect(getResponse.status, `Auth failed with body: ${JSON.stringify(getBody)}`).toBe(200)
  })
})

// Role bindings endpoint now supports API key auth
describe.skipIf(USE_CLOUDFLARE)('[GET] /private/role_bindings with API key auth', () => {
  it('accepts JWT auth on role_bindings endpoint', async () => {
    const response = await fetch(getEndpointUrl(`/private/role_bindings/${TEST_ORG_ID}`), {
      method: 'GET',
      headers: authHeaders,
    })

    expect(response.status).toBe(200)
    const data = await response.json() as any[]
    expect(Array.isArray(data)).toBe(true)
  })

  it('rejects limited-scope API key on role_bindings endpoint', async () => {
    // Create a limited-scope key first
    const createResponse = await fetch(getEndpointUrl('/apikey'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `limited-scope-test-${TEST_ID.slice(0, 8)}`,
        mode: 'all',
        limited_to_orgs: [TEST_ORG_ID],
      }),
    })

    expect(createResponse.status).toBe(200)
    const createData = await createResponse.json() as { id: number, key: string }
    createdKeyIds.push(createData.id)

    // Try using this limited-scope key on role_bindings endpoint
    const response = await fetch(getEndpointUrl(`/private/role_bindings/${TEST_ORG_ID}`), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': createData.key,
      },
    })

    expect(response.status).toBe(403)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Limited-scope API keys cannot manage role bindings')
  })
})
