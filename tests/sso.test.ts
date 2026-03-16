import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchWithRetry, getAuthHeaders, getAuthHeadersForCredentials, getEndpointUrl, getSupabaseClient, USER_ID } from './test-utils.ts'

const SSO_TEST_ORG_ID = randomUUID()
const SSO_TEST_CUSTOMER_ID = `cus_sso_test_${randomUUID()}`

let authHeaders: Record<string, string>

beforeAll(async () => {
  authHeaders = await getAuthHeaders()

  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: SSO_TEST_CUSTOMER_ID,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_sso_${randomUUID()}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  const { error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: SSO_TEST_ORG_ID,
    name: `SSO Test Org ${SSO_TEST_ORG_ID}`,
    management_email: `sso-test-${SSO_TEST_ORG_ID}@capgo.app`,
    created_by: USER_ID,
    customer_id: SSO_TEST_CUSTOMER_ID,
    sso_enabled: true,
  })
  if (orgError)
    throw orgError

  const { error: orgUserError } = await getSupabaseClient().from('org_users').insert({
    org_id: SSO_TEST_ORG_ID,
    user_id: USER_ID,
    user_right: 'super_admin' as const,
  })
  if (orgUserError)
    throw orgUserError
})

afterAll(async () => {
  await getSupabaseClient().from('org_users').delete().eq('org_id', SSO_TEST_ORG_ID)
  await getSupabaseClient().from('orgs').delete().eq('id', SSO_TEST_ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', SSO_TEST_CUSTOMER_ID)
})

describe('[POST] /private/sso/check-domain', () => {
  it('should return has_sso=false for non-SSO domain', async () => {
    const response = await fetchWithRetry(getEndpointUrl('/private/sso/check-domain'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email: 'user@no-sso-configured-domain.com' }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { has_sso: boolean }
    expect(data.has_sso).toBe(false)
  })

  it('should return 400 for invalid email', async () => {
    const response = await fetchWithRetry(getEndpointUrl('/private/sso/check-domain'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email: 'not-a-valid-email' }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBeDefined()
  })

  it('normalizes domain casing and whitespace for existing providers and lookups', async () => {
    const providerId = randomUUID()
    const providerDomainInput = `  ${randomUUID().slice(0, 8)}.SSO.Test  `
    const expectedDomain = providerDomainInput.trim().toLowerCase()

    await getSupabaseClient().from('sso_providers').insert({
      id: providerId,
      org_id: SSO_TEST_ORG_ID,
      domain: providerDomainInput,
      provider_id: randomUUID(),
      status: 'active',
      enforce_sso: false,
      dns_verification_token: `dns-${randomUUID()}`,
    } as any)

    try {
      const response = await fetchWithRetry(getEndpointUrl('/private/sso/check-domain'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ email: `user@${expectedDomain.toUpperCase()}` }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { has_sso: boolean }
      expect(data.has_sso).toBe(true)

      const { data: rpcData, error: rpcError } = await (getSupabaseClient().rpc as any)('check_domain_sso', { p_domain: `  ${expectedDomain.toUpperCase()}  ` })
      expect(rpcError).toBeNull()
      expect(Array.isArray(rpcData)).toBe(true)
      expect(rpcData?.length).toBeGreaterThan(0)
      expect(rpcData?.[0].has_sso).toBe(true)
      expect(rpcData?.[0].org_id).toBe(SSO_TEST_ORG_ID)

      const { data: normalizedRow, error: normalizedRowError } = await getSupabaseClient()
        .from('sso_providers')
        .select('domain')
        .eq('id', providerId)
        .single()

      expect(normalizedRowError).toBeNull()
      expect(normalizedRow?.domain).toBe(expectedDomain)
    }
    finally {
      await getSupabaseClient().from('sso_providers').delete().eq('id', providerId)
    }
  })
})

describe('[POST] /private/sso/check-enforcement', () => {
  it.concurrent('should return allowed=true when a matching SSO provider exists but enforcement is disabled', async () => {
    const enforcementOrgId = randomUUID()
    const enforcementCustomerId = `cus_sso_enforcement_${randomUUID()}`
    const providerId = randomUUID()
    const externalProviderId = randomUUID()
    const domain = `${randomUUID()}.sso.test`
    const email = `user@${domain}`
    const password = 'testtest'

    const { data: createdUser, error: createUserError } = await getSupabaseClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createUserError || !createdUser.user) {
      throw createUserError ?? new Error('Failed to create dedicated SSO enforcement auth user')
    }

    try {
      const { error: enforcementStripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: enforcementCustomerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
        subscription_id: `sub_sso_enforcement_${randomUUID()}`,
        trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        is_good_plan: true,
      })
      if (enforcementStripeError)
        throw enforcementStripeError

      const { error: enforcementOrgError } = await getSupabaseClient().from('orgs').insert({
        id: enforcementOrgId,
        name: `SSO Enforcement Org ${enforcementOrgId}`,
        management_email: `sso-enforcement-${enforcementOrgId}@capgo.app`,
        created_by: USER_ID,
        customer_id: enforcementCustomerId,
        sso_enabled: true,
      })
      if (enforcementOrgError)
        throw enforcementOrgError

      const { error: providerError } = await (getSupabaseClient().from as any)('sso_providers').insert({
        id: providerId,
        org_id: enforcementOrgId,
        domain,
        provider_id: externalProviderId,
        status: 'active',
        enforce_sso: false,
        dns_verification_token: `dns-${randomUUID()}`,
      })
      if (providerError)
        throw providerError

      const isolatedAuthHeaders = await getAuthHeadersForCredentials(email, password)

      const response = await fetchWithRetry(getEndpointUrl('/private/sso/check-enforcement'), {
        method: 'POST',
        headers: isolatedAuthHeaders,
        body: JSON.stringify({
          email: 'ignored@example.com',
          auth_type: 'password',
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { allowed: boolean }
      expect(data.allowed).toBe(true)
    }
    finally {
      await Promise.allSettled([
        (getSupabaseClient().from as any)('sso_providers').delete().eq('id', providerId),
        getSupabaseClient().from('orgs').delete().eq('id', enforcementOrgId),
        getSupabaseClient().from('stripe_info').delete().eq('customer_id', enforcementCustomerId),
        getSupabaseClient().auth.admin.deleteUser(createdUser.user.id),
      ])
    }
  })

  it('should return allowed=true for password auth when no SSO is configured', async () => {
    const response = await fetchWithRetry(getEndpointUrl('/private/sso/check-enforcement'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email: 'user@no-sso-enforcement-domain.com',
        auth_type: 'password',
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { allowed: boolean }
    expect(data.allowed).toBe(true)
  })
})

describe('[GET] /private/sso/providers/:orgId', () => {
  it('should return empty array for org with no SSO providers', async () => {
    const response = await fetchWithRetry(getEndpointUrl(`/private/sso/providers/${SSO_TEST_ORG_ID}`), {
      method: 'GET',
      headers: authHeaders,
    })

    expect(response.status).toBe(200)
    const data = await response.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })

  it('should return 401 without authentication', async () => {
    const response = await fetchWithRetry(getEndpointUrl(`/private/sso/providers/${SSO_TEST_ORG_ID}`), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header
      },
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })
})
