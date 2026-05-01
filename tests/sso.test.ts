import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchWithRetry, getAuthHeaders, getAuthHeadersForCredentials, getEndpointUrl, getSupabaseClient, POSTGRES_URL, USER_ID } from './test-utils.ts'

const SSO_TEST_ORG_ID = randomUUID()
const SSO_TEST_CUSTOMER_ID = `cus_sso_test_${randomUUID()}`
const ENTERPRISE_PRODUCT_ID = 'prod_MH5Jh6ajC9e7ZH'

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

describe('[POST] /private/sso/prelink-users', () => {
  it.concurrent('only unlinks password identities for members of the provider org', async () => {
    const prelinkOrgId = randomUUID()
    const prelinkCustomerId = `cus_sso_prelink_${randomUUID()}`
    const foreignOrgId = randomUUID()
    const foreignCustomerId = `cus_sso_prelink_foreign_${randomUUID()}`
    const providerId = randomUUID()
    const domain = `${randomUUID()}.sso.test`
    const memberEmail = `member-${randomUUID()}@${domain}`
    const outsiderEmail = `outsider-${randomUUID()}@${domain}`
    const pool = new Pool({ connectionString: POSTGRES_URL })

    let memberUserId: string | null = null
    let outsiderUserId: string | null = null

    try {
      const { error: prelinkStripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: prelinkCustomerId,
        status: 'succeeded',
        product_id: ENTERPRISE_PRODUCT_ID,
        subscription_id: `sub_sso_prelink_${randomUUID()}`,
        trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        is_good_plan: true,
      })
      if (prelinkStripeError)
        throw prelinkStripeError

      const { error: prelinkOrgError } = await getSupabaseClient().from('orgs').insert({
        id: prelinkOrgId,
        name: `SSO Prelink Org ${prelinkOrgId}`,
        management_email: `sso-prelink-${prelinkOrgId}@capgo.app`,
        created_by: USER_ID,
        customer_id: prelinkCustomerId,
          })
      if (prelinkOrgError)
        throw prelinkOrgError

      const { error: prelinkAdminError } = await getSupabaseClient().from('org_users').insert({
        org_id: prelinkOrgId,
        user_id: USER_ID,
        user_right: 'super_admin' as const,
      })
      if (prelinkAdminError)
        throw prelinkAdminError

      const { error: foreignStripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: foreignCustomerId,
        status: 'succeeded',
        product_id: ENTERPRISE_PRODUCT_ID,
        subscription_id: `sub_sso_prelink_foreign_${randomUUID()}`,
        trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        is_good_plan: true,
      })
      if (foreignStripeError)
        throw foreignStripeError

      const { error: foreignOrgError } = await getSupabaseClient().from('orgs').insert({
        id: foreignOrgId,
        name: `SSO Foreign Org ${foreignOrgId}`,
        management_email: `sso-foreign-${foreignOrgId}@capgo.app`,
        created_by: USER_ID,
        customer_id: foreignCustomerId,
          })
      if (foreignOrgError)
        throw foreignOrgError

      const { error: providerError } = await (getSupabaseClient().from as any)('sso_providers').insert({
        id: providerId,
        org_id: prelinkOrgId,
        domain,
        provider_id: randomUUID(),
        status: 'active',
        enforce_sso: false,
        dns_verification_token: `dns-${randomUUID()}`,
      })
      if (providerError)
        throw providerError

      const { data: memberUserData, error: memberUserError } = await getSupabaseClient().auth.admin.createUser({
        email: memberEmail,
        password: 'testtest',
        email_confirm: true,
      })
      if (memberUserError || !memberUserData.user) {
        throw memberUserError ?? new Error('Failed to create prelink org member user')
      }
      memberUserId = memberUserData.user.id

      const { data: outsiderUserData, error: outsiderUserError } = await getSupabaseClient().auth.admin.createUser({
        email: outsiderEmail,
        password: 'testtest',
        email_confirm: true,
      })
      if (outsiderUserError || !outsiderUserData.user) {
        throw outsiderUserError ?? new Error('Failed to create foreign org user for prelink test')
      }
      outsiderUserId = outsiderUserData.user.id

      const { error: publicUsersError } = await getSupabaseClient().from('users').insert([
        {
          id: memberUserId,
          email: memberEmail,
          first_name: 'Prelink',
          last_name: 'Member',
          country: null,
          enable_notifications: true,
          opt_for_newsletters: true,
        },
        {
          id: outsiderUserId,
          email: outsiderEmail,
          first_name: 'Prelink',
          last_name: 'Outsider',
          country: null,
          enable_notifications: true,
          opt_for_newsletters: true,
        },
      ])
      if (publicUsersError)
        throw publicUsersError

      const { error: orgUsersError } = await getSupabaseClient().from('org_users').insert([
        {
          org_id: prelinkOrgId,
          user_id: memberUserId,
          user_right: 'read' as const,
        },
        {
          org_id: foreignOrgId,
          user_id: outsiderUserId,
          user_right: 'read' as const,
        },
      ])
      if (orgUsersError)
        throw orgUsersError

      const beforeMemberIdentities = await pool.query<{ provider: string }>(
        'select provider from auth.identities where user_id = $1 order by provider',
        [memberUserId],
      )
      const beforeOutsiderIdentities = await pool.query<{ provider: string }>(
        'select provider from auth.identities where user_id = $1 order by provider',
        [outsiderUserId],
      )

      expect(beforeMemberIdentities.rows.some(row => row.provider === 'email')).toBe(true)
      expect(beforeOutsiderIdentities.rows.some(row => row.provider === 'email')).toBe(true)

      const response = await fetchWithRetry(getEndpointUrl('/private/sso/prelink-users'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ provider_id: providerId }),
      })

      expect(response.status).toBe(200)
      const responseBody = await response.json() as {
        processed: number
        linked: number
        error_count: number
      }
      expect(responseBody).toEqual({
        processed: 1,
        linked: 1,
        error_count: 0,
      })

      const memberIdentities = await pool.query<{ provider: string }>(
        'select provider from auth.identities where user_id = $1 order by provider',
        [memberUserId],
      )
      const outsiderIdentities = await pool.query<{ provider: string }>(
        'select provider from auth.identities where user_id = $1 order by provider',
        [outsiderUserId],
      )

      expect(memberIdentities.rows.some(row => row.provider === 'email')).toBe(false)
      expect(outsiderIdentities.rows.some(row => row.provider === 'email')).toBe(true)
    }
    finally {
      await pool.end()

      await Promise.allSettled([
        (getSupabaseClient().from as any)('sso_providers').delete().eq('id', providerId),
        getSupabaseClient().from('org_users').delete().eq('org_id', prelinkOrgId),
        getSupabaseClient().from('org_users').delete().eq('org_id', foreignOrgId),
        memberUserId ? getSupabaseClient().from('users').delete().eq('id', memberUserId) : Promise.resolve(null),
        outsiderUserId ? getSupabaseClient().from('users').delete().eq('id', outsiderUserId) : Promise.resolve(null),
      ])

      await Promise.allSettled([
        getSupabaseClient().from('orgs').delete().eq('id', prelinkOrgId),
        getSupabaseClient().from('orgs').delete().eq('id', foreignOrgId),
        getSupabaseClient().from('stripe_info').delete().eq('customer_id', prelinkCustomerId),
        getSupabaseClient().from('stripe_info').delete().eq('customer_id', foreignCustomerId),
        memberUserId ? getSupabaseClient().auth.admin.deleteUser(memberUserId) : Promise.resolve(null),
        outsiderUserId ? getSupabaseClient().auth.admin.deleteUser(outsiderUserId) : Promise.resolve(null),
      ])
    }
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

  it('does not create a personal org for email-auth users on managed domains', async () => {
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
})

describe('[POST] /private/sso/provision-user', () => {
  it('rejects non-SAML providers even when they are non-email identities', async () => {
    const email = `oauth-user-${randomUUID()}@capgo.app`
    const password = 'testtest'
    const oauthProviderId = `google-${randomUUID()}`
    const pool = new Pool({ connectionString: POSTGRES_URL })

    const { data: createdUser, error: createUserError } = await getSupabaseClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: 'OAuth',
        last_name: 'User',
      },
    })
    if (createUserError || !createdUser.user) {
      await pool.end()
      throw createUserError ?? new Error('Failed to create OAuth-like auth user for SSO provider validation test')
    }

    try {
      const oauthAuthHeaders = await getAuthHeadersForCredentials(email, password)

      const { error: appMetadataError } = await getSupabaseClient().auth.admin.updateUserById(createdUser.user.id, {
        app_metadata: {
          provider: 'google',
        },
      })
      if (appMetadataError)
        throw appMetadataError

      await pool.query(
        `
          update auth.identities
          set provider = 'google',
              provider_id = $1,
              identity_data = jsonb_build_object($$sub$$, $1::text, $$email$$, $2::text, $$email_verified$$, true)
          where user_id = $3
        `,
        [oauthProviderId, email, createdUser.user.id],
      )

      const response = await fetchWithRetry(getEndpointUrl('/private/sso/provision-user'), {
        method: 'POST',
        headers: oauthAuthHeaders,
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(403)
      const responseBody = await response.json() as { error: string }
      expect(responseBody.error).toBe('sso_auth_required')
    }
    finally {
      await Promise.allSettled([
        getSupabaseClient().auth.admin.deleteUser(createdUser.user.id),
        pool.end(),
      ])
    }
  })

  it('creates missing public.users profile before assigning org membership', async () => {
    const managedOrgId = randomUUID()
    const managedCustomerId = `cus_sso_missing_profile_${randomUUID()}`
    const providerId = randomUUID()
    const domain = `${randomUUID()}.sso.test`
    const email = `missing-profile-${randomUUID()}@${domain}`
    const password = 'testtest'
    const identityProvider = `sso:${providerId}`
    const identityProviderId = `nameid-${randomUUID()}`
    const pool = new Pool({ connectionString: POSTGRES_URL })

    const { data: createdUser, error: createUserError } = await getSupabaseClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: 'Missing',
        last_name: 'Profile',
      },
    })
    if (createUserError || !createdUser.user) {
      await pool.end()
      throw createUserError ?? new Error('Failed to create SSO auth user for missing profile provisioning test')
    }

    try {
      const ssoAuthHeaders = await getAuthHeadersForCredentials(email, password)

      const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: managedCustomerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
        subscription_id: `sub_sso_missing_profile_${randomUUID()}`,
        trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        is_good_plan: true,
      })
      if (stripeError)
        throw stripeError

      const { error: orgError } = await getSupabaseClient().from('orgs').insert({
        id: managedOrgId,
        name: `SSO Missing Profile Org ${managedOrgId}`,
        management_email: `sso-missing-profile-${managedOrgId}@capgo.app`,
        created_by: USER_ID,
        customer_id: managedCustomerId,
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

      const { error: providerMetadataError } = await getSupabaseClient().auth.admin.updateUserById(createdUser.user.id, {
        app_metadata: {
          provider: identityProvider,
        },
      })
      if (providerMetadataError)
        throw providerMetadataError

      await pool.query(
        'update auth.identities set provider = $1, provider_id = $2, identity_data = jsonb_build_object($$sub$$, $2::text, $$email$$, $3::text, $$email_verified$$, true) where user_id = $4',
        [identityProvider, identityProviderId, email, createdUser.user.id],
      )

      // Ensure the test really covers the missing-profile path.
      await getSupabaseClient().from('users').delete().eq('id', createdUser.user.id)

      const response = await fetchWithRetry(getEndpointUrl('/private/sso/provision-user'), {
        method: 'POST',
        headers: ssoAuthHeaders,
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(200)
      const responseBody = await response.json() as {
        success: boolean
        already_member?: boolean
      }
      expect(responseBody).toMatchObject({ success: true })

      const { data: publicUser, error: publicUserError } = await getSupabaseClient()
        .from('users')
        .select('id, email')
        .eq('id', createdUser.user.id)
        .maybeSingle()

      expect(publicUserError).toBeNull()
      expect(publicUser?.id).toBe(createdUser.user.id)
      expect(publicUser?.email).toBe(email)

      const { data: membership, error: membershipError } = await getSupabaseClient()
        .from('org_users')
        .select('id, org_id, user_id')
        .eq('org_id', managedOrgId)
        .eq('user_id', createdUser.user.id)
        .maybeSingle()

      expect(membershipError).toBeNull()
      expect(membership?.org_id).toBe(managedOrgId)
      expect(membership?.user_id).toBe(createdUser.user.id)
    }
    finally {
      await Promise.allSettled([
        getSupabaseClient().auth.admin.deleteUser(createdUser.user.id),
        (getSupabaseClient().from as any)('sso_providers').delete().eq('id', providerId),
        getSupabaseClient().from('orgs').delete().eq('id', managedOrgId),
        getSupabaseClient().from('stripe_info').delete().eq('customer_id', managedCustomerId),
        pool.end(),
      ])
    }
  })

  it('promotes invite-only org memberships during SSO provisioning instead of treating them as completed membership', async () => {
    const managedOrgId = randomUUID()
    const managedCustomerId = `cus_sso_invite_promotion_${randomUUID()}`
    const providerId = randomUUID()
    const domain = `${randomUUID()}.sso.test`
    const email = `invite-only-user@${domain}`
    const password = 'testtest'
    const identityProvider = `sso:${providerId}`
    const identityProviderId = `nameid-${randomUUID()}`
    const pool = new Pool({ connectionString: POSTGRES_URL })

    const { data: createdUser, error: createUserError } = await getSupabaseClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        provider: identityProvider,
      },
      user_metadata: {
        first_name: 'Invite',
        last_name: 'Promotion',
      },
    })
    if (createUserError || !createdUser.user) {
      await pool.end()
      throw createUserError ?? new Error('Failed to create SSO auth user for invite promotion test')
    }

    try {
      const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: managedCustomerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
        subscription_id: `sub_sso_invite_promotion_${randomUUID()}`,
        trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        is_good_plan: true,
      })
      if (stripeError)
        throw stripeError

      const { error: orgError } = await getSupabaseClient().from('orgs').insert({
        id: managedOrgId,
        name: `SSO Invite Promotion Org ${managedOrgId}`,
        management_email: `sso-invite-promotion-${managedOrgId}@capgo.app`,
        created_by: USER_ID,
        customer_id: managedCustomerId,
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
        first_name: 'Invite',
        last_name: 'Promotion',
        country: null,
        enable_notifications: true,
        opt_for_newsletters: true,
      })
      if (publicUserError)
        throw publicUserError

      const { error: inviteMembershipError } = await getSupabaseClient().from('org_users').insert({
        org_id: managedOrgId,
        user_id: createdUser.user.id,
        user_right: 'invite_read' as const,
      })
      if (inviteMembershipError)
        throw inviteMembershipError

      await pool.query(
        'update auth.identities set provider = $1, provider_id = $2, identity_data = jsonb_build_object($$sub$$, $2::text, $$email$$, $3::text, $$email_verified$$, true) where user_id = $4',
        [identityProvider, identityProviderId, email, createdUser.user.id],
      )

      const ssoAuthHeaders = await getAuthHeadersForCredentials(email, password)
      const response = await fetchWithRetry(getEndpointUrl('/private/sso/provision-user'), {
        method: 'POST',
        headers: ssoAuthHeaders,
        body: JSON.stringify({}),
      })

      const responseBody = await response.json() as {
        success: boolean
        already_member?: boolean
      }
      expect(response.status).toBe(200)
      expect(responseBody).toMatchObject({ success: true })
      expect(responseBody.already_member).toBeUndefined()

      const { data: membership, error: membershipError } = await getSupabaseClient()
        .from('org_users')
        .select('user_right')
        .eq('org_id', managedOrgId)
        .eq('user_id', createdUser.user.id)
        .single()

      expect(membershipError).toBeNull()
      expect(membership?.user_right).toBe('read')
    }
    finally {
      await Promise.allSettled([
        getSupabaseClient().auth.admin.deleteUser(createdUser.user.id),
        (getSupabaseClient().from as any)('sso_providers').delete().eq('id', providerId),
        getSupabaseClient().from('orgs').delete().eq('id', managedOrgId),
        getSupabaseClient().from('stripe_info').delete().eq('customer_id', managedCustomerId),
      ])
      await pool.end()
    }
  })

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

      const responseBody = await response.json() as {
        success: boolean
        merged?: boolean
      }
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

      const { data: mergedMembership, error: mergedMembershipError } = await getSupabaseClient()
        .from('org_users')
        .select('org_id, user_id, user_right')
        .eq('org_id', managedOrgId)
        .eq('user_id', originalUser.user.id)
        .maybeSingle()

      expect(mergedMembershipError).toBeNull()
      expect(mergedMembership).toMatchObject({
        org_id: managedOrgId,
        user_id: originalUser.user.id,
        user_right: 'read',
      })

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

  it('creates the public.users row before linking a first-time SSO user to the org', async () => {
    const managedOrgId = randomUUID()
    const managedCustomerId = `cus_sso_first_login_${randomUUID()}`
    const providerId = randomUUID()
    const domain = `${randomUUID()}.sso.test`
    const email = `first-login-user@${domain}`
    const password = 'testtest'
    const identityProvider = `sso:${providerId}`
    const identityProviderId = `nameid-${randomUUID()}`
    const pool = new Pool({ connectionString: POSTGRES_URL })

    const { data: createdUser, error: createUserError } = await getSupabaseClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        provider: identityProvider,
      },
      user_metadata: {
        first_name: 'First',
        last_name: 'Login',
      },
    })
    if (createUserError || !createdUser.user) {
      await pool.end()
      throw createUserError ?? new Error('Failed to create first-login SSO auth user')
    }

    try {
      const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: managedCustomerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
        subscription_id: `sub_sso_first_login_${randomUUID()}`,
        trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        is_good_plan: true,
      })
      if (stripeError)
        throw stripeError

      const { error: orgError } = await getSupabaseClient().from('orgs').insert({
        id: managedOrgId,
        name: `SSO First Login Org ${managedOrgId}`,
        management_email: `sso-first-login-${managedOrgId}@capgo.app`,
        created_by: USER_ID,
        customer_id: managedCustomerId,
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

      await pool.query(
        'update auth.identities set provider = $1, provider_id = $2, identity_data = jsonb_build_object($$sub$$, $2::text, $$email$$, $3::text, $$email_verified$$, true) where user_id = $4',
        [identityProvider, identityProviderId, email, createdUser.user.id],
      )

      const ssoAuthHeaders = await getAuthHeadersForCredentials(email, password)
      const supabase = getSupabaseClient()
      const { data: existingPublicUser, error: existingPublicUserError } = await supabase
        .from('users')
        .select('id')
        .eq('id', createdUser.user.id)
        .maybeSingle()

      expect(existingPublicUserError).toBeNull()

      if (existingPublicUser) {
        const { error: deletePublicUserError } = await supabase
          .from('users')
          .delete()
          .eq('id', createdUser.user.id)

        expect(deletePublicUserError).toBeNull()
      }

      const { data: missingPublicUser, error: missingPublicUserError } = await supabase
        .from('users')
        .select('id')
        .eq('id', createdUser.user.id)
        .maybeSingle()

      expect(missingPublicUserError).toBeNull()
      expect(missingPublicUser).toBeNull()

      const response = await fetchWithRetry(getEndpointUrl('/private/sso/provision-user'), {
        method: 'POST',
        headers: ssoAuthHeaders,
        body: JSON.stringify({}),
      })

      const responseBody = await response.json() as {
        success: boolean
      }
      expect(response.status).toBe(200)
      expect(responseBody).toMatchObject({ success: true })

      const { data: publicUser, error: publicUserError } = await getSupabaseClient()
        .from('users')
        .select('id, email, first_name, last_name')
        .eq('id', createdUser.user.id)
        .single()

      expect(publicUserError).toBeNull()
      expect(publicUser).toMatchObject({
        id: createdUser.user.id,
        email,
        first_name: 'First',
        last_name: 'Login',
      })

      const { data: membership, error: membershipError } = await getSupabaseClient()
        .from('org_users')
        .select('id, org_id, user_id, user_right')
        .eq('org_id', managedOrgId)
        .eq('user_id', createdUser.user.id)
        .maybeSingle()

      expect(membershipError).toBeNull()
      expect(membership).toMatchObject({
        org_id: managedOrgId,
        user_id: createdUser.user.id,
        user_right: 'read',
      })
    }
    finally {
      await Promise.allSettled([
        getSupabaseClient().auth.admin.deleteUser(createdUser.user.id),
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

describe('[PATCH] /private/sso/providers/:id', () => {
  it('syncs auth.users.is_sso_user when enforce_sso is toggled', async () => {
    const providerId = randomUUID()
    const domain = `${randomUUID()}.sso.test`
    const email = `toggle-user-${randomUUID()}@${domain}`
    const password = 'testtest'
    const pool = new Pool({ connectionString: POSTGRES_URL })

    const { data: createdUser, error: createUserError } = await getSupabaseClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createUserError || !createdUser.user) {
      await pool.end()
      throw createUserError ?? new Error('Failed to create auth user for provider enforcement sync test')
    }

    try {
      const { error: providerError } = await (getSupabaseClient().from as any)('sso_providers').insert({
        id: providerId,
        org_id: SSO_TEST_ORG_ID,
        domain,
        provider_id: randomUUID(),
        status: 'active',
        enforce_sso: false,
        dns_verification_token: `dns-${randomUUID()}`,
      })
      if (providerError)
        throw providerError

      const initialUser = await pool.query<{ is_sso_user: boolean }>(
        'select is_sso_user from auth.users where id = $1',
        [createdUser.user.id],
      )
      expect(initialUser.rows[0]?.is_sso_user).toBe(false)

      const enableResponse = await fetchWithRetry(getEndpointUrl(`/private/sso/providers/${providerId}`), {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ enforce_sso: true }),
      })

      expect(enableResponse.status).toBe(200)
      const enabledProvider = await enableResponse.json() as { enforce_sso: boolean }
      expect(enabledProvider.enforce_sso).toBe(true)

      const enabledUser = await pool.query<{ is_sso_user: boolean }>(
        'select is_sso_user from auth.users where id = $1',
        [createdUser.user.id],
      )
      expect(enabledUser.rows[0]?.is_sso_user).toBe(true)

      const disableResponse = await fetchWithRetry(getEndpointUrl(`/private/sso/providers/${providerId}`), {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ enforce_sso: false }),
      })

      expect(disableResponse.status).toBe(200)
      const disabledProvider = await disableResponse.json() as { enforce_sso: boolean }
      expect(disabledProvider.enforce_sso).toBe(false)

      const disabledUser = await pool.query<{ is_sso_user: boolean }>(
        'select is_sso_user from auth.users where id = $1',
        [createdUser.user.id],
      )
      expect(disabledUser.rows[0]?.is_sso_user).toBe(false)
    }
    finally {
      await Promise.allSettled([
        (getSupabaseClient().from as any)('sso_providers').delete().eq('id', providerId),
        getSupabaseClient().auth.admin.deleteUser(createdUser.user.id),
        pool.end(),
      ])
    }
  })
})
