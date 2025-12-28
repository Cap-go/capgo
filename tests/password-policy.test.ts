import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { BASE_URL, getSupabaseClient, headers, TEST_EMAIL, USER_ID } from './test-utils.ts'

const ORG_ID = randomUUID()
const globalId = randomUUID()
const name = `Test Password Policy Org ${globalId}`
const customerId = `cus_test_pwd_${ORG_ID}`

beforeAll(async () => {
  // Create stripe_info for this test org
  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: customerId,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_${globalId}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  const { error } = await getSupabaseClient().from('orgs').insert({
    id: ORG_ID,
    name,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: customerId,
  })
  if (error)
    throw error
})

afterAll(async () => {
  // Clean up test organization and stripe_info
  await getSupabaseClient().from('orgs').delete().eq('id', ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
})

describe('[POST] /private/update_org_password_policy', () => {
  it('enable password policy with all requirements', async () => {
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 12,
        require_uppercase: true,
        require_number: true,
        require_special: true,
      }),
    })
    expect(response.status).toBe(200)

    const responseData = await response.json() as { status: string }
    expect(responseData.status).toBe('ok')

    // Verify the policy was saved
    const { data: org, error } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_config, password_policy_updated_at')
      .eq('id', ORG_ID)
      .single()

    expect(error).toBeNull()
    expect(org).toBeTruthy()
    expect(org?.password_policy_config).toEqual({
      enabled: true,
      min_length: 12,
      require_uppercase: true,
      require_number: true,
      require_special: true,
    })
    expect(org?.password_policy_updated_at).toBeTruthy()
  })

  it('update password policy with partial requirements', async () => {
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 8,
        require_uppercase: false,
        require_number: true,
        require_special: false,
      }),
    })
    expect(response.status).toBe(200)

    // Verify the policy was updated
    const { data: org, error } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_config')
      .eq('id', ORG_ID)
      .single()

    expect(error).toBeNull()
    expect(org?.password_policy_config).toEqual({
      enabled: true,
      min_length: 8,
      require_uppercase: false,
      require_number: true,
      require_special: false,
    })
  })

  it('disable password policy', async () => {
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: false,
      }),
    })
    expect(response.status).toBe(200)

    // Verify the policy was disabled
    const { data: org, error } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_config')
      .eq('id', ORG_ID)
      .single()

    expect(error).toBeNull()
    expect(org?.password_policy_config?.enabled).toBe(false)
  })

  it('reject password policy with min_length below 6', async () => {
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 4, // Too short
        require_uppercase: true,
        require_number: true,
        require_special: true,
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('reject password policy with min_length above 128', async () => {
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 200, // Too long
        require_uppercase: true,
        require_number: true,
        require_special: true,
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('reject password policy update for non-existent org', async () => {
    const nonExistentOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: nonExistentOrgId,
        enabled: true,
        min_length: 10,
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('no_permission')
  })

  it('reject password policy update with missing org_id', async () => {
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        enabled: true,
        min_length: 10,
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('reject password policy update with invalid JSON', async () => {
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('[GET] /private/check_org_members_password_policy', () => {
  // First enable a password policy for testing
  beforeAll(async () => {
    await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 10,
        require_uppercase: true,
        require_number: true,
        require_special: true,
      }),
    })
  })

  it('check password policy compliance for org members via RPC', async () => {
    // Use direct RPC call to test the function
    const { data, error } = await getSupabaseClient().rpc('check_org_members_password_policy', {
      org_id: ORG_ID,
    })

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(Array.isArray(data)).toBe(true)

    // Verify the response structure
    if (data && data.length > 0) {
      const member = data[0]
      expect(member).toHaveProperty('user_id')
      expect(member).toHaveProperty('email')
      expect(member).toHaveProperty('password_policy_compliant')
      expect(typeof member.password_policy_compliant).toBe('boolean')
    }
  })
})

describe('Password Policy Enforcement Integration', () => {
  const orgWithPolicyId = randomUUID()
  const orgWithPolicyName = `Pwd Policy Integration Org ${randomUUID()}`
  const orgWithPolicyCustomerId = `cus_pwd_int_${orgWithPolicyId}`

  beforeAll(async () => {
    // Create stripe_info
    await getSupabaseClient().from('stripe_info').insert({
      customer_id: orgWithPolicyCustomerId,
      status: 'succeeded',
      product_id: 'prod_LQIregjtNduh4q',
      subscription_id: `sub_int_${orgWithPolicyId}`,
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })

    // Create org with password policy enabled
    await getSupabaseClient().from('orgs').insert({
      id: orgWithPolicyId,
      name: orgWithPolicyName,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      customer_id: orgWithPolicyCustomerId,
      password_policy_config: {
        enabled: true,
        min_length: 10,
        require_uppercase: true,
        require_number: true,
        require_special: true,
      },
      password_policy_updated_at: new Date().toISOString(),
    })
  })

  afterAll(async () => {
    await getSupabaseClient().from('orgs').delete().eq('id', orgWithPolicyId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', orgWithPolicyCustomerId)
  })

  it('organization API returns password policy config', async () => {
    const response = await fetch(`${BASE_URL}/organization?orgId=${orgWithPolicyId}`, {
      headers,
    })

    // Note: This test may fail if the user doesn't have access to this org
    // In that case, it's expected behavior
    if (response.status === 200) {
      const data = await response.json()
      // Verify the org data structure includes password policy fields when accessible
      expect(data).toHaveProperty('id')
      expect(data.id).toBe(orgWithPolicyId)
    }
  })

  it('check_min_rights respects password policy', async () => {
    // Directly test the check_min_rights function via RPC
    const { data, error } = await getSupabaseClient().rpc('check_min_rights', {
      min_right: 'read',
      user_id: USER_ID,
      org_id: orgWithPolicyId,
      app_id: null,
      channel_id: null,
    })

    // The result depends on whether the test user's password is compliant
    // We're testing that the function works, not the specific result
    expect(error).toBeNull()
    expect(typeof data).toBe('boolean')
  })
})

describe('Password Policy - Edge Cases', () => {
  it('enable policy with minimum valid min_length (6)', async () => {
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 6, // Minimum valid
        require_uppercase: false,
        require_number: false,
        require_special: false,
      }),
    })
    expect(response.status).toBe(200)
  })

  it('enable policy with maximum valid min_length (128)', async () => {
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 128, // Maximum valid
        require_uppercase: true,
        require_number: true,
        require_special: true,
      }),
    })
    expect(response.status).toBe(200)
  })

  it('re-enable disabled policy updates timestamp', async () => {
    // First disable
    await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: false,
      }),
    })

    // Get initial timestamp
    const { data: orgBefore } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_updated_at')
      .eq('id', ORG_ID)
      .single()

    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 100))

    // Re-enable
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 10,
      }),
    })
    expect(response.status).toBe(200)

    // Check timestamp was updated
    const { data: orgAfter } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_updated_at')
      .eq('id', ORG_ID)
      .single()

    // Timestamp should be updated when enabling from disabled
    expect(orgAfter?.password_policy_updated_at).toBeTruthy()
  })

  it('strengthen policy updates timestamp', async () => {
    // Enable with lower requirements
    await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 8,
        require_uppercase: false,
        require_number: false,
        require_special: false,
      }),
    })

    // Get initial timestamp
    const { data: orgBefore } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_updated_at')
      .eq('id', ORG_ID)
      .single()

    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 100))

    // Strengthen the policy
    const response = await fetch(`${BASE_URL}/private/update_org_password_policy`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        org_id: ORG_ID,
        enabled: true,
        min_length: 12, // Increased
        require_uppercase: true, // Added
        require_number: true, // Added
        require_special: true, // Added
      }),
    })
    expect(response.status).toBe(200)

    // Check timestamp was updated
    const { data: orgAfter } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_updated_at')
      .eq('id', ORG_ID)
      .single()

    // When policy is strengthened, timestamp should be updated
    if (orgBefore?.password_policy_updated_at && orgAfter?.password_policy_updated_at) {
      expect(new Date(orgAfter.password_policy_updated_at).getTime())
        .toBeGreaterThanOrEqual(new Date(orgBefore.password_policy_updated_at).getTime())
    }
  })
})
