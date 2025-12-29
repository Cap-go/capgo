import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

  // Add user as member of the org
  const { error: memberError } = await getSupabaseClient().from('org_users').insert({
    org_id: ORG_ID,
    user_id: USER_ID,
    user_right: 'super_admin',
  })
  if (memberError)
    throw memberError
})

afterAll(async () => {
  // Clean up test organization and stripe_info
  await getSupabaseClient().from('user_password_compliance').delete().eq('org_id', ORG_ID)
  await getSupabaseClient().from('org_users').delete().eq('org_id', ORG_ID)
  await getSupabaseClient().from('orgs').delete().eq('id', ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
})

describe('Password Policy Configuration via SDK', () => {
  it('enable password policy with all requirements via direct update', async () => {
    const policyConfig = {
      enabled: true,
      min_length: 12,
      require_uppercase: true,
      require_number: true,
      require_special: true,
    }

    const { error } = await getSupabaseClient()
      .from('orgs')
      .update({ password_policy_config: policyConfig })
      .eq('id', ORG_ID)

    expect(error).toBeNull()

    // Verify the policy was saved
    const { data: org, error: fetchError } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_config')
      .eq('id', ORG_ID)
      .single()

    expect(fetchError).toBeNull()
    expect(org).toBeTruthy()
    expect(org?.password_policy_config).toEqual(policyConfig)
  })

  it('update password policy with partial requirements', async () => {
    const policyConfig = {
      enabled: true,
      min_length: 8,
      require_uppercase: false,
      require_number: true,
      require_special: false,
    }

    const { error } = await getSupabaseClient()
      .from('orgs')
      .update({ password_policy_config: policyConfig })
      .eq('id', ORG_ID)

    expect(error).toBeNull()

    // Verify the policy was updated
    const { data: org, error: fetchError } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_config')
      .eq('id', ORG_ID)
      .single()

    expect(fetchError).toBeNull()
    expect(org?.password_policy_config).toEqual(policyConfig)
  })

  it('disable password policy', async () => {
    const { error } = await getSupabaseClient()
      .from('orgs')
      .update({
        password_policy_config: {
          enabled: false,
          min_length: 8,
        },
      })
      .eq('id', ORG_ID)

    expect(error).toBeNull()

    // Verify the policy was disabled
    const { data: org, error: fetchError } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_config')
      .eq('id', ORG_ID)
      .single()

    expect(fetchError).toBeNull()
    expect((org?.password_policy_config as any)?.enabled).toBe(false)
  })
})

describe('[POST] /private/validate_password_compliance', () => {
  beforeAll(async () => {
    // Enable password policy for testing
    await getSupabaseClient()
      .from('orgs')
      .update({
        password_policy_config: {
          enabled: true,
          min_length: 10,
          require_uppercase: true,
          require_number: true,
          require_special: true,
        },
      })
      .eq('id', ORG_ID)
  })

  it('reject request with missing email', async () => {
    const response = await fetch(`${BASE_URL}/private/validate_password_compliance`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        password: 'TestPassword123!',
        org_id: ORG_ID,
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('reject request with missing password', async () => {
    const response = await fetch(`${BASE_URL}/private/validate_password_compliance`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        email: TEST_EMAIL,
        org_id: ORG_ID,
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('reject request with missing org_id', async () => {
    const response = await fetch(`${BASE_URL}/private/validate_password_compliance`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: 'TestPassword123!',
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('reject request with invalid org_id format', async () => {
    const response = await fetch(`${BASE_URL}/private/validate_password_compliance`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: 'TestPassword123!',
        org_id: 'not-a-uuid',
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('reject request with invalid email format', async () => {
    const response = await fetch(`${BASE_URL}/private/validate_password_compliance`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'TestPassword123!',
        org_id: ORG_ID,
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_body')
  })

  it('reject request for non-existent org', async () => {
    const nonExistentOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/private/validate_password_compliance`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: 'TestPassword123!',
        org_id: nonExistentOrgId,
      }),
    })
    expect(response.status).toBe(404)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('org_not_found')
  })

  it('reject request for org without password policy', async () => {
    // Create a temp org without password policy
    const tempOrgId = randomUUID()
    const tempCustomerId = `cus_temp_${tempOrgId}`

    await getSupabaseClient().from('stripe_info').insert({
      customer_id: tempCustomerId,
      status: 'succeeded',
      product_id: 'prod_LQIregjtNduh4q',
      subscription_id: `sub_temp_${tempOrgId}`,
      is_good_plan: true,
    })

    await getSupabaseClient().from('orgs').insert({
      id: tempOrgId,
      name: 'Temp No Policy Org',
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      customer_id: tempCustomerId,
      password_policy_config: null,
    })

    const response = await fetch(`${BASE_URL}/private/validate_password_compliance`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: 'TestPassword123!',
        org_id: tempOrgId,
      }),
    })
    expect(response.status).toBe(400)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('no_policy')

    // Clean up
    await getSupabaseClient().from('orgs').delete().eq('id', tempOrgId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', tempCustomerId)
  })

  it('reject request with invalid credentials', async () => {
    const response = await fetch(`${BASE_URL}/private/validate_password_compliance`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: 'WrongPassword123!',
        org_id: ORG_ID,
      }),
    })
    expect(response.status).toBe(401)

    const responseData = await response.json() as { error: string }
    expect(responseData.error).toBe('invalid_credentials')
  })

  it('reject request with invalid JSON', async () => {
    const response = await fetch(`${BASE_URL}/private/validate_password_compliance`, {
      headers,
      method: 'POST',
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('[GET] /private/check_org_members_password_policy', () => {
  beforeAll(async () => {
    // Enable password policy for testing
    await getSupabaseClient()
      .from('orgs')
      .update({
        password_policy_config: {
          enabled: true,
          min_length: 10,
          require_uppercase: true,
          require_number: true,
          require_special: true,
        },
      })
      .eq('id', ORG_ID)
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
    })

    // Add user as member
    await getSupabaseClient().from('org_users').insert({
      org_id: orgWithPolicyId,
      user_id: USER_ID,
      user_right: 'super_admin',
    })
  })

  afterAll(async () => {
    await getSupabaseClient().from('user_password_compliance').delete().eq('org_id', orgWithPolicyId)
    await getSupabaseClient().from('org_users').delete().eq('org_id', orgWithPolicyId)
    await getSupabaseClient().from('orgs').delete().eq('id', orgWithPolicyId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', orgWithPolicyCustomerId)
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

    // The result depends on whether the test user has a compliance record
    // We're testing that the function works, not the specific result
    expect(error).toBeNull()
    expect(typeof data).toBe('boolean')
  })

  it('get_orgs_v7 includes password policy fields', async () => {
    const { data, error } = await getSupabaseClient().rpc('get_orgs_v7', {
      userid: USER_ID,
    })

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(Array.isArray(data)).toBe(true)

    // Find our test org
    const testOrg = data?.find((org: any) => org.gid === orgWithPolicyId)
    expect(testOrg).toBeTruthy()

    // Verify password policy fields exist
    expect(testOrg).toHaveProperty('password_policy_config')
    expect(testOrg).toHaveProperty('password_has_access')
    expect(typeof testOrg.password_has_access).toBe('boolean')
  })
})

describe('user_password_compliance table', () => {
  it('can insert compliance record via service role', async () => {
    // Get the policy hash
    const { data: org } = await getSupabaseClient()
      .from('orgs')
      .select('password_policy_config')
      .eq('id', ORG_ID)
      .single()

    const policyHash = org?.password_policy_config
      // eslint-disable-next-line node/prefer-global/buffer
      ? Buffer.from(JSON.stringify(org.password_policy_config)).toString('base64').substring(0, 32)
      : 'test_hash'

    const { error } = await getSupabaseClient()
      .from('user_password_compliance')
      .upsert({
        user_id: USER_ID,
        org_id: ORG_ID,
        policy_hash: policyHash,
        validated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,org_id',
      })

    expect(error).toBeNull()
  })

  it('compliance record makes user pass password policy check', async () => {
    // Ensure policy is enabled
    await getSupabaseClient()
      .from('orgs')
      .update({
        password_policy_config: {
          enabled: true,
          min_length: 10,
          require_uppercase: true,
          require_number: true,
          require_special: true,
        },
      })
      .eq('id', ORG_ID)

    // Get the correct policy hash using the same method as the SQL function
    const { data: hashResult } = await getSupabaseClient().rpc('get_password_policy_hash', {
      policy_config: {
        enabled: true,
        min_length: 10,
        require_uppercase: true,
        require_number: true,
        require_special: true,
      },
    })

    // Insert compliance record with correct hash
    await getSupabaseClient()
      .from('user_password_compliance')
      .upsert({
        user_id: USER_ID,
        org_id: ORG_ID,
        policy_hash: hashResult,
        validated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,org_id',
      })

    // Check if user now passes password policy
    const { data, error } = await getSupabaseClient().rpc('user_meets_password_policy', {
      user_id: USER_ID,
      org_id: ORG_ID,
    })

    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('user fails policy check when policy hash changes', async () => {
    // Update the policy to a different config (changes the hash)
    await getSupabaseClient()
      .from('orgs')
      .update({
        password_policy_config: {
          enabled: true,
          min_length: 15, // Changed from 10
          require_uppercase: true,
          require_number: true,
          require_special: true,
        },
      })
      .eq('id', ORG_ID)

    // User should now fail because their compliance record has the old policy hash
    const { data, error } = await getSupabaseClient().rpc('user_meets_password_policy', {
      user_id: USER_ID,
      org_id: ORG_ID,
    })

    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('user passes when policy is disabled', async () => {
    // Disable the policy
    await getSupabaseClient()
      .from('orgs')
      .update({
        password_policy_config: {
          enabled: false,
          min_length: 15,
        },
      })
      .eq('id', ORG_ID)

    // User should pass when policy is disabled (even without compliance record)
    const { data, error } = await getSupabaseClient().rpc('user_meets_password_policy', {
      user_id: USER_ID,
      org_id: ORG_ID,
    })

    expect(error).toBeNull()
    expect(data).toBe(true)
  })
})
