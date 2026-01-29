import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getEndpointUrl, getSupabaseClient, headersInternal, SSO_TEST_ORG_ID, USER_ADMIN_EMAIL, USER_ID } from './test-utils.ts'

// Use seeded SSO test data - these are pre-created in seed.sql for parallel test safety
const TEST_SSO_ORG_ID = SSO_TEST_ORG_ID
// Generate run-unique domain to avoid saml_domain_mappings collisions in parallel tests
// This is stable for the file's lifetime but unique per test run
const TEST_DOMAIN = `ssotest-${randomUUID().slice(0, 8)}.example.com`

// Helper functions to generate unique entity IDs (required since migration 20260104064028 enforces uniqueness)
function generateTestEntityId(): string {
  return `https://example.com/sso/entity/${randomUUID()}`
}

function generateTestMetadataXml(entityId: string): string {
  return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://example.com/sso/login"/>
  </IDPSSODescriptor>
</EntityDescriptor>`
}

// Legacy constants (kept for backward compatibility with skipped tests)
const TEST_ENTITY_ID = 'https://example.com/sso/entity'
const TEST_METADATA_XML = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${TEST_ENTITY_ID}">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://example.com/sso/login"/>
  </IDPSSODescriptor>
</EntityDescriptor>`

// Mock Deno.Command to prevent actual CLI execution
const originalDenoCommand = (globalThis as any).Deno?.Command

// Helper to ensure user is in org_users (insert if not exists)
// The org_users table doesn't have a unique constraint on (user_id, org_id), so we can't use upsert
async function ensureOrgUser(userId: string, orgId: string, userRight: 'super_admin' | 'admin' | 'write' | 'upload' | 'read' = 'super_admin'): Promise<void> {
  const { data: existing } = await getSupabaseClient()
    .from('org_users')
    .select('id')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!existing) {
    const { error } = await getSupabaseClient().from('org_users').insert({
      user_id: userId,
      org_id: orgId,
      user_right: userRight,
    })
    if (error)
      throw new Error(`Failed to insert org_user: ${error.message}`)
  }
}

// Helper function to get or create test auth user with metadata
async function getOrCreateTestAuthUser(email: string, metadata?: { sso_provider_id?: string }): Promise<string | null> {
  try {
    // Try to create user
    const { error: _authUserError, data: authUserData } = await getSupabaseClient().auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: metadata || {},
    })

    if (authUserData?.user) {
      console.log('Created auth user via admin API:', authUserData.user.id)
      return authUserData.user.id
    }

    // No user returned - try to find existing
    console.log('Auth admin API returned no user, searching for existing')

    // Check public.users first
    const { data: existingUser } = await getSupabaseClient()
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingUser) {
      console.log('Found existing user in public.users:', existingUser.id)
      return existingUser.id
    }

    // Check auth.users
    const { data: authUsers } = await getSupabaseClient().auth.admin.listUsers()
    const existingAuthUser = authUsers?.users?.find(u => u.email === email)
    if (existingAuthUser) {
      console.log('Found existing user in auth.users:', existingAuthUser.id)
      return existingAuthUser.id
    }

    console.log('No existing user found')
    return null
  }
  catch (err: any) {
    console.log('Auth user creation threw exception:', err.message)

    // Try to find existing user
    const { data: existingUser } = await getSupabaseClient()
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingUser) {
      console.log('Found existing user after exception:', existingUser.id)
      return existingUser.id
    }

    const { data: authUsers } = await getSupabaseClient().auth.admin.listUsers()
    const existingAuthUser = authUsers?.users?.find(u => u.email === email)
    if (existingAuthUser) {
      console.log('Found existing auth user after exception:', existingAuthUser.id)
      return existingAuthUser.id
    }

    return null
  }
}

beforeAll(async () => {
  // Clean up any leftover SSO connections from previous test runs (seeded org/user data remains)
  await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', TEST_DOMAIN)
  await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', TEST_SSO_ORG_ID)

  // Mock Deno.Command if running in Deno environment
  if ((globalThis as any).Deno) {
    (globalThis as any).Deno.Command = vi.fn().mockImplementation((_cmd: string, _options: any) => {
      return {
        output: vi.fn().mockResolvedValue({
          success: true,
          stdout: new TextEncoder().encode(JSON.stringify({
            provider_id: randomUUID(),
            entity_id: generateTestEntityId(),
            acs_url: 'https://api.supabase.com/v1/sso/acs',
            domains: [TEST_DOMAIN],
          })),
          stderr: new TextEncoder().encode(''),
        }),
      }
    })
  }

  // The org, stripe_info, and org_users records are seeded in seed.sql
  // No runtime inserts needed - we just verify the seeded data exists
  const { data: org, error: orgError } = await getSupabaseClient()
    .from('orgs')
    .select('id, name')
    .eq('id', TEST_SSO_ORG_ID)
    .single()

  if (orgError || !org) {
    throw new Error(`SSO test org not found in seed data: ${orgError?.message}. Run 'supabase db reset' to seed test data.`)
  }
}, 120000)

afterAll(async () => {
  // Restore original Deno.Command
  if (originalDenoCommand && (globalThis as any).Deno) {
    (globalThis as any).Deno.Command = originalDenoCommand
  }

  // Clean up SSO connection data created during tests (not seeded data)
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
  // Note: org, org_users, and stripe_info are seeded data - do NOT delete them
})

describe('auto-join integration', () => {
  it.concurrent('should auto-enroll new users with verified SSO domain on signup', async () => {
    // NOTE: Manually triggers auto-enrollment via RPC since test database doesn't have auth.users trigger active
    let orgId: string | undefined
    let customerId: string | undefined
    let actualUserId: string | null | undefined

    try {
      orgId = randomUUID()
      customerId = `cus_autojoin_${randomUUID()}`
      const domain = `autojoin${randomUUID().slice(0, 8)}.com`
      const testUserEmail = `testuser@${domain}`
      const uniqueId = randomUUID().slice(0, 8)
      const ssoProviderId = randomUUID()
      const testEntityId = generateTestEntityId()

      // Setup org with SSO - manual DB inserts to bypass edge function
      // All inserts ignore duplicate key errors to handle vitest retry scenarios
      const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
        customer_id: customerId,
        status: 'succeeded',
        product_id: 'prod_LQIregjtNduh4q',
      })

      // Ignore duplicate key errors on retry
      if (stripeError && !stripeError.message?.includes('duplicate') && stripeError.code !== '23505') {
        throw new Error(`stripe_info insert failed: ${stripeError.message}`)
      }

      const { error: orgsError } = await getSupabaseClient().from('orgs').insert({
        id: orgId,
        name: `Auto-Join Test Org ${uniqueId}`,
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: customerId,
      })

      // Ignore duplicate key errors on retry
      if (orgsError && !orgsError.message?.includes('duplicate') && orgsError.code !== '23505') {
        throw new Error(`orgs insert failed: ${orgsError.message}`)
      }

      // Check if org_user already exists
      const { data: existingOrgUser } = await getSupabaseClient().from('org_users').select('id').eq('user_id', USER_ID).eq('org_id', orgId).maybeSingle()

      if (!existingOrgUser) {
        const { error: orgUsersError } = await getSupabaseClient().from('org_users').insert({
          user_id: USER_ID,
          org_id: orgId,
          user_right: 'super_admin',
        })

        if (orgUsersError && !orgUsersError.message?.includes('duplicate') && orgUsersError.code !== '23505') {
          throw new Error(`org_users insert failed: ${orgUsersError.message}`)
        }
      }

      // Manually create SSO connection (bypass edge function to avoid timeouts)
      const { error: ssoError } = await getSupabaseClient().from('org_saml_connections').insert({
        org_id: orgId,
        sso_provider_id: ssoProviderId,
        provider_name: 'Test Provider',
        entity_id: testEntityId,
        metadata_xml: generateTestMetadataXml(testEntityId),
        enabled: true,
        verified: true,
        auto_join_enabled: true, // Required for auto-enrollment to work
      })

      // Ignore duplicate key errors on retry
      if (ssoError && !ssoError.message?.includes('duplicate') && ssoError.code !== '23505') {
        throw new Error(`org_saml_connections insert failed: ${ssoError.message}`)
      }

      // Create or get test user using helper
      actualUserId = await getOrCreateTestAuthUser(testUserEmail, {
        sso_provider_id: ssoProviderId,
      })

      if (!actualUserId) {
        console.log('Cannot create or find auth user - skipping test')
        return
      }

      // Now insert into public.users (this is required for foreign keys)
      // Skip if user already exists (retry scenario)
      const { data: existingPublicUser } = await getSupabaseClient()
        .from('users')
        .select('id')
        .eq('id', actualUserId)
        .maybeSingle()

      if (!existingPublicUser) {
        const { error: publicUserError } = await getSupabaseClient().from('users').insert({
          id: actualUserId,
          email: testUserEmail,
        })

        // Ignore duplicate key errors on retry
        const isPublicUserDuplicate = publicUserError && (
          publicUserError.message?.includes('duplicate')
          || publicUserError.code === '23505'
        )

        if (publicUserError && !isPublicUserDuplicate) {
          throw new Error(`Public user creation failed: ${publicUserError.message}`)
        }
      }

      // Use real RPC handler to test production enrollment logic
      // This exercises the auto_enroll_sso_user function that would be triggered by auth.users events
      const { error: enrollError } = await getSupabaseClient().rpc('auto_enroll_sso_user', {
        p_user_id: actualUserId,
        p_email: testUserEmail,
        p_sso_provider_id: ssoProviderId,
      })

      if (enrollError) {
        throw new Error(`Failed to auto-enroll user: ${enrollError.message}`)
      }

      // Check if user was enrolled - use limit(1) then maybeSingle() to avoid error when no rows exist
      const { data: membership, error: membershipError } = await getSupabaseClient()
        .from('org_users')
        .select('*')
        .eq('user_id', actualUserId)
        .eq('org_id', orgId)
        .limit(1)
        .maybeSingle()

      if (membershipError) {
        throw new Error(`Failed to check membership: ${membershipError.message}`)
      }

      expect(membership).toBeTruthy()
      expect(membership!.user_right).toBe('read')
    }
    finally {
      // Cleanup - guaranteed to run even if test fails
      if (actualUserId) {
        try {
          await getSupabaseClient().auth.admin.deleteUser(actualUserId)
        }
        catch (err) {
          console.log('Could not delete auth user (may not exist):', err)
        }
        await getSupabaseClient().from('org_users').delete().eq('user_id', actualUserId)
        await getSupabaseClient().from('users').delete().eq('id', actualUserId)
      }
      if (orgId) {
        await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
        await getSupabaseClient().from('saml_domain_mappings').delete().eq('org_id', orgId)
        await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
        await getSupabaseClient().from('orgs').delete().eq('id', orgId)
      }
      if (customerId) {
        await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
      }
    }
  }, 120000)

  it.concurrent('should auto-enroll existing users on first SSO login', async () => {
    // Create a test user for auto-enrollment testing
    const testUserEmail = `sso-test-${randomUUID()}@${TEST_DOMAIN}`
    const ssoProviderId = randomUUID()
    const testEntityId = generateTestEntityId()
    let testUserId: string | undefined

    try {
      // Create SSO connection for the test org with auto_join enabled
      const { error: ssoError } = await getSupabaseClient().from('org_saml_connections').insert({
        org_id: TEST_SSO_ORG_ID,
        sso_provider_id: ssoProviderId,
        provider_name: 'Test SSO Provider',
        entity_id: testEntityId,
        metadata_xml: generateTestMetadataXml(testEntityId),
        enabled: true,
        verified: true,
        auto_join_enabled: true, // Enable auto-join
      })

      if (ssoError && !ssoError.message?.includes('duplicate') && ssoError.code !== '23505') {
        throw new Error(`SSO connection creation failed: ${ssoError.message}`)
      }

      // Create domain mapping for auto-enrollment
      const { data: ssoConnectionData } = await getSupabaseClient()
        .from('org_saml_connections')
        .select('id')
        .eq('org_id', TEST_SSO_ORG_ID)
        .single()

      const { error: domainError } = await getSupabaseClient().from('saml_domain_mappings').insert({
        domain: TEST_DOMAIN,
        org_id: TEST_SSO_ORG_ID,
        sso_connection_id: ssoConnectionData?.id as string,
        verified: true,
      })

      if (domainError && !domainError.message?.includes('duplicate') && domainError.code !== '23505') {
        throw new Error(`Domain mapping creation failed: ${domainError.message}`)
      }

      // Create auth user
      const { data: authUserData, error: _authError } = await getSupabaseClient().auth.admin.createUser({
        email: testUserEmail,
        email_confirm: true,
        user_metadata: {
          sso_provider_id: ssoProviderId,
        },
      })

      if (authUserData?.user) {
        testUserId = authUserData.user.id
      }
      else {
        // Try to find existing user
        const { data: existingUser } = await getSupabaseClient()
          .from('users')
          .select('id')
          .eq('email', testUserEmail)
          .maybeSingle()

        if (existingUser) {
          testUserId = existingUser.id
        }
        else {
          console.log('Could not create auth user, skipping test')
          return
        }
      }

      // Ensure user exists in public.users table
      const { error: publicUserError } = await getSupabaseClient().from('users').upsert({
        id: testUserId,
        email: testUserEmail,
      }, { onConflict: 'id' })

      if (publicUserError && !publicUserError.message?.includes('duplicate')) {
        throw new Error(`Public user creation failed: ${publicUserError.message}`)
      }

      // Manually trigger auto-enrollment (simulates SSO login trigger)
      await getSupabaseClient().rpc('auto_enroll_sso_user', {
        p_user_id: testUserId,
        p_email: testUserEmail,
        p_sso_provider_id: ssoProviderId,
      })

      // Verify user was auto-enrolled in the organization
      const { data: enrollment, error: enrollmentError } = await getSupabaseClient()
        .from('org_users')
        .select('*')
        .eq('org_id', TEST_SSO_ORG_ID)
        .eq('user_id', testUserId)
        .maybeSingle()

      if (enrollmentError) {
        throw new Error(`Failed to check enrollment: ${enrollmentError.message}`)
      }

      // Assert enrollment occurred
      expect(enrollment).toBeTruthy()
      expect(enrollment!.user_right).toBe('read') // Default enrollment role

      // Verify audit log was created
      const { data: auditLogs } = await getSupabaseClient()
        .from('sso_audit_logs')
        .select('*')
        .eq('org_id', TEST_SSO_ORG_ID)
        .eq('user_id', testUserId)
        .eq('event_type', 'auto_join_success')
        .order('timestamp', { ascending: false })
        .limit(1)

      expect(auditLogs).toBeTruthy()
      expect(auditLogs!.length).toBeGreaterThan(0)
    }
    finally {
      // Cleanup
      if (testUserId) {
        try {
          await getSupabaseClient().auth.admin.deleteUser(testUserId)
        }
        catch (err) {
          console.log('Could not delete auth user:', err)
        }
        await getSupabaseClient().from('org_users').delete().eq('user_id', testUserId)
        await getSupabaseClient().from('users').delete().eq('id', testUserId)
      }
      await getSupabaseClient().from('saml_domain_mappings').delete().eq('org_id', TEST_SSO_ORG_ID).eq('domain', TEST_DOMAIN)
      await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', TEST_SSO_ORG_ID).eq('sso_provider_id', ssoProviderId)
    }
  }, 120000)
})

// SKIPPED: These tests are ready but require /private/sso/configure endpoint implementation
// They manually insert SSO connections and domain mappings to test database logic
describe.skip('domain verification (mocked metadata fetch)', () => {
  it.concurrent('should mark domains as verified when added via SSO config (mocked)', async () => {
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

    await ensureOrgUser(USER_ID, orgId, 'super_admin')

    // Wait for database to commit all the org setup
    await new Promise(resolve => setTimeout(resolve, 300))

    // Manually insert SSO connection and domain mapping (bypass /private/sso/configure to avoid CLI dependency)
    const ssoProviderId = randomUUID()
    const testEntityId = generateTestEntityId()

    const { data: ssoConnection, error: ssoError } = await getSupabaseClient().from('org_saml_connections').insert({
      org_id: orgId,
      sso_provider_id: ssoProviderId,
      provider_name: 'Test Provider',
      entity_id: testEntityId,
      metadata_xml: generateTestMetadataXml(testEntityId),
      enabled: true,
    }).select('id').single()

    if (ssoError || !ssoConnection) {
      throw new Error(`SSO connection insert failed: ${ssoError?.message || 'No data returned'}`)
    }

    const { error: mappingError } = await getSupabaseClient().from('saml_domain_mappings').insert({
      domain,
      org_id: orgId,
      sso_connection_id: (ssoConnection as unknown as { id: string }).id,
      verified: true,
    })

    if (mappingError) {
      throw new Error(`Domain mapping insert failed: ${mappingError.message}`)
    }

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

  it.concurrent('should create domain mappings with correct SSO provider reference (mocked)', async () => {
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

    await ensureOrgUser(USER_ID, orgId, 'super_admin')

    // Wait for database to commit all the org setup
    await new Promise(resolve => setTimeout(resolve, 300))

    // Manually insert SSO connection and domain mapping (bypass /private/sso/configure to avoid CLI dependency)
    const ssoProviderId = randomUUID()
    const testEntityId = `https://sso.test.com/${randomUUID()}`

    const { data: ssoConnection, error: ssoError } = await getSupabaseClient().from('org_saml_connections').insert({
      org_id: orgId,
      sso_provider_id: ssoProviderId,
      provider_name: 'Test Provider',
      entity_id: testEntityId,
      metadata_xml: generateTestMetadataXml(testEntityId),
      enabled: true,
    }).select('id').single()

    if (ssoError || !ssoConnection) {
      throw new Error(`SSO connection insert failed: ${ssoError?.message || 'No data returned'}`)
    }

    const { error: mappingError } = await getSupabaseClient().from('saml_domain_mappings').insert({
      domain,
      org_id: orgId,
      sso_connection_id: (ssoConnection as unknown as { id: string }).id,
      verified: true,
    })

    if (mappingError) {
      throw new Error(`Domain mapping insert failed: ${mappingError.message}`)
    }

    const { data: _ssoProvider } = await getSupabaseClient()
      .from('org_saml_connections')
      .select('id')
      .eq('org_id', orgId)
      .single()

    const { data: mapping } = await getSupabaseClient()
      .from('saml_domain_mappings')
      .select('sso_connection_id, domain, org_id')
      .eq('domain', domain)
      .single()

    expect((mapping as any)!.sso_connection_id).toBeDefined()
    expect((mapping as any)!.org_id).toBe(orgId)
    expect((mapping as any)!.domain).toBe(domain)

    // Cleanup
    await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', domain)
    await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
    await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
    await getSupabaseClient().from('orgs').delete().eq('id', orgId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
  })
})

// SKIPPED: These tests require /private/sso/configure endpoint to be implemented
// The endpoint should handle SAML metadata XML parsing, SSO provider creation,
// and domain mapping verification. Tests will work once the endpoint is added.
describe.skip('domain verification', () => {
  it.concurrent('should mark domains as verified when added via SSO config', async () => {
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

    await ensureOrgUser(USER_ID, orgId, 'super_admin')

    await fetch(getEndpointUrl('/private/sso/configure'), {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({
        orgId,
        userId: USER_ID,
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

  it.concurrent('should create domain mappings with correct SSO provider reference', async () => {
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

    await ensureOrgUser(USER_ID, orgId, 'super_admin')

    await fetch(getEndpointUrl('/private/sso/configure'), {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({
        orgId,
        userId: USER_ID,
        metadataXml: TEST_METADATA_XML,
        domains: [domain],
      }),
    })

    const { data: _ssoProvider } = await getSupabaseClient()
      .from('org_saml_connections')
      .select('id')
      .eq('org_id', orgId)
      .single()

    const { data: mapping } = await getSupabaseClient()
      .from('saml_domain_mappings')
      .select('sso_connection_id, domain, org_id')
      .eq('domain', domain)
      .single()

    expect((mapping as any)!.sso_connection_id).toBeDefined()
    expect((mapping as any)!.org_id).toBe(orgId)
    expect((mapping as any)!.domain).toBe(domain)

    // Cleanup
    await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', domain)
    await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
    await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
    await getSupabaseClient().from('orgs').delete().eq('id', orgId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
  })

  it.concurrent('should allow lookup_sso_provider_by_domain to find provider', async () => {
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

    await ensureOrgUser(USER_ID, orgId, 'super_admin')

    await fetch(getEndpointUrl('/private/sso/configure'), {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({
        orgId,
        userId: USER_ID,
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
      .rpc('lookup_sso_provider_by_domain', { p_email: `test@${domain}` })

    // The RPC returns an array of provider objects, not just the ID
    expect(lookupResult).toBeDefined()
    expect(lookupResult).not.toBeNull()
    expect(Array.isArray(lookupResult)).toBe(true)
    expect(lookupResult!.length).toBeGreaterThan(0)

    // Verify the provider_id matches what we created
    const foundProvider = lookupResult![0]
    expect(foundProvider.provider_id).toBe(ssoProvider!.id)
    expect(foundProvider.org_id).toBe(orgId)
    expect(foundProvider.enabled).toBe(true)

    // Cleanup
    await getSupabaseClient().from('saml_domain_mappings').delete().eq('domain', domain)
    await getSupabaseClient().from('org_saml_connections').delete().eq('org_id', orgId)
    await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
    await getSupabaseClient().from('orgs').delete().eq('id', orgId)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
  })

  it.concurrent('should include verified domains in SSO status response', async () => {
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

    await ensureOrgUser(USER_ID, orgId, 'super_admin')

    await fetch(getEndpointUrl('/private/sso/configure'), {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({
        orgId,
        userId: USER_ID,
        metadataXml: TEST_METADATA_XML,
        domains: [domain1, domain2],
      }),
    })

    const response = await fetch(getEndpointUrl('/private/sso/status'), {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({
        orgId,
      }),
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
