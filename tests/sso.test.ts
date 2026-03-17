import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchWithRetry, getAuthHeaders, getAuthHeadersForCredentials, getEndpointUrl, getSupabaseClient, POSTGRES_URL, USER_ID } from './test-utils.ts'

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
    const externalProviderId = randomUUID()
    const providerDomainInput = `  ${randomUUID().slice(0, 8)}.SSO.Test  `
    const expectedDomain = providerDomainInput.trim().toLowerCase()

    await getSupabaseClient().from('sso_providers').insert({
      id: providerId,
      org_id: SSO_TEST_ORG_ID,
      domain: providerDomainInput,
      provider_id: externalProviderId,
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
      const data = await response.json() as {
        has_sso: boolean
        enforce_sso?: boolean
        provider_id?: string
        org_id?: string
      }
      expect(data.has_sso).toBe(true)
      expect(data.enforce_sso).toBe(false)
      expect(data.provider_id).toBe(externalProviderId)
      expect(data.org_id).toBe(SSO_TEST_ORG_ID)

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

describe('[GET] /private/sso/sp-metadata', () => {
  it('returns SP metadata derived from the backend runtime URL', async () => {
    const response = await fetchWithRetry(getEndpointUrl('/private/sso/sp-metadata'), {
      method: 'GET',
      headers: authHeaders,
    })

    expect(response.status).toBe(200)

    const data = await response.json() as {
      acs_url: string
      entity_id: string
      sp_metadata_url: string
      nameid_format: string
    }

    const expectedBaseUrl = new URL(getEndpointUrl('/private/sso/sp-metadata')).origin

    expect(data).toEqual({
      acs_url: `${expectedBaseUrl}/auth/v1/sso/saml/acs`,
      entity_id: `${expectedBaseUrl}/auth/v1/sso/saml/metadata`,
      sp_metadata_url: `${expectedBaseUrl}/auth/v1/sso/saml/metadata`,
      nameid_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    })
  })
})

describe('generate_org_on_user_create', () => {
  it('skips personal org creation for SSO-authenticated users on managed domains', async () => {
    const managedOrgId = randomUUID()
    const managedCustomerId = `cus_sso_managed_${randomUUID()}`
    const providerId = randomUUID()
    const domain = `${randomUUID()}.sso.test`
    const email = `managed-user@${domain}`

    const { data: createdUser, error: createUserError } = await getSupabaseClient().auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: {
        provider: `sso:${providerId}`,
      },
      user_metadata: {
        first_name: 'Managed',
        last_name: 'SSO',
      },
    })
    if (createUserError || !createdUser.user) {
      throw createUserError ?? new Error('Failed to create SSO auth user for trigger test')
    }

    try {
      const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: managedCustomerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
        subscription_id: `sub_sso_managed_${randomUUID()}`,
        trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        is_good_plan: true,
      })
      if (stripeError)
        throw stripeError

      const { error: orgError } = await getSupabaseClient().from('orgs').insert({
        id: managedOrgId,
        name: `Managed SSO Org ${managedOrgId}`,
        management_email: `managed-sso-${managedOrgId}@capgo.app`,
        created_by: USER_ID,
        customer_id: managedCustomerId,
        sso_enabled: true,
      })
      if (orgError)
        throw orgError

      const { error: providerError } = await (getSupabaseClient().from as any)('sso_providers').insert({
        id: providerId,
        org_id: managedOrgId,
        domain,
        provider_id: randomUUID(),
        status: 'active',
        enforce_sso: false,
        dns_verification_token: `dns-${randomUUID()}`,
      })
      if (providerError)
        throw providerError

      const { error: publicUserError } = await getSupabaseClient().from('users').insert({
        id: createdUser.user.id,
        email,
        first_name: 'Managed',
        last_name: 'SSO',
        country: null,
        enable_notifications: true,
        opt_for_newsletters: true,
      })
      if (publicUserError)
        throw publicUserError

      const { data: createdOrgs, error: createdOrgsError } = await getSupabaseClient()
        .from('orgs')
        .select('id')
        .eq('created_by', createdUser.user.id)

      expect(createdOrgsError).toBeNull()
      expect(createdOrgs ?? []).toHaveLength(0)
    }
    finally {
      await Promise.allSettled([
        getSupabaseClient().auth.admin.deleteUser(createdUser.user.id),
        (getSupabaseClient().from as any)('sso_providers').delete().eq('id', providerId),
        getSupabaseClient().from('orgs').delete().eq('id', managedOrgId),
        getSupabaseClient().from('stripe_info').delete().eq('customer_id', managedCustomerId),
      ])
    }
  })

  it('still creates a personal org for email-auth users on managed domains', async () => {
    const managedOrgId = randomUUID()
    const managedCustomerId = `cus_email_managed_${randomUUID()}`
    const providerId = randomUUID()
    const domain = `${randomUUID()}.sso.test`
    const email = `email-user@${domain}`

    const { data: createdUser, error: createUserError } = await getSupabaseClient().auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: {
        provider: 'email',
      },
      user_metadata: {
        first_name: 'Email',
        last_name: 'User',
      },
    })
    if (createUserError || !createdUser.user) {
      throw createUserError ?? new Error('Failed to create email auth user for trigger test')
    }

    try {
      const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: managedCustomerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
        subscription_id: `sub_email_managed_${randomUUID()}`,
        trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        is_good_plan: true,
      })
      if (stripeError)
        throw stripeError

      const { error: orgError } = await getSupabaseClient().from('orgs').insert({
        id: managedOrgId,
        name: `Email Managed Org ${managedOrgId}`,
        management_email: `email-managed-${managedOrgId}@capgo.app`,
        created_by: USER_ID,
        customer_id: managedCustomerId,
        sso_enabled: true,
      })
      if (orgError)
        throw orgError

      const { error: providerError } = await (getSupabaseClient().from as any)('sso_providers').insert({
        id: providerId,
        org_id: managedOrgId,
        domain,
        provider_id: randomUUID(),
        status: 'active',
        enforce_sso: false,
        dns_verification_token: `dns-${randomUUID()}`,
      })
      if (providerError)
        throw providerError

      const { error: publicUserError } = await getSupabaseClient().from('users').insert({
        id: createdUser.user.id,
        email,
        first_name: 'Email',
        last_name: 'User',
        country: null,
        enable_notifications: true,
        opt_for_newsletters: true,
      })
      if (publicUserError)
        throw publicUserError

      const { data: createdOrgs, error: createdOrgsError } = await getSupabaseClient()
        .from('orgs')
        .select('id, management_email')
        .eq('created_by', createdUser.user.id)

      expect(createdOrgsError).toBeNull()
      expect(createdOrgs ?? []).toHaveLength(1)
      expect(createdOrgs?.[0]?.management_email).toBe(email)
    }
    finally {
      await Promise.allSettled([
        getSupabaseClient().auth.admin.deleteUser(createdUser.user.id),
        (getSupabaseClient().from as any)('sso_providers').delete().eq('id', providerId),
        getSupabaseClient().from('orgs').delete().eq('id', managedOrgId),
        getSupabaseClient().from('stripe_info').delete().eq('customer_id', managedCustomerId),
      ])
    }
  })
})

describe('[POST] /private/sso/provision-user', () => {
  it('merges an existing password account when a new SSO auth user arrives with the same email', async () => {
    const managedOrgId = randomUUID()
    const managedCustomerId = `cus_sso_merge_${randomUUID()}`
    const providerId = randomUUID()
    const domain = `${randomUUID()}.sso.test`
    const targetEmail = `merge-user@${domain}`
    const tempSsoEmail = `temp-sso-${randomUUID()}@${domain}`
    const password = 'testtest'
    const identityProvider = `sso:${providerId}`
    const identityProviderId = `nameid-${randomUUID()}`
    const unrelatedProviderId = `github-${randomUUID()}`
    const originalAuthEmail = `stored-original-${randomUUID()}@${domain}`
    const pool = new Pool({ connectionString: POSTGRES_URL })

    const { data: originalUser, error: originalUserError } = await getSupabaseClient().auth.admin.createUser({
      email: targetEmail,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: 'Merge',
        last_name: 'Original',
      },
    })
    if (originalUserError || !originalUser.user) {
      throw originalUserError ?? new Error('Failed to create original password auth user')
    }

    const { data: duplicateUser, error: duplicateUserError } = await getSupabaseClient().auth.admin.createUser({
      email: tempSsoEmail,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: 'Merge',
        last_name: 'Duplicate',
      },
    })
    if (duplicateUserError || !duplicateUser.user) {
      await pool.end()
      throw duplicateUserError ?? new Error('Failed to create duplicate auth user for SSO merge test')
    }

    try {
      const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: managedCustomerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
        subscription_id: `sub_sso_merge_${randomUUID()}`,
        trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        is_good_plan: true,
      })
      if (stripeError)
        throw stripeError

      const { error: orgError } = await getSupabaseClient().from('orgs').insert({
        id: managedOrgId,
        name: `SSO Merge Org ${managedOrgId}`,
        management_email: `sso-merge-${managedOrgId}@capgo.app`,
        created_by: USER_ID,
        customer_id: managedCustomerId,
        sso_enabled: true,
      })
      if (orgError)
        throw orgError

      const { error: providerError } = await (getSupabaseClient().from as any)('sso_providers').insert({
        id: providerId,
        org_id: managedOrgId,
        domain,
        provider_id: randomUUID(),
        status: 'active',
        enforce_sso: false,
        dns_verification_token: `dns-${randomUUID()}`,
      })
      if (providerError)
        throw providerError

      const { error: originalPublicUserError } = await getSupabaseClient().from('users').insert({
        id: originalUser.user.id,
        email: targetEmail,
        first_name: 'Merge',
        last_name: 'Original',
        country: null,
        enable_notifications: true,
        opt_for_newsletters: true,
      })
      if (originalPublicUserError)
        throw originalPublicUserError

      const duplicateAuthHeaders = await getAuthHeadersForCredentials(tempSsoEmail, password)

      // Local Supabase Auth enforces unique auth.users emails, unlike the production SSO flow
      // we're trying to exercise here. Keep public.users on the original email, but free the
      // auth.users email slot so we can mimic "new SSO auth user arrives with the legacy email".
      const { error: originalAuthUpdateError } = await getSupabaseClient().auth.admin.updateUserById(originalUser.user.id, {
        email: originalAuthEmail,
        email_confirm: true,
      })
      if (originalAuthUpdateError)
        throw originalAuthUpdateError

      const { error: duplicateAuthUpdateError } = await getSupabaseClient().auth.admin.updateUserById(duplicateUser.user.id, {
        email: targetEmail,
        email_confirm: true,
        app_metadata: {
          provider: identityProvider,
        },
      })
      if (duplicateAuthUpdateError)
        throw duplicateAuthUpdateError

      await pool.query(
        'update auth.identities set provider = $1, provider_id = $2, identity_data = jsonb_build_object($$sub$$, $2::text, $$email$$, $3::text, $$email_verified$$, true) where user_id = $4',
        [identityProvider, identityProviderId, targetEmail, duplicateUser.user.id],
      )
      await pool.query(
        `
          insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at)
          values ($1, $2, jsonb_build_object($$sub$$, $3::text, $$email$$, $4::text, $$email_verified$$, true), 'github', $3, now(), now(), now())
        `,
        [randomUUID(), duplicateUser.user.id, unrelatedProviderId, targetEmail],
      )

      const response = await fetchWithRetry(getEndpointUrl('/private/sso/provision-user'), {
        method: 'POST',
        headers: duplicateAuthHeaders,
        body: JSON.stringify({}),
      })

      const responseBody = await response.json()
      expect(response.status).toBe(200)
      expect(responseBody).toMatchObject({ success: true, merged: true })

      const { data: originalPublicUser, error: originalPublicUserLookupError } = await getSupabaseClient()
        .from('users')
        .select('id, email')
        .eq('id', originalUser.user.id)
        .single()

      expect(originalPublicUserLookupError).toBeNull()
      expect(originalPublicUser?.email).toBe(targetEmail)

      const { data: duplicateAuthLookup } = await getSupabaseClient().auth.admin.getUserById(duplicateUser.user.id)
      expect(duplicateAuthLookup.user).toBeNull()

      const identitiesAfterMerge = await pool.query(
        'select provider, provider_id, user_id, email from auth.identities where user_id = $1 order by provider, provider_id',
        [originalUser.user.id],
      )

      expect(identitiesAfterMerge.rows.some(row =>
        row.provider === identityProvider
        && row.provider_id === identityProviderId
        && row.user_id === originalUser.user.id
        && row.email === targetEmail,
      )).toBe(true)
      expect(identitiesAfterMerge.rows.some(row =>
        row.provider === 'github'
        && row.provider_id === unrelatedProviderId,
      )).toBe(false)
    }
    finally {
      await Promise.allSettled([
        getSupabaseClient().auth.admin.deleteUser(duplicateUser.user.id),
        getSupabaseClient().auth.admin.deleteUser(originalUser.user.id),
        (getSupabaseClient().from as any)('sso_providers').delete().eq('id', providerId),
        getSupabaseClient().from('orgs').delete().eq('id', managedOrgId),
        getSupabaseClient().from('stripe_info').delete().eq('customer_id', managedCustomerId),
      ])
      await pool.end()
    }
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
