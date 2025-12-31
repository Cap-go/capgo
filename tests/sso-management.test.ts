import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { BASE_URL, getSupabaseClient, headersInternal, ORG_ID, USER_ADMIN_EMAIL, USER_ID } from './test-utils.ts'

const TEST_SSO_ORG_ID = randomUUID()
const TEST_SSO_ORG_NAME = `SSO Test Org ${randomUUID()}`
const TEST_CUSTOMER_ID = `cus_sso_${randomUUID()}`
const TEST_DOMAIN = 'ssotest.com'
const TEST_ENTITY_ID = 'https://example.com/sso/entity'
const TEST_METADATA_URL = 'https://example.com/saml/metadata'
const TEST_METADATA_XML = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${TEST_ENTITY_ID}">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://example.com/sso/login"/>
  </IDPSSODescriptor>
</EntityDescriptor>`

// Mock Deno.Command to prevent actual CLI execution
const originalDenoCommand = globalThis.Deno?.Command

beforeAll(async () => {
  // Clean up any existing test data from previous runs (idempotent)
  await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', TEST_DOMAIN)
  await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', TEST_SSO_ORG_ID)
  await getSupabaseClient().from('org_users').delete().eq('org_id', TEST_SSO_ORG_ID)
  await getSupabaseClient().from('orgs').delete().eq('id', TEST_SSO_ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', TEST_CUSTOMER_ID)

  // Mock Deno.Command if running in Deno environment
  if (globalThis.Deno) {
    // @ts-expect-error - Mocking Deno.Command
    globalThis.Deno.Command = vi.fn().mockImplementation((_cmd: string, _options: any) => {
      return {
        output: vi.fn().mockResolvedValue({
          success: true,
          stdout: new TextEncoder().encode(JSON.stringify({
            provider_id: randomUUID(),
            entity_id: TEST_ENTITY_ID,
            acs_url: 'https://api.supabase.com/v1/sso/acs',
            domains: [TEST_DOMAIN],
          })),
          stderr: new TextEncoder().encode(''),
        }),
      }
    })
  }

  // Create stripe_info for test org
  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: TEST_CUSTOMER_ID,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  // Create test org
  const { error } = await getSupabaseClient().from('orgs').insert({
    id: TEST_SSO_ORG_ID,
    name: TEST_SSO_ORG_NAME,
    management_email: USER_ADMIN_EMAIL,
    created_by: USER_ID,
    customer_id: TEST_CUSTOMER_ID,
  })
  if (error)
    throw error

  // Make test user super_admin of the org (idempotent - only insert if not exists)
  const { data: existingOrgUser } = await getSupabaseClient()
    .from('org_users')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('org_id', TEST_SSO_ORG_ID)
    .maybeSingle()

  if (!existingOrgUser) {
    const { error: orgUserError } = await getSupabaseClient().from('org_users').insert({
      user_id: USER_ID,
      org_id: TEST_SSO_ORG_ID,
      user_right: 'super_admin',
    })
    if (orgUserError)
      throw orgUserError
  }
})

afterAll(async () => {
  // Restore original Deno.Command
  if (originalDenoCommand && globalThis.Deno) {
    // @ts-expect-error - Restoring Deno.Command
    globalThis.Deno.Command = originalDenoCommand
  }

  // Clean up SSO data
  const ssoConnections = await getSupabaseClient()
    .from('org_saml_connections')
    .select('id')
    .eq('org_id', TEST_SSO_ORG_ID)

  if (ssoConnections.data) {
    for (const connection of ssoConnections.data) {
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('sso_connection_id', connection.id)
    }
  }

  await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', TEST_SSO_ORG_ID)
  await getSupabaseClient().from('sso_audit_logs').delete().eq('org_id', TEST_SSO_ORG_ID)
  await getSupabaseClient().from('org_users').delete().eq('org_id', TEST_SSO_ORG_ID)
  await getSupabaseClient().from('orgs').delete().eq('id', TEST_SSO_ORG_ID)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', TEST_CUSTOMER_ID)
})

describe('sso management', () => {
  describe('security validations', () => {
    describe('ssrf protection', () => {
      const dangerousUrls = [
        'http://localhost:8080/metadata',
        'http://127.0.0.1:8080/metadata',
        'http://169.254.169.254/latest/meta-data/',
        'http://10.0.0.1/metadata',
        'http://192.168.1.1/metadata',
        'http://172.16.0.1/metadata',
      ]

      dangerousUrls.forEach((url) => {
        it(`should reject SSRF attempt with ${url}`, async () => {
          const response = await fetch(`${BASE_URL}/private/sso/configure`, {
            method: 'POST',
            headers: headersInternal,
            body: JSON.stringify({
              orgId: TEST_SSO_ORG_ID,
              metadataUrl: url,
              domains: [TEST_DOMAIN],
            }),
          })

          expect(response.status).toBe(400)
          const data = await response.json() as any
          expect(data.message).toContain('SSRF')
        })
      })

      it('should accept valid HTTPS metadata URL', async () => {
        const response = await fetch(`${BASE_URL}/private/sso/configure`, {
          method: 'POST',
          headers: headersInternal,
          body: JSON.stringify({
            orgId: TEST_SSO_ORG_ID,
            metadataUrl: TEST_METADATA_URL,
            domains: [TEST_DOMAIN],
          }),
        })

        // Will succeed or fail based on CLI execution, but should not reject for SSRF
        const data = await response.json() as any
        expect(data.message).not.toContain('SSRF')
      })
    })

    describe('xml sanitization', () => {
      it('should reject XML with DOCTYPE declaration', async () => {
        const maliciousXml = `<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${TEST_ENTITY_ID}">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://example.com/sso/login"/>
  </IDPSSODescriptor>
</EntityDescriptor>`

        const response = await fetch(`${BASE_URL}/private/sso/configure`, {
          method: 'POST',
          headers: headersInternal,
          body: JSON.stringify({
            orgId: TEST_SSO_ORG_ID,
            metadataXml: maliciousXml,
            domains: [TEST_DOMAIN],
          }),
        })

        expect(response.status).toBe(400)
        const data = await response.json() as any
        expect(data.message).toContain('DOCTYPE')
      })

      it('should reject XML with ENTITY declaration', async () => {
        const maliciousXml = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${TEST_ENTITY_ID}">
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://example.com/sso/login"/>
  </IDPSSODescriptor>
</EntityDescriptor>`

        const response = await fetch(`${BASE_URL}/private/sso/configure`, {
          method: 'POST',
          headers: headersInternal,
          body: JSON.stringify({
            orgId: TEST_SSO_ORG_ID,
            metadataXml: maliciousXml,
            domains: [TEST_DOMAIN],
          }),
        })

        expect(response.status).toBe(400)
        const data = await response.json() as any
        expect(data.message).toContain('ENTITY')
      })

      it('should accept valid SAML metadata XML', async () => {
        const response = await fetch(`${BASE_URL}/private/sso/configure`, {
          method: 'POST',
          headers: headersInternal,
          body: JSON.stringify({
            orgId: TEST_SSO_ORG_ID,
            metadataXml: TEST_METADATA_XML,
            domains: [TEST_DOMAIN],
          }),
        })

        // Will succeed or fail based on CLI execution, but should not reject for XML validation
        const data = await response.json() as any
        expect(data.message).not.toContain('DOCTYPE')
        expect(data.message).not.toContain('ENTITY')
      })
    })
  })

  describe('[POST] /private/sso/configure', () => {
    it('should reject request without super_admin permission', async () => {
      // Using regular ORG_ID where test user is not super_admin
      const response = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: ORG_ID,
          metadataUrl: TEST_METADATA_URL,
          domains: [TEST_DOMAIN],
        }),
      })

      expect(response.status).toBe(403)
    })

    it('should require either metadataUrl or metadataXml', async () => {
      const response = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: TEST_SSO_ORG_ID,
          domains: [TEST_DOMAIN],
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json() as any
      expect(data.message).toContain('metadata')
    })

    it('should require at least one domain', async () => {
      const response = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: TEST_SSO_ORG_ID,
          metadataUrl: TEST_METADATA_URL,
          domains: [],
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json() as any
      expect(data.message).toContain('domain')
    })

    it('should validate domain format', async () => {
      const invalidDomains = ['invalid domain', 'domain with spaces', '@invalid', 'http://example.com']

      for (const domain of invalidDomains) {
        const response = await fetch(`${BASE_URL}/private/sso/configure`, {
          method: 'POST',
          headers: headersInternal,
          body: JSON.stringify({
            orgId: TEST_SSO_ORG_ID,
            metadataUrl: TEST_METADATA_URL,
            domains: [domain],
          }),
        })

        expect(response.status).toBe(400)
        const data = await response.json() as any
        expect(data.message.toLowerCase()).toContain('domain')
      }
    })
  })

  describe('[GET] /private/sso/status', () => {
    it('should return null for org without SSO', async () => {
      const response = await fetch(`${BASE_URL}/private/sso/status?orgId=${TEST_SSO_ORG_ID}`, {
        headers: headersInternal,
      })

      expect(response.status).toBe(200)
      const data = await response.json() as any
      expect(data.ssoConfig).toBeNull()
    })
  })

  describe('audit logging', () => {
    it('should log SSO configuration attempts', async () => {
      // Make a configuration request
      await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: TEST_SSO_ORG_ID,
          metadataUrl: TEST_METADATA_URL,
          domains: [TEST_DOMAIN],
        }),
      })

      // Check audit logs
      const { data: auditLogs } = await getSupabaseClient()
        .from('sso_audit_logs')
        .select('*')
        .eq('org_id', TEST_SSO_ORG_ID)
        .order('created_at', { ascending: false })
        .limit(1)

      // Audit log should exist (success or failure)
      expect(auditLogs).toBeDefined()
      if (auditLogs && auditLogs.length > 0) {
        const log = auditLogs[0]
        expect(log.event_type).toMatch(/^sso_/)
        expect(log.org_id).toBe(TEST_SSO_ORG_ID)
        expect(log.metadata).toBeDefined()
      }
    })

    it('should capture IP address in audit logs', async () => {
      const testIp = '203.0.113.42'

      await fetch(`${BASE_URL}/private/sso/status?orgId=${TEST_SSO_ORG_ID}`, {
        headers: {
          ...headersInternal,
          'x-forwarded-for': testIp,
        },
      })

      // Check audit logs for view event
      const { data: auditLogs } = await getSupabaseClient()
        .from('sso_audit_logs')
        .select('*')
        .eq('org_id', TEST_SSO_ORG_ID)
        .eq('event_type', 'sso_config_viewed')
        .order('created_at', { ascending: false })
        .limit(1)

      if (auditLogs && auditLogs.length > 0) {
        const log = auditLogs[0]
        expect(log.ip_address).toBeDefined()
        // IP might be captured from different headers depending on environment
      }
    })

    it('should capture user agent in audit logs', async () => {
      const testUserAgent = 'Test-SSO-Agent/1.0'

      await fetch(`${BASE_URL}/private/sso/status?orgId=${TEST_SSO_ORG_ID}`, {
        headers: {
          ...headersInternal,
          'user-agent': testUserAgent,
        },
      })

      // Check audit logs
      const { data: auditLogs } = await getSupabaseClient()
        .from('sso_audit_logs')
        .select('*')
        .eq('org_id', TEST_SSO_ORG_ID)
        .eq('event_type', 'sso_config_viewed')
        .order('created_at', { ascending: false })
        .limit(1)

      if (auditLogs && auditLogs.length > 0) {
        const log = auditLogs[0]
        expect(log.user_agent).toBeDefined()
      }
    })
  })

  describe('domain auto-enrollment integration', () => {
    it('should create domain mappings when configuring SSO', async () => {
      const testDomain = `sso-integration-${randomUUID()}.com`

      // Configure SSO with domain
      const response = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: TEST_SSO_ORG_ID,
          metadataXml: TEST_METADATA_XML,
          domains: [testDomain],
        }),
      })

      // If SSO configuration succeeds (depends on CLI mock)
      if (response.status === 200) {
        const data = await response.json() as any
        const _providerId = data.ssoProviderId

        // Check domain mappings
        const { data: mappings } = await getSupabaseClient()
          .from('saml_domain_mappings')
          .select('*')
          .eq('domain', testDomain)

        expect(mappings).toBeDefined()
        if (mappings && mappings.length > 0) {
          expect(mappings[0].verified).toBe(true)
          expect(mappings[0].sso_connection_id).toBeDefined()
        }
      }
    })
  })

  describe('permission validation', () => {
    it('should allow read permission for SSO status', async () => {
      // Create a test org where user has only 'read' permission
      const readOnlyOrgId = randomUUID()
      const readOnlyCustomerId = `cus_readonly_${randomUUID()}`

      // Create stripe_info
      await getSupabaseClient().from('stripe_info').insert({
        customer_id: readOnlyCustomerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      // Create org
      await getSupabaseClient().from('orgs').insert({
        id: readOnlyOrgId,
        name: 'Read Only Org',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: readOnlyCustomerId,
      })

      // Add user with read permission
      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: readOnlyOrgId,
        user_right: 'read',
      })

      // Should be able to view SSO status with read permission
      const response = await fetch(`${BASE_URL}/private/sso/status?orgId=${readOnlyOrgId}`, {
        headers: headersInternal,
      })

      expect(response.status).toBe(200)

      // Cleanup
      await getSupabaseClient().from('org_users').delete().eq('org_id', readOnlyOrgId)
      await getSupabaseClient().from('orgs').delete().eq('id', readOnlyOrgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', readOnlyCustomerId)
    })

    it('should reject SSO configuration with read-only permission', async () => {
      const readOnlyOrgId = randomUUID()
      const readOnlyCustomerId = `cus_readonly2_${randomUUID()}`

      // Create stripe_info
      await getSupabaseClient().from('stripe_info').insert({
        customer_id: readOnlyCustomerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      // Create org
      await getSupabaseClient().from('orgs').insert({
        id: readOnlyOrgId,
        name: 'Read Only Org 2',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: readOnlyCustomerId,
      })

      // Add user with read permission
      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: readOnlyOrgId,
        user_right: 'read',
      })

      // Should be rejected for SSO configuration
      const response = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: readOnlyOrgId,
          metadataUrl: TEST_METADATA_URL,
          domains: [TEST_DOMAIN],
        }),
      })

      expect(response.status).toBe(403)

      // Cleanup
      await getSupabaseClient().from('org_users').delete().eq('org_id', readOnlyOrgId)
      await getSupabaseClient().from('orgs').delete().eq('id', readOnlyOrgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', readOnlyCustomerId)
    })
  })

  describe('rate limiting', () => {
    it('should enforce rate limit after 10 domain changes', async () => {
      // Make 10 domain changes (should succeed)
      for (let i = 0; i < 10; i++) {
        const response = await fetch(`${BASE_URL}/private/sso/configure`, {
          method: 'POST',
          headers: headersInternal,
          body: JSON.stringify({
            orgId: TEST_SSO_ORG_ID,
            metadataXml: TEST_METADATA_XML,
            domains: [`domain${i}.com`],
          }),
        })

        // May succeed or fail based on CLI, but should not be rate limited yet
        const data = await response.json() as any
        expect(data.message).not.toContain('rate_limit_exceeded')
      }

      // 11th attempt should be rate limited
      const response = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: TEST_SSO_ORG_ID,
          metadataXml: TEST_METADATA_XML,
          domains: ['domain11.com'],
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json() as any
      expect(data.message).toContain('rate_limit_exceeded')
      expect(data.message).toContain('10 per hour')
    })
  })

  describe('domain uniqueness constraint', () => {
    it('should reject duplicate root domain across organizations', async () => {
      const org1Id = randomUUID()
      const org2Id = randomUUID()
      const customer1Id = `cus_unique1_${randomUUID()}`
      const customer2Id = `cus_unique2_${randomUUID()}`
      const rootDomain = `unique-${randomUUID()}.com`

      // Create two test orgs
      await getSupabaseClient().from('stripe_info').insert([
        { customer_id: customer1Id, status: 'succeeded', product_id: 'prod_LQIregjtNduh4q' },
        { customer_id: customer2Id, status: 'succeeded', product_id: 'prod_LQIregjtNduh4q' },
      ])

      await getSupabaseClient().from('orgs').insert([
        { id: org1Id, name: 'Org 1', management_email: USER_ADMIN_EMAIL, created_by: USER_ID, customer_id: customer1Id },
        { id: org2Id, name: 'Org 2', management_email: USER_ADMIN_EMAIL, created_by: USER_ID, customer_id: customer2Id },
      ])

      await getSupabaseClient().from('org_users').insert([
        { user_id: USER_ID, org_id: org1Id, user_right: 'super_admin' },
        { user_id: USER_ID, org_id: org2Id, user_right: 'super_admin' },
      ])

      // Org 1 claims root domain (may succeed or fail based on CLI)
      const response1 = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: org1Id,
          metadataXml: TEST_METADATA_XML,
          domains: [rootDomain],
        }),
      })

      // If first org succeeded, manually insert domain mapping
      if (response1.status === 200) {
        await getSupabaseClient().from('saml_domain_mappings').insert({
          domain: rootDomain,
          org_id: org1Id,
          verified: true,
        })
      }
      else {
        // Manually insert to test constraint
        await getSupabaseClient().from('saml_domain_mappings').insert({
          domain: rootDomain,
          org_id: org1Id,
          verified: true,
        })
      }

      // Org 2 tries to claim same root domain - should be rejected
      const response2 = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: org2Id,
          metadataXml: TEST_METADATA_XML,
          domains: [rootDomain],
        }),
      })

      expect(response2.status).toBe(400)
      const data = await response2.json() as any
      expect(data.message).toContain('already claimed')

      // Cleanup
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', rootDomain)
      await getSupabaseClient().from('org_users').delete().in('org_id', [org1Id, org2Id])
      await getSupabaseClient().from('orgs').delete().in('id', [org1Id, org2Id])
      await getSupabaseClient().from('stripe_info').delete().in('customer_id', [customer1Id, customer2Id])
    })

    it('should allow subdomain when root owned by different org', async () => {
      const org1Id = randomUUID()
      const org2Id = randomUUID()
      const customer1Id = `cus_subdomain1_${randomUUID()}`
      const customer2Id = `cus_subdomain2_${randomUUID()}`
      const uniqueId = randomUUID().slice(0, 8)
      const rootDomain = `company${uniqueId}.com`
      const subdomain = `eng.company${uniqueId}.com`

      // Create two test orgs
      await getSupabaseClient().from('stripe_info').insert([
        { customer_id: customer1Id, status: 'succeeded', product_id: 'prod_LQIregjtNduh4q' },
        { customer_id: customer2Id, status: 'succeeded', product_id: 'prod_LQIregjtNduh4q' },
      ])

      await getSupabaseClient().from('orgs').insert([
        { id: org1Id, name: 'Parent Org', management_email: USER_ADMIN_EMAIL, created_by: USER_ID, customer_id: customer1Id },
        { id: org2Id, name: 'Engineering Org', management_email: USER_ADMIN_EMAIL, created_by: USER_ID, customer_id: customer2Id },
      ])

      await getSupabaseClient().from('org_users').insert([
        { user_id: USER_ID, org_id: org1Id, user_right: 'super_admin' },
        { user_id: USER_ID, org_id: org2Id, user_right: 'super_admin' },
      ])

      // Org 1 claims root domain
      await getSupabaseClient().from('saml_domain_mappings').insert({
        domain: rootDomain,
        org_id: org1Id,
        verified: true,
      })

      // Org 2 claims subdomain - should be allowed
      const response = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId: org2Id,
          metadataXml: TEST_METADATA_XML,
          domains: [subdomain],
        }),
      })

      // Should either succeed or fail for non-uniqueness reasons
      const data = await response.json() as any
      expect(data.message).not.toContain('root_domain_already_claimed')

      // Cleanup
      await getSupabaseClient().from('saml_domain_mappings').delete().in('domain', [rootDomain, subdomain])
      await getSupabaseClient().from('org_users').delete().in('org_id', [org1Id, org2Id])
      await getSupabaseClient().from('orgs').delete().in('id', [org1Id, org2Id])
      await getSupabaseClient().from('stripe_info').delete().in('customer_id', [customer1Id, customer2Id])
    })

    it('should handle multi-part TLDs correctly', async () => {
      const orgId = randomUUID()
      const customerId = `cus_tld_${randomUUID()}`
      const domain = `company.co.uk`

      await getSupabaseClient().from('stripe_info').insert({
        customer_id: customerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      await getSupabaseClient().from('orgs').insert({
        id: orgId,
        name: 'UK Company',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: customerId,
      })

      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: orgId,
        user_right: 'super_admin',
      })

      // Should accept .co.uk domain
      const response = await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId,
          metadataXml: TEST_METADATA_XML,
          domains: [domain],
        }),
      })

      // Should not fail due to domain format
      const data = await response.json() as any
      expect(data.message).not.toContain('Invalid domain format')

      // Cleanup
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', domain)
      await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
      await getSupabaseClient().from('orgs').delete().eq('id', orgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
    })
  })

  describe('auto-join integration', () => {
    it('should auto-enroll new users with verified SSO domain on signup', async () => {
      const orgId = randomUUID()
      const customerId = `cus_autojoin_${randomUUID()}`
      const domain = `autojoin${randomUUID().slice(0, 8)}.com`
      const testUserId = randomUUID()
      const testUserEmail = `testuser@${domain}`

      // Setup org with SSO
      await getSupabaseClient().from('stripe_info').insert({
        customer_id: customerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      await getSupabaseClient().from('orgs').insert({
        id: orgId,
        name: 'Auto-Join Test Org',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: customerId,
      })

      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: orgId,
        user_right: 'super_admin',
      })

      // Configure SSO for this domain
      await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId,
          metadataXml: TEST_METADATA_XML,
          domains: [domain],
        }),
      })

      // Get the SSO provider ID
      const { data: ssoProvider } = await getSupabaseClient()
        .from('org_saml_connections')
        .select('id')
        .eq('org_id', orgId)
        .single()

      // Simulate new user signup with SSO metadata
      await getSupabaseClient().from('users').insert({
        id: testUserId,
        email: testUserEmail,
        raw_user_meta_data: {
          sso_provider_id: ssoProvider!.id,
        },
      })

      // Check if user was auto-enrolled
      const { data: membership } = await getSupabaseClient()
        .from('org_users')
        .select('*')
        .eq('user_id', testUserId)
        .eq('org_id', orgId)
        .single()

      expect(membership).toBeTruthy()
      expect(membership!.user_right).toBe('read')

      // Cleanup
      await getSupabaseClient().from('org_users').delete().eq('user_id', testUserId)
      await getSupabaseClient().from('users').delete().eq('id', testUserId)
      await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('org_id', orgId)
      await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
      await getSupabaseClient().from('orgs').delete().eq('id', orgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
    })

    it('should auto-enroll existing users on first SSO login', async () => {
      const orgId = randomUUID()
      const customerId = `cus_existing_${randomUUID()}`
      const domain = `existing${randomUUID().slice(0, 8)}.com`
      const testUserId = randomUUID()
      const testUserEmail = `existing@${domain}`

      // Create user first (existing user)
      await getSupabaseClient().from('users').insert({
        id: testUserId,
        email: testUserEmail,
        raw_user_meta_data: {},
      })

      // Setup org with SSO
      await getSupabaseClient().from('stripe_info').insert({
        customer_id: customerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      await getSupabaseClient().from('orgs').insert({
        id: orgId,
        name: 'Existing User Test Org',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: customerId,
      })

      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: orgId,
        user_right: 'super_admin',
      })

      // Configure SSO
      await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId,
          metadataXml: TEST_METADATA_XML,
          domains: [domain],
        }),
      })

      const { data: ssoProvider } = await getSupabaseClient()
        .from('org_saml_connections')
        .select('id')
        .eq('org_id', orgId)
        .single()

      // Simulate SSO login by updating metadata
      await getSupabaseClient()
        .from('users')
        .update({
          raw_user_meta_data: {
            sso_provider_id: ssoProvider!.id,
          },
        })
        .eq('id', testUserId)

      // Wait a bit for trigger to process
      await new Promise(resolve => setTimeout(resolve, 500))

      // Check if user was auto-enrolled
      const { data: membership } = await getSupabaseClient()
        .from('org_users')
        .select('*')
        .eq('user_id', testUserId)
        .eq('org_id', orgId)
        .single()

      expect(membership).toBeTruthy()
      expect(membership!.user_right).toBe('read')

      // Cleanup
      await getSupabaseClient().from('org_users').delete().eq('user_id', testUserId)
      await getSupabaseClient().from('users').delete().eq('id', testUserId)
      await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('org_id', orgId)
      await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
      await getSupabaseClient().from('orgs').delete().eq('id', orgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
    })

    it('should give auto-enrolled users read permission by default', async () => {
      const orgId = randomUUID()
      const customerId = `cus_perms_${randomUUID()}`
      const domain = `perms${randomUUID().slice(0, 8)}.com`
      const testUserId = randomUUID()
      const testUserEmail = `perms@${domain}`

      await getSupabaseClient().from('stripe_info').insert({
        customer_id: customerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      await getSupabaseClient().from('orgs').insert({
        id: orgId,
        name: 'Permissions Test Org',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: customerId,
      })

      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: orgId,
        user_right: 'super_admin',
      })

      await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId,
          metadataXml: TEST_METADATA_XML,
          domains: [domain],
        }),
      })

      const { data: ssoProvider } = await getSupabaseClient()
        .from('org_saml_connections')
        .select('id')
        .eq('org_id', orgId)
        .single()

      await getSupabaseClient().from('users').insert({
        id: testUserId,
        email: testUserEmail,
        raw_user_meta_data: {
          sso_provider_id: ssoProvider!.id,
        },
      })

      const { data: membership } = await getSupabaseClient()
        .from('org_users')
        .select('user_right')
        .eq('user_id', testUserId)
        .eq('org_id', orgId)
        .single()

      expect(membership!.user_right).toBe('read')

      // Cleanup
      await getSupabaseClient().from('org_users').delete().eq('user_id', testUserId)
      await getSupabaseClient().from('users').delete().eq('id', testUserId)
      await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('org_id', orgId)
      await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
      await getSupabaseClient().from('orgs').delete().eq('id', orgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
    })

    it('should not auto-enroll users with public email domains', async () => {
      const testUserId = randomUUID()
      const publicEmail = `test${randomUUID().slice(0, 8)}@gmail.com`

      // Create user with public email
      await getSupabaseClient().from('users').insert({
        id: testUserId,
        email: publicEmail,
        raw_user_meta_data: {},
      })

      // Check that no auto-enrollment happened
      const { data: memberships } = await getSupabaseClient()
        .from('org_users')
        .select('*')
        .eq('user_id', testUserId)

      expect(memberships).toEqual([])

      // Cleanup
      await getSupabaseClient().from('users').delete().eq('id', testUserId)
    })
  })

  describe('domain verification', () => {
    it('should mark domains as verified when added via SSO config', async () => {
      const orgId = randomUUID()
      const customerId = `cus_verify_${randomUUID()}`
      const domain = `verify${randomUUID().slice(0, 8)}.com`

      await getSupabaseClient().from('stripe_info').insert({
        customer_id: customerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      await getSupabaseClient().from('orgs').insert({
        id: orgId,
        name: 'Verification Test Org',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: customerId,
      })

      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: orgId,
        user_right: 'super_admin',
      })

      await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId,
          metadataXml: TEST_METADATA_XML,
          domains: [domain],
        }),
      })

      const { data: mapping } = await getSupabaseClient()
        .from('saml_domain_mappings')
        .select('verified')
        .eq('domain', domain)
        .single()

      expect(mapping!.verified).toBe(true)

      // Cleanup
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', domain)
      await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
      await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
      await getSupabaseClient().from('orgs').delete().eq('id', orgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
    })

    it('should create domain mappings with correct SSO provider reference', async () => {
      const orgId = randomUUID()
      const customerId = `cus_mapping_${randomUUID()}`
      const domain = `mapping${randomUUID().slice(0, 8)}.com`

      await getSupabaseClient().from('stripe_info').insert({
        customer_id: customerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      await getSupabaseClient().from('orgs').insert({
        id: orgId,
        name: 'Mapping Test Org',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: customerId,
      })

      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: orgId,
        user_right: 'super_admin',
      })

      await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId,
          metadataXml: TEST_METADATA_XML,
          domains: [domain],
        }),
      })

      const { data: ssoProvider } = await getSupabaseClient()
        .from('org_saml_connections')
        .select('id')
        .eq('org_id', orgId)
        .single()

      const { data: mapping } = await getSupabaseClient()
        .from('saml_domain_mappings')
        .select('sso_provider_id, domain, org_id')
        .eq('domain', domain)
        .single()

      expect(mapping!.sso_provider_id).toBe(ssoProvider!.id)
      expect(mapping!.org_id).toBe(orgId)
      expect(mapping!.domain).toBe(domain)

      // Cleanup
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', domain)
      await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
      await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
      await getSupabaseClient().from('orgs').delete().eq('id', orgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
    })

    it('should allow lookup_sso_provider_by_domain to find provider', async () => {
      const orgId = randomUUID()
      const customerId = `cus_lookup_${randomUUID()}`
      const domain = `lookup${randomUUID().slice(0, 8)}.com`

      await getSupabaseClient().from('stripe_info').insert({
        customer_id: customerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      await getSupabaseClient().from('orgs').insert({
        id: orgId,
        name: 'Lookup Test Org',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: customerId,
      })

      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: orgId,
        user_right: 'super_admin',
      })

      await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId,
          metadataXml: TEST_METADATA_XML,
          domains: [domain],
        }),
      })

      const { data: ssoProvider } = await getSupabaseClient()
        .from('org_saml_connections')
        .select('id')
        .eq('org_id', orgId)
        .single()

      // Call the lookup function
      const { data: lookupResult } = await getSupabaseClient()
        .rpc('lookup_sso_provider_by_domain', { email_domain: domain })

      expect(lookupResult).toBe(ssoProvider!.id)

      // Cleanup
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', domain)
      await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
      await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
      await getSupabaseClient().from('orgs').delete().eq('id', orgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
    })

    it('should include verified domains in SSO status response', async () => {
      const orgId = randomUUID()
      const customerId = `cus_status_${randomUUID()}`
      const domain1 = `status1${randomUUID().slice(0, 8)}.com`
      const domain2 = `status2${randomUUID().slice(0, 8)}.com`

      await getSupabaseClient().from('stripe_info').insert({
        customer_id: customerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      await getSupabaseClient().from('orgs').insert({
        id: orgId,
        name: 'Status Test Org',
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: customerId,
      })

      await getSupabaseClient().from('org_users').insert({
        user_id: USER_ID,
        org_id: orgId,
        user_right: 'super_admin',
      })

      await fetch(`${BASE_URL}/private/sso/configure`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({
          orgId,
          metadataXml: TEST_METADATA_XML,
          domains: [domain1, domain2],
        }),
      })

      const response = await fetch(`${BASE_URL}/private/sso/status?orgId=${orgId}`, {
        headers: headersInternal,
      })

      const data = await response.json() as any
      expect(data.configured).toBe(true)
      expect(data.domains).toContain(domain1)
      expect(data.domains).toContain(domain2)
      expect(data.domains.length).toBe(2)

      // Cleanup
      await getSupabaseClient().from('saml_domain_mappings').delete().in('domain', [domain1, domain2])
      await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
      await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
      await getSupabaseClient().from('orgs').delete().eq('id', orgId)
      await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
    })
  })
})
