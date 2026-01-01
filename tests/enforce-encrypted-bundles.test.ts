import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.encrypted.bundles.${id}`
let testOrgId: string
let customerId: string

beforeAll(async () => {
  testOrgId = randomUUID()
  customerId = `cus_test_encrypted_${testOrgId}`

  // Create stripe_info for this test org (required for org creation)
  const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
    customer_id: customerId,
    status: 'succeeded',
    product_id: 'prod_LQIregjtNduh4q',
    subscription_id: `sub_${id}`,
    trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    is_good_plan: true,
  })
  if (stripeError)
    throw stripeError

  // Create test organization with enforce_encrypted_bundles = false (default)
  const { error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: testOrgId,
    name: `Test Encrypted Bundles Org ${id}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
    customer_id: customerId,
    enforce_encrypted_bundles: false,
  })

  if (orgError)
    throw orgError

  // Add user as member of the org so API key works
  const { error: memberError } = await getSupabaseClient().from('org_users').insert({
    org_id: testOrgId,
    user_id: USER_ID,
    user_right: 'super_admin',
  })
  if (memberError)
    throw memberError

  // Create test app
  const { error: appError } = await getSupabaseClient().from('apps').insert({
    app_id: APPNAME,
    name: `Test Encrypted Bundles App`,
    icon_url: 'https://example.com/icon.png',
    owner_org: testOrgId,
  })
  if (appError)
    throw appError
})

afterAll(async () => {
  // Clean up in reverse order of dependencies
  await getSupabaseClient().from('app_versions').delete().eq('app_id', APPNAME)
  await getSupabaseClient().from('apps').delete().eq('app_id', APPNAME)
  await getSupabaseClient().from('org_users').delete().eq('org_id', testOrgId)
  await getSupabaseClient().from('orgs').delete().eq('id', testOrgId)
  await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
})

describe('[Encrypted Bundles Enforcement]', () => {
  describe('Org Setting Management', () => {
    it('should have enforce_encrypted_bundles = false by default', async () => {
      const { data, error } = await getSupabaseClient()
        .from('orgs')
        .select('enforce_encrypted_bundles')
        .eq('id', testOrgId)
        .single()

      expect(error).toBeNull()
      expect(data?.enforce_encrypted_bundles).toBe(false)
    })

    it('should allow updating enforce_encrypted_bundles setting', async () => {
      // Enable enforcement
      const { error: updateError } = await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', testOrgId)

      expect(updateError).toBeNull()

      // Verify it was updated
      const { data, error } = await getSupabaseClient()
        .from('orgs')
        .select('enforce_encrypted_bundles')
        .eq('id', testOrgId)
        .single()

      expect(error).toBeNull()
      expect(data?.enforce_encrypted_bundles).toBe(true)

      // Reset back to false for other tests
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)
    })
  })

  describe('Bundle Creation without Encryption Enforcement', () => {
    it('should allow unencrypted bundle when enforcement is disabled', async () => {
      // Ensure enforcement is disabled
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)

      const response = await fetch(`${BASE_URL}/bundle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME,
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          version: '1.0.0-unencrypted-allowed',
          external_url: 'https://github.com/Cap-go/capgo/archive/refs/tags/v12.12.32.zip',
          // No session_key - unencrypted bundle
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { status: string, bundle: any }
      expect(data.status).toBe('success')
      expect(data.bundle.name).toBe('1.0.0-unencrypted-allowed')
    })

    it('should allow encrypted bundle when enforcement is disabled', async () => {
      // Ensure enforcement is disabled
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)

      const response = await fetch(`${BASE_URL}/bundle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME,
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          version: '1.0.0-encrypted-no-enforcement',
          external_url: 'https://github.com/Cap-go/capgo/archive/refs/tags/v12.12.32.zip',
          session_key: 'some-session-key-data',
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { status: string, bundle: any }
      expect(data.status).toBe('success')
      expect(data.bundle.name).toBe('1.0.0-encrypted-no-enforcement')
    })
  })

  describe('Bundle Creation with Encryption Enforcement', () => {
    beforeAll(async () => {
      // Enable enforcement for these tests
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', testOrgId)
    })

    afterAll(async () => {
      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)
    })

    it('should reject unencrypted bundle when enforcement is enabled', async () => {
      const response = await fetch(`${BASE_URL}/bundle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME,
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          version: '1.0.0-unencrypted-rejected',
          external_url: 'https://github.com/Cap-go/capgo/archive/refs/tags/v12.12.32.zip',
          // No session_key - should be rejected
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json() as { error: string, message: string }
      expect(data.error).toBe('encryption_required')
      expect(data.message).toContain('encrypted')
    })

    it('should reject bundle with empty session_key when enforcement is enabled', async () => {
      const response = await fetch(`${BASE_URL}/bundle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME,
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          version: '1.0.0-empty-session-key',
          external_url: 'https://github.com/Cap-go/capgo/archive/refs/tags/v12.12.32.zip',
          session_key: '', // Empty session_key - should be rejected
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json() as { error: string, message: string }
      expect(data.error).toBe('encryption_required')
    })

    it('should allow encrypted bundle when enforcement is enabled', async () => {
      const response = await fetch(`${BASE_URL}/bundle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME,
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          version: '1.0.0-encrypted-allowed',
          external_url: 'https://github.com/Cap-go/capgo/archive/refs/tags/v12.12.32.zip',
          session_key: 'iv:encrypted-session-key-data',
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { status: string, bundle: any }
      expect(data.status).toBe('success')
      expect(data.bundle.name).toBe('1.0.0-encrypted-allowed')
      expect(data.bundle.session_key).toBe('iv:encrypted-session-key-data')
    })
  })

  describe('Database Trigger Enforcement', () => {
    it('should reject direct insert of unencrypted bundle via trigger', async () => {
      // Enable enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', testOrgId)

      // Try to insert directly via Supabase SDK (bypassing API)
      const { error } = await getSupabaseClient()
        .from('app_versions')
        .insert({
          app_id: APPNAME,
          name: '1.0.0-direct-insert-rejected',
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          owner_org: testOrgId,
          storage_provider: 'r2',
          // No session_key - should be rejected by trigger
        })

      expect(error).not.toBeNull()
      expect(error?.message).toContain('encryption_required')

      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)
    })

    it('should allow direct insert of encrypted bundle via trigger', async () => {
      // Enable enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', testOrgId)

      // Try to insert directly via Supabase SDK with session_key
      const { data, error } = await getSupabaseClient()
        .from('app_versions')
        .insert({
          app_id: APPNAME,
          name: '1.0.0-direct-insert-allowed',
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          owner_org: testOrgId,
          storage_provider: 'r2',
          session_key: 'encrypted-session-key-for-direct-insert',
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(data?.name).toBe('1.0.0-direct-insert-allowed')
      expect(data?.session_key).toBe('encrypted-session-key-for-direct-insert')

      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)
    })

    it('should allow direct insert when enforcement is disabled', async () => {
      // Ensure enforcement is disabled
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)

      // Try to insert directly via Supabase SDK without session_key
      const { data, error } = await getSupabaseClient()
        .from('app_versions')
        .insert({
          app_id: APPNAME,
          name: '1.0.0-direct-no-enforcement',
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          owner_org: testOrgId,
          storage_provider: 'r2',
          // No session_key - should be allowed since enforcement is disabled
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(data?.name).toBe('1.0.0-direct-no-enforcement')
    })
  })

  describe('Helper Functions', () => {
    it('is_bundle_encrypted should return false for null session_key', async () => {
      const { data, error } = await getSupabaseClient()
        .rpc('is_bundle_encrypted', { session_key: null as unknown as string })

      expect(error).toBeNull()
      expect(data).toBe(false)
    })

    it('is_bundle_encrypted should return false for empty session_key', async () => {
      const { data, error } = await getSupabaseClient()
        .rpc('is_bundle_encrypted', { session_key: '' })

      expect(error).toBeNull()
      expect(data).toBe(false)
    })

    it('is_bundle_encrypted should return true for non-empty session_key', async () => {
      const { data, error } = await getSupabaseClient()
        .rpc('is_bundle_encrypted', { session_key: 'some-encrypted-data' })

      expect(error).toBeNull()
      expect(data).toBe(true)
    })

    it('check_org_encrypted_bundle_enforcement should allow when enforcement is disabled', async () => {
      // Ensure enforcement is disabled
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)

      const { data, error } = await getSupabaseClient()
        .rpc('check_org_encrypted_bundle_enforcement', {
          org_id: testOrgId,
          session_key: null as unknown as string,
        })

      expect(error).toBeNull()
      expect(data).toBe(true) // Should allow
    })

    it('check_org_encrypted_bundle_enforcement should reject unencrypted when enforcement is enabled', async () => {
      // Enable enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', testOrgId)

      const { data, error } = await getSupabaseClient()
        .rpc('check_org_encrypted_bundle_enforcement', {
          org_id: testOrgId,
          session_key: null as unknown as string,
        })

      expect(error).toBeNull()
      expect(data).toBe(false) // Should reject

      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)
    })

    it('check_org_encrypted_bundle_enforcement should allow encrypted when enforcement is enabled', async () => {
      // Enable enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', testOrgId)

      const { data, error } = await getSupabaseClient()
        .rpc('check_org_encrypted_bundle_enforcement', {
          org_id: testOrgId,
          session_key: 'some-encrypted-data',
        })

      expect(error).toBeNull()
      expect(data).toBe(true) // Should allow

      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', testOrgId)
    })
  })

  describe('get_orgs_v7 includes enforce_encrypted_bundles', () => {
    it('should include enforce_encrypted_bundles in get_orgs_v7 response', async () => {
      // Use the version with userid parameter for service role calls
      const { data, error } = await getSupabaseClient()
        .rpc('get_orgs_v7', { userid: USER_ID })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(Array.isArray(data)).toBe(true)

      // Find our test org
      const testOrg = data!.find((org: any) => org.gid === testOrgId)
      expect(testOrg).toBeDefined()
      expect(testOrg!.enforce_encrypted_bundles).toBeDefined()
      expect(typeof testOrg!.enforce_encrypted_bundles).toBe('boolean')
    })
  })
})
