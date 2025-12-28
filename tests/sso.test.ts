import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BASE_URL, getSupabaseClient, headers, TEST_EMAIL, USER_ID } from './test-utils.ts'

// Test org and domain IDs
const SSO_TEST_ORG_ID = randomUUID()
const SSO_TEST_ORG_ID_BASIC = randomUUID()
const globalId = randomUUID()
const enterpriseCustomerId = `cus_test_sso_enterprise_${globalId}`
const basicCustomerId = `cus_test_sso_basic_${globalId}`
const testDomain = `sso-test-${globalId}.com`
const testDomain2 = `sso-test2-${globalId}.com`

let createdDomainId: string | null = null
let createdSsoConfigId: string | null = null

beforeAll(async () => {
  const supabase = getSupabaseClient()

  // Create Enterprise stripe_info
  const { error: stripeError } = await supabase.from('stripe_info').insert({
    customer_id: enterpriseCustomerId,
    status: 'succeeded',
    product_id: 'prod_LQIs1Yucml9ChU', // Enterprise plan
    subscription_id: `sub_enterprise_${globalId}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  // Create test organization with Enterprise plan
  const { error: orgError } = await supabase.from('orgs').insert({
    id: SSO_TEST_ORG_ID,
    name: `SSO Test Enterprise Org ${globalId}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: enterpriseCustomerId,
  })
  if (orgError)
    throw orgError

  // Create Basic/Solo stripe_info
  const { error: stripeBasicError } = await supabase.from('stripe_info').insert({
    customer_id: basicCustomerId,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q', // Solo plan
    subscription_id: `sub_basic_${globalId}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeBasicError)
    throw stripeBasicError

  // Create test organization with Basic plan (for gating tests)
  const { error: orgBasicError } = await supabase.from('orgs').insert({
    id: SSO_TEST_ORG_ID_BASIC,
    name: `SSO Test Basic Org ${globalId}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: basicCustomerId,
  })
  if (orgBasicError)
    throw orgBasicError
})

afterAll(async () => {
  const supabase = getSupabaseClient()

  // Clean up SSO providers
  await (supabase as any).from('org_sso_providers').delete().eq('org_id', SSO_TEST_ORG_ID)

  // Clean up domains
  await (supabase as any).from('org_domains').delete().eq('org_id', SSO_TEST_ORG_ID)

  // Clean up orgs (will cascade to org_users)
  await supabase.from('orgs').delete().eq('id', SSO_TEST_ORG_ID)
  await supabase.from('orgs').delete().eq('id', SSO_TEST_ORG_ID_BASIC)

  // Clean up stripe_info
  await supabase.from('stripe_info').delete().eq('customer_id', enterpriseCustomerId)
  await supabase.from('stripe_info').delete().eq('customer_id', basicCustomerId)
})

// ============================================================================
// SSO CONFIG ENDPOINTS
// ============================================================================

describe('[GET] /sso/config', () => {
  it('get SSO config for Enterprise org', async () => {
    const response = await fetch(`${BASE_URL}/sso/config?org_id=${SSO_TEST_ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { config: object | null, is_enterprise: boolean }
    expect(data.is_enterprise).toBe(true)
    expect(data.config).toBeNull() // No config yet
  })

  it('get SSO config for non-Enterprise org', async () => {
    const response = await fetch(`${BASE_URL}/sso/config?org_id=${SSO_TEST_ORG_ID_BASIC}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { config: object | null, is_enterprise: boolean }
    expect(data.is_enterprise).toBe(false)
  })

  it('get SSO config with missing org_id', async () => {
    const response = await fetch(`${BASE_URL}/sso/config`, {
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_org_id')
  })

  it('get SSO config with invalid org_id', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/sso/config?org_id=${invalidOrgId}`, {
      headers,
    })
    expect(response.status).toBe(401)
  })
})

describe('[POST] /sso/config', () => {
  it('create SSO config for Enterprise org', async () => {
    const response = await fetch(`${BASE_URL}/sso/config`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: SSO_TEST_ORG_ID,
        provider_type: 'saml',
        display_name: 'Test Okta',
        metadata_url: 'https://test.okta.com/metadata',
        enabled: false,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { id: string, success: boolean }
    expect(data.success).toBe(true)
    expect(data.id).toBeDefined()
    createdSsoConfigId = data.id
  })

  it('update existing SSO config', async () => {
    const response = await fetch(`${BASE_URL}/sso/config`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: SSO_TEST_ORG_ID,
        display_name: 'Updated Okta',
        enabled: true,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('create SSO config for non-Enterprise org (should fail)', async () => {
    const response = await fetch(`${BASE_URL}/sso/config`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: SSO_TEST_ORG_ID_BASIC,
        provider_type: 'saml',
        display_name: 'Test Okta',
        metadata_url: 'https://test.okta.com/metadata',
        enabled: false,
      }),
    })

    expect(response.status).toBe(403)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('requires_enterprise')
  })

  it('create SSO config with invalid body', async () => {
    const response = await fetch(`${BASE_URL}/sso/config`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })

  it('verify SSO config was created', async () => {
    const response = await fetch(`${BASE_URL}/sso/config?org_id=${SSO_TEST_ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { config: { display_name: string, enabled: boolean } }
    expect(data.config).not.toBeNull()
    expect(data.config.display_name).toBe('Updated Okta')
    expect(data.config.enabled).toBe(true)
  })
})

// ============================================================================
// DOMAIN ENDPOINTS
// ============================================================================

describe('[GET] /sso/domains', () => {
  it('get domains for Enterprise org (empty)', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains?org_id=${SSO_TEST_ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { domains: any[], is_enterprise: boolean }
    expect(data.is_enterprise).toBe(true)
    expect(Array.isArray(data.domains)).toBe(true)
  })

  it('get domains with missing org_id', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains`, {
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_org_id')
  })

  it('get domains with invalid org_id', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/sso/domains?org_id=${invalidOrgId}`, {
      headers,
    })
    expect(response.status).toBe(401)
  })
})

describe('[POST] /sso/domains', () => {
  it('add domain to Enterprise org', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: SSO_TEST_ORG_ID,
        domain: testDomain,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { id: string, verification_token: string, dns_record: string, success: boolean }
    expect(data.success).toBe(true)
    expect(data.id).toBeDefined()
    expect(data.verification_token).toBeDefined()
    expect(data.dns_record).toBe(`_capgo-verification.${testDomain}`)
    createdDomainId = data.id
  })

  it('add second domain to Enterprise org', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: SSO_TEST_ORG_ID,
        domain: testDomain2,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('add duplicate domain (should fail)', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: SSO_TEST_ORG_ID,
        domain: testDomain,
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('DOMAIN_ALREADY_CLAIMED')
  })

  it('add domain to non-Enterprise org (should fail due to plan gating in RPC)', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: SSO_TEST_ORG_ID_BASIC,
        domain: `basic-test-${globalId}.com`,
      }),
    })

    // The RPC function checks Enterprise plan and returns error code
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('REQUIRES_ENTERPRISE')
  })

  it('add domain with invalid body', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })

  it('verify domains were added', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains?org_id=${SSO_TEST_ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { domains: any[] }
    expect(data.domains.length).toBeGreaterThanOrEqual(2)

    const domain1 = data.domains.find((d: any) => d.domain === testDomain)
    expect(domain1).toBeDefined()
    expect(domain1.verified).toBe(false)
    expect(domain1.auto_join_enabled).toBe(true)
  })
})

describe('[PUT] /sso/domains/settings', () => {
  it('update domain settings', async () => {
    if (!createdDomainId)
      throw new Error('Domain was not created in previous test')

    const response = await fetch(`${BASE_URL}/sso/domains/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        domain_id: createdDomainId,
        auto_join_enabled: false,
        auto_join_role: 'write',
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('verify settings were updated', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains?org_id=${SSO_TEST_ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { domains: any[] }

    const domain = data.domains.find((d: any) => d.id === createdDomainId)
    expect(domain).toBeDefined()
    expect(domain.auto_join_enabled).toBe(false)
    expect(domain.auto_join_role).toBe('write')
  })

  it('update domain settings with invalid domain_id', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        domain_id: randomUUID(),
        auto_join_enabled: true,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('domain_not_found')
  })

  it('update domain settings with invalid body', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })
})

describe('[POST] /sso/domains/verify', () => {
  it('verify domain with missing DNS record (should fail)', async () => {
    if (!createdDomainId)
      throw new Error('Domain was not created in previous test')

    const response = await fetch(`${BASE_URL}/sso/domains/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        domain_id: createdDomainId,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean, verified: boolean, error?: string }
    expect(data.success).toBe(false)
    expect(data.verified).toBe(false)
    expect(data.error).toBe('dns_lookup_failed')
  })

  it('verify domain with invalid domain_id', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        domain_id: randomUUID(),
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('domain_not_found')
  })

  it('verify domain with invalid body', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })
})

describe('[GET] /sso/domains/preview', () => {
  it('preview domain user count', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains/preview?org_id=${SSO_TEST_ORG_ID}&domain=${testDomain}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { domain: string, user_count: number }
    expect(data.domain).toBe(testDomain)
    expect(typeof data.user_count).toBe('number')
    expect(data.user_count).toBeGreaterThanOrEqual(0)
  })

  it('preview with missing params', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains/preview?org_id=${SSO_TEST_ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_params')
  })

  it('preview with invalid org_id', async () => {
    const invalidOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/sso/domains/preview?org_id=${invalidOrgId}&domain=test.com`, {
      headers,
    })
    expect(response.status).toBe(401)
  })
})

describe('[DELETE] /sso/domains', () => {
  it('delete domain with invalid domain_id', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains?domain_id=${randomUUID()}`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('domain_not_found')
  })

  it('delete domain with missing domain_id', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_domain_id')
  })

  it('delete domain', async () => {
    if (!createdDomainId)
      throw new Error('Domain was not created in previous test')

    const response = await fetch(`${BASE_URL}/sso/domains?domain_id=${createdDomainId}`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('verify domain was deleted', async () => {
    const response = await fetch(`${BASE_URL}/sso/domains?org_id=${SSO_TEST_ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { domains: any[] }

    const domain = data.domains.find((d: any) => d.id === createdDomainId)
    expect(domain).toBeUndefined()
  })
})

describe('[DELETE] /sso/config', () => {
  it('delete SSO config with missing org_id', async () => {
    const response = await fetch(`${BASE_URL}/sso/config`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_org_id')
  })

  it('delete SSO config', async () => {
    const response = await fetch(`${BASE_URL}/sso/config?org_id=${SSO_TEST_ORG_ID}`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('verify SSO config was deleted', async () => {
    const response = await fetch(`${BASE_URL}/sso/config?org_id=${SSO_TEST_ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { config: object | null }
    expect(data.config).toBeNull()
  })
})
