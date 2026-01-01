import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, USER_ADMIN_EMAIL, USER_ID } from './test-utils.ts'

const TEST_DOMAIN = 'autojointest.com'
const TEST_ORG_ID = randomUUID()
const TEST_ORG_NAME = `Auto-Join Test Org ${randomUUID()}`
const TEST_CUSTOMER_ID = `cus_autojoin_${randomUUID()}`

beforeAll(async () => {
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

    // Create test org with allowed email domain
    const { error } = await getSupabaseClient().from('orgs').insert({
        id: TEST_ORG_ID,
        name: TEST_ORG_NAME,
        management_email: USER_ADMIN_EMAIL,
        created_by: USER_ID,
        customer_id: TEST_CUSTOMER_ID,
        allowed_email_domains: [TEST_DOMAIN],
    })
    if (error)
        throw error
})

afterAll(async () => {
    // Clean up test organization and stripe_info
    await getSupabaseClient().from('orgs').delete().eq('id', TEST_ORG_ID)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', TEST_CUSTOMER_ID)
})

describe('Organization Email Domain Auto-Join', () => {
    describe('[GET] /organization/domains', () => {
        it('should get allowed email domains for an org', async () => {
            const response = await fetch(`${BASE_URL}/organization/domains?orgId=${TEST_ORG_ID}`, {
                headers,
            })
            expect(response.status).toBe(200)
            const data = await response.json() as any
            expect(data.status).toBe('ok')
            expect(data.orgId).toBe(TEST_ORG_ID)
            expect(data.allowed_email_domains).toEqual([TEST_DOMAIN])
        })

        it('should return empty array for org with no allowed domains', async () => {
            const emptyOrgId = randomUUID()
            const emptyCustomerId = `cus_empty_${randomUUID()}`

            // Create stripe_info
            await getSupabaseClient().from('stripe_info').insert({
                customer_id: emptyCustomerId,
                status: 'succeeded',
                product_id: 'prod_LQIregjtNduh4q',
                trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
                is_good_plan: true,
            })

            // Create org without domains
            await getSupabaseClient().from('orgs').insert({
                id: emptyOrgId,
                name: `Empty Domains Org`,
                management_email: USER_ADMIN_EMAIL,
                created_by: USER_ID,
                customer_id: emptyCustomerId,
                allowed_email_domains: [],
            })

            const response = await fetch(`${BASE_URL}/organization/domains?orgId=${emptyOrgId}`, {
                headers,
            })
            expect(response.status).toBe(200)
            const data = await response.json() as any
            expect(data.allowed_email_domains).toEqual([])

            // Cleanup
            await getSupabaseClient().from('orgs').delete().eq('id', emptyOrgId)
            await getSupabaseClient().from('stripe_info').delete().eq('customer_id', emptyCustomerId)
        })

        it('should reject request without org membership', async () => {
            // Create an org where the test user is NOT a member
            const unauthorizedOrgId = randomUUID()
            const unauthorizedCustomerId = `cus_unauthorized_${randomUUID()}`

            // Create stripe_info
            await getSupabaseClient().from('stripe_info').insert({
                customer_id: unauthorizedCustomerId,
                status: 'succeeded',
                product_id: 'prod_LQIregjtNduh4q',
            })

            // Create org owned by a different user (USER_ID_2)
            await getSupabaseClient().from('orgs').insert({
                id: unauthorizedOrgId,
                name: `Unauthorized Org ${randomUUID()}`,
                management_email: 'other@example.com',
                created_by: '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', // USER_ID_2 - different from test user
                customer_id: unauthorizedCustomerId,
                allowed_email_domains: ['unauthorized.com'],
            })

            // Try to access org domains without membership
            const response = await fetch(`${BASE_URL}/organization/domains?orgId=${unauthorizedOrgId}`, {
                headers,
            })

            expect(response.status).toBe(400)
            const data = await response.json() as any
            expect(data.error).toBe('cannot_access_organization')

            // Cleanup
            await getSupabaseClient().from('orgs').delete().eq('id', unauthorizedOrgId)
            await getSupabaseClient().from('stripe_info').delete().eq('customer_id', unauthorizedCustomerId)
        })
    })

    describe('[PUT] /organization/domains', () => {
        it('should update allowed email domains', async () => {
            const newDomains = ['newdomain.com', 'another.org']
            const response = await fetch(`${BASE_URL}/organization/domains`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    orgId: TEST_ORG_ID,
                    domains: newDomains,
                    enabled: true,
                }),
            })

            expect(response.status).toBe(200)
            const data = await response.json() as any
            expect(data.status).toBe('Organization allowed email domains updated')
            expect(data.orgId).toBe(TEST_ORG_ID)
            expect(data.allowed_email_domains).toEqual(newDomains)

            // Verify the update persisted
            const { data: orgData } = await getSupabaseClient()
                .from('orgs')
                .select('allowed_email_domains')
                .eq('id', TEST_ORG_ID)
                .single()
            expect(orgData?.allowed_email_domains).toEqual(newDomains)
        })

        it('should normalize domains (lowercase, trim, remove @)', async () => {
            const unnormalizedDomains = ['  UPPERCASE.COM  ', '@prefixed.org', '  MixedCase.net']
            const expectedDomains = ['uppercase.com', 'prefixed.org', 'mixedcase.net']

            const response = await fetch(`${BASE_URL}/organization/domains`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    orgId: TEST_ORG_ID,
                    domains: unnormalizedDomains,
                }),
            })

            expect(response.status).toBe(200)
            const data = await response.json() as any
            expect(data.allowed_email_domains).toEqual(expectedDomains)
        })

        it('should reject invalid domains', async () => {
            const invalidDomains = ['nodot', 'a']

            for (const invalidDomain of invalidDomains) {
                const response = await fetch(`${BASE_URL}/organization/domains`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        orgId: TEST_ORG_ID,
                        domains: [invalidDomain],
                        enabled: true,
                    }),
                })

                expect(response.status).toBe(400)
                const data = await response.json() as any
                expect(data.error).toBe('invalid_domain')
            }
        })

        it('should reject blocked public email domains', async () => {
            const blockedDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'tempmail.com']

            for (const blockedDomain of blockedDomains) {
                const response = await fetch(`${BASE_URL}/organization/domains`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        orgId: TEST_ORG_ID,
                        domains: [blockedDomain],
                        enabled: true,
                    }),
                })

                expect(response.status).toBe(400)
                const data = await response.json() as any
                expect(data.error).toBe('blocked_domain')
                expect(data.message).toContain('public email provider')
            }
        })

        it('should clear domains with empty array', async () => {
            const response = await fetch(`${BASE_URL}/organization/domains`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    orgId: TEST_ORG_ID,
                    domains: [],
                    enabled: false,
                }),
            })

            expect(response.status).toBe(200)
            const data = await response.json() as any
            expect(data.allowed_email_domains).toEqual([])
        })

        it('should reject request from non-admin user', async () => {
            // Create an org and add test user as 'read' member (not admin)
            const readOnlyOrgId = randomUUID()
            const readOnlyCustomerId = `cus_readonly_${randomUUID()}`

            // Create stripe_info
            await getSupabaseClient().from('stripe_info').insert({
                customer_id: readOnlyCustomerId,
                status: 'succeeded',
                product_id: 'prod_LQIregjtNduh4q',
            })

            // Create org owned by a different user
            await getSupabaseClient().from('orgs').insert({
                id: readOnlyOrgId,
                name: `ReadOnly Org ${randomUUID()}`,
                management_email: 'readonly@example.com',
                created_by: '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', // USER_ID_2
                customer_id: readOnlyCustomerId,
                allowed_email_domains: ['readonly.com'],
            })

            // Add test user as 'read' member (not admin)
            await getSupabaseClient().from('org_users').insert({
                org_id: readOnlyOrgId,
                user_id: USER_ID, // Test user
                user_right: 'read', // Not admin or super_admin
                app_id: null,
                channel_id: null,
            })

            // Try to update domains with read-only permission
            const response = await fetch(`${BASE_URL}/organization/domains`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    orgId: readOnlyOrgId,
                    domains: ['newdomain.com'],
                    enabled: true,
                }),
            })

            expect(response.status).toBe(400)
            const data = await response.json() as any
            expect(data.error).toBe('cannot_access_organization')
            expect(data.message).toContain('admin rights')

            // Cleanup
            await getSupabaseClient().from('org_users').delete().eq('org_id', readOnlyOrgId).eq('user_id', USER_ID)
            await getSupabaseClient().from('orgs').delete().eq('id', readOnlyOrgId)
            await getSupabaseClient().from('stripe_info').delete().eq('customer_id', readOnlyCustomerId)
        })
    })

    describe('SSO Domain Uniqueness', () => {
        it('should allow same domain for multiple non-SSO orgs', async () => {
            const secondOrgId = randomUUID()
            const secondCustomerId = `cus_sso_test_${randomUUID()}`
            const sharedDomain = 'shared-company.com'

            // Create second org
            await getSupabaseClient().from('stripe_info').insert({
                customer_id: secondCustomerId,
                status: 'succeeded',
                product_id: 'prod_LQIregjtNduh4q',
                trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
                is_good_plan: true,
            })

            await getSupabaseClient().from('orgs').insert({
                id: secondOrgId,
                name: 'Second Test Org',
                management_email: USER_ADMIN_EMAIL,
                created_by: USER_ID,
                customer_id: secondCustomerId,
                allowed_email_domains: [],
            })

            // Both orgs should be able to use the same domain when SSO is not enabled
            await getSupabaseClient()
                .from('orgs')
                .update({ allowed_email_domains: [sharedDomain] })
                .eq('id', TEST_ORG_ID)

            const { error } = await getSupabaseClient()
                .from('orgs')
                .update({ allowed_email_domains: [sharedDomain] })
                .eq('id', secondOrgId)

            expect(error).toBeNull()

            // Cleanup
            await getSupabaseClient().from('orgs').delete().eq('id', secondOrgId)
            await getSupabaseClient().from('stripe_info').delete().eq('customer_id', secondCustomerId)
        })

        it('should prevent SSO domain conflicts', async () => {
            const secondOrgId = randomUUID()
            const secondCustomerId = `cus_sso_conflict_${randomUUID()}`
            const exclusiveDomain = 'exclusive-sso.com'

            // Create second org
            await getSupabaseClient().from('stripe_info').insert({
                customer_id: secondCustomerId,
                status: 'succeeded',
                product_id: 'prod_LQIregjtNduh4q',
                trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
                is_good_plan: true,
            })

            await getSupabaseClient().from('orgs').insert({
                id: secondOrgId,
                name: 'SSO Conflict Test Org',
                management_email: USER_ADMIN_EMAIL,
                created_by: USER_ID,
                customer_id: secondCustomerId,
                allowed_email_domains: [],
            })

            // Enable SSO and set domain on first org
            await getSupabaseClient()
                .from('orgs')
                .update({
                    allowed_email_domains: [exclusiveDomain],
                    sso_enabled: true,
                })
                .eq('id', TEST_ORG_ID)

            // Try to claim the same domain with SSO on second org (should fail)
            const { error } = await getSupabaseClient()
                .from('orgs')
                .update({
                    allowed_email_domains: [exclusiveDomain],
                    sso_enabled: true,
                })
                .eq('id', secondOrgId)

            expect(error).not.toBeNull()
            expect(error?.message).toContain('already claimed')

            // Cleanup
            await getSupabaseClient()
                .from('orgs')
                .update({ allowed_email_domains: [], sso_enabled: false })
                .eq('id', TEST_ORG_ID)
            await getSupabaseClient().from('orgs').delete().eq('id', secondOrgId)
            await getSupabaseClient().from('stripe_info').delete().eq('customer_id', secondCustomerId)
        })
    })

    describe('Auto-Join Functionality', () => {
        it('should auto-join user to org on signup with matching email domain', async () => {
            const testEmail = `testuser@${TEST_DOMAIN}`

            // Set org to have test domain
            await getSupabaseClient()
                .from('orgs')
                .update({ allowed_email_domains: [TEST_DOMAIN], sso_enabled: true })
                .eq('id', TEST_ORG_ID)

            // Create user in auth.users first (required for foreign key)
            const { data: authUser, error: authError } = await getSupabaseClient().auth.admin.createUser({
                email: testEmail,
                email_confirm: true,
                user_metadata: {
                    first_name: 'Test',
                    last_name: 'User',
                },
            })

            expect(authError).toBeNull()
            expect(authUser?.user?.id).toBeDefined()

            // Create user in public.users table with the auth user's ID
            const { error: userError } = await getSupabaseClient()
                .from('users')
                .insert({
                    id: authUser!.user!.id,
                    email: testEmail,
                    first_name: 'Test',
                    last_name: 'User',
                })

            expect(userError).toBeNull()

            // Wait a moment for trigger to execute
            await new Promise(resolve => setTimeout(resolve, 500))

            // Check if user was auto-added to org
            const { data: membership } = await getSupabaseClient()
                .from('org_users')
                .select('*')
                .eq('user_id', authUser!.user!.id)
                .eq('org_id', TEST_ORG_ID)
                .single()

            expect(membership).not.toBeNull()
            expect(membership?.user_right).toBe('read')

            // Cleanup
            await getSupabaseClient().from('org_users').delete().eq('user_id', authUser!.user!.id)
            await getSupabaseClient().from('users').delete().eq('id', authUser!.user!.id)
            await getSupabaseClient().auth.admin.deleteUser(authUser!.user!.id)
        })

        it('should NOT auto-join user with non-matching domain', async () => {
            const testEmail = `testuser@otherdomain.com`

            // Create user in auth.users first
            const { data: authUser, error: authError } = await getSupabaseClient().auth.admin.createUser({
                email: testEmail,
                email_confirm: true,
                user_metadata: {
                    first_name: 'Test',
                    last_name: 'User',
                },
            })

            expect(authError).toBeNull()

            // Create user in public.users with non-matching domain
            const { error: userError } = await getSupabaseClient()
                .from('users')
                .insert({
                    id: authUser!.user!.id,
                    email: testEmail,
                    first_name: 'Test',
                    last_name: 'User',
                })

            expect(userError).toBeNull()

            // Wait a moment for trigger (if it runs)
            await new Promise(resolve => setTimeout(resolve, 500))

            // Check that user was NOT added to test org
            const { data: membership } = await getSupabaseClient()
                .from('org_users')
                .select('*')
                .eq('user_id', authUser!.user!.id)
                .eq('org_id', TEST_ORG_ID)
                .maybeSingle()

            expect(membership).toBeNull()

            // Cleanup
            await getSupabaseClient().from('users').delete().eq('id', authUser!.user!.id)
            await getSupabaseClient().auth.admin.deleteUser(authUser!.user!.id)
        })

        it('should auto-join user to single org with matching domain when SSO enabled', async () => {
            const testDomain = 'test-single-join.com'
            const testEmail = `testuser-${randomUUID().slice(0, 8)}@${testDomain}`

            // Update first org to have test domain with SSO enabled
            await getSupabaseClient()
                .from('orgs')
                .update({ allowed_email_domains: [testDomain], sso_enabled: true })
                .eq('id', TEST_ORG_ID)

            // Create auth user
            const { data: authUser, error: authError } = await getSupabaseClient().auth.admin.createUser({
                email: testEmail,
                email_confirm: true,
                user_metadata: {
                    first_name: 'Test',
                    last_name: 'User',
                },
            })

            expect(authError).toBeNull()

            // Create user in public.users
            await getSupabaseClient()
                .from('users')
                .insert({
                    id: authUser!.user!.id,
                    email: testEmail,
                    first_name: 'Test',
                    last_name: 'User',
                })

            // Wait for trigger
            await new Promise(resolve => setTimeout(resolve, 500))

            // Check membership
            const { data: memberships } = await getSupabaseClient()
                .from('org_users')
                .select('*')
                .eq('user_id', authUser!.user!.id)
                .eq('org_id', TEST_ORG_ID)

            expect(memberships).not.toBeNull()
            expect(memberships?.length).toBe(1)

            // Cleanup
            await getSupabaseClient().from('org_users').delete().eq('user_id', authUser!.user!.id)
            await getSupabaseClient().from('users').delete().eq('id', authUser!.user!.id)
            await getSupabaseClient().auth.admin.deleteUser(authUser!.user!.id)
        })

        it('should NOT duplicate membership if user already belongs to org', async () => {
            const testEmail = `existing${Date.now()}@${TEST_DOMAIN}`

            // Set org to have test domain
            await getSupabaseClient()
                .from('orgs')
                .update({ allowed_email_domains: [TEST_DOMAIN], sso_enabled: true })
                .eq('id', TEST_ORG_ID)

            // Create auth user first
            const { data: authUser, error: authError } = await getSupabaseClient().auth.admin.createUser({
                email: testEmail,
                email_confirm: true,
                user_metadata: {
                    first_name: 'Existing',
                    last_name: 'User',
                },
            })

            expect(authError).toBeNull()

            // Create user in public.users
            await getSupabaseClient()
                .from('users')
                .insert({
                    id: authUser!.user!.id,
                    email: testEmail,
                    first_name: 'Existing',
                    last_name: 'User',
                })

            // Wait for auto-join trigger to add user
            await new Promise(resolve => setTimeout(resolve, 500))

            // Now update the permission to admin
            await getSupabaseClient()
                .from('org_users')
                .update({ user_right: 'admin' })
                .eq('user_id', authUser!.user!.id)
                .eq('org_id', TEST_ORG_ID)

            // Try to manually insert another membership (should fail with unique constraint)
            const { error: duplicateError } = await getSupabaseClient()
                .from('org_users')
                .insert({
                    user_id: authUser!.user!.id,
                    org_id: TEST_ORG_ID,
                    user_right: 'read',
                })

            expect(duplicateError).not.toBeNull() // Unique constraint violation
            expect(duplicateError?.code).toBe('23505')

            // Check that there's still only one membership with admin rights (not overwritten)
            const { data: memberships, count } = await getSupabaseClient()
                .from('org_users')
                .select('*', { count: 'exact' })
                .eq('user_id', authUser!.user!.id)
                .eq('org_id', TEST_ORG_ID)

            expect(count).toBe(1)
            expect(memberships?.[0].user_right).toBe('admin') // Permission NOT overwritten

            // Cleanup
            await getSupabaseClient().from('org_users').delete().eq('user_id', authUser!.user!.id)
            await getSupabaseClient().from('users').delete().eq('id', authUser!.user!.id)
            await getSupabaseClient().auth.admin.deleteUser(authUser!.user!.id)
        })
    })

    describe('Database Functions', () => {
        it('extract_email_domain should extract domain correctly', async () => {
            const { data, error } = await getSupabaseClient()
                .rpc('extract_email_domain', { email: 'test@example.com' })

            expect(error).toBeNull()
            expect(data).toBe('example.com')
        })

        it('extract_email_domain should handle uppercase', async () => {
            const { data } = await getSupabaseClient()
                .rpc('extract_email_domain', { email: 'TEST@EXAMPLE.COM' })

            expect(data).toBe('example.com')
        })

        it('find_orgs_by_email_domain should find matching orgs', async () => {
            // Ensure test org has the domain and is enabled
            await getSupabaseClient()
                .from('orgs')
                .update({ allowed_email_domains: [TEST_DOMAIN], sso_enabled: true })
                .eq('id', TEST_ORG_ID)

            const { data, error } = await getSupabaseClient()
                .rpc('find_orgs_by_email_domain', { user_email: `test@${TEST_DOMAIN}` })

            expect(error).toBeNull()
            expect(data).not.toBeNull()
            expect(Array.isArray(data)).toBe(true)
            const matchingOrg = data?.find((org: any) => org.org_id === TEST_ORG_ID)
            expect(matchingOrg).toBeDefined()
            expect(matchingOrg?.org_name).toBe(TEST_ORG_NAME)
        })

        it('find_orgs_by_email_domain should return empty for non-matching domain', async () => {
            const { data, error } = await getSupabaseClient()
                .rpc('find_orgs_by_email_domain', { user_email: 'test@nonexistent-domain-12345.com' })

            expect(error).toBeNull()
            expect(Array.isArray(data)).toBe(true)
            expect(data?.length).toBe(0)
        })
    })
})
