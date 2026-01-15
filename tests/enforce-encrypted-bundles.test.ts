import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APIKEY_ENCRYPTED, APP_NAME_ENCRYPTED, getEndpointUrl, getSupabaseClient, ORG_ID_ENCRYPTED, USER_ID_ENCRYPTED } from './test-utils.ts'

// This test file uses ISOLATED test data seeded in seed.sql:
// - USER_ID_ENCRYPTED: f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193
// - ORG_ID_ENCRYPTED: a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9ca4
// - APIKEY_ENCRYPTED: b8c9d0e1-f2a3-4b4c-9d5e-6f7a8b9c0d14
// - APP_NAME_ENCRYPTED: com.encrypted.app
// This ensures test isolation and prevents interference with parallel tests.

const headersEncrypted = {
  'Content-Type': 'application/json',
  'Authorization': APIKEY_ENCRYPTED,
}

beforeAll(async () => {
  // Ensure enforcement is disabled at the start of tests
  await getSupabaseClient()
    .from('orgs')
    .update({ enforce_encrypted_bundles: false })
    .eq('id', ORG_ID_ENCRYPTED)

  // Clean up any test versions from previous test runs
  await getSupabaseClient()
    .from('app_versions')
    .delete()
    .eq('app_id', APP_NAME_ENCRYPTED)
    .neq('name', 'builtin')
    .neq('name', 'unknown')
})

afterAll(async () => {
  // Clean up test versions
  await getSupabaseClient()
    .from('app_versions')
    .delete()
    .eq('app_id', APP_NAME_ENCRYPTED)
    .neq('name', 'builtin')
    .neq('name', 'unknown')

  // Reset enforcement to false
  await getSupabaseClient()
    .from('orgs')
    .update({ enforce_encrypted_bundles: false })
    .eq('id', ORG_ID_ENCRYPTED)
})

describe('[Encrypted Bundles Enforcement]', () => {
  describe('org Setting Management', () => {
    it('should have enforce_encrypted_bundles = false by default', async () => {
      const { data, error } = await getSupabaseClient()
        .from('orgs')
        .select('enforce_encrypted_bundles')
        .eq('id', ORG_ID_ENCRYPTED)
        .single()

      expect(error).toBeNull()
      expect(data?.enforce_encrypted_bundles).toBe(false)
    })

    it('should allow updating enforce_encrypted_bundles setting', async () => {
      // Enable enforcement
      const { error: updateError } = await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', ORG_ID_ENCRYPTED)

      expect(updateError).toBeNull()

      // Verify it was updated
      const { data, error } = await getSupabaseClient()
        .from('orgs')
        .select('enforce_encrypted_bundles')
        .eq('id', ORG_ID_ENCRYPTED)
        .single()

      expect(error).toBeNull()
      expect(data?.enforce_encrypted_bundles).toBe(true)

      // Reset back to false for other tests
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', ORG_ID_ENCRYPTED)
    })
  })

  describe('aPI Bundle Creation Enforcement', () => {
    it('should reject unencrypted bundle via API when enforcement is enabled', async () => {
      // Enable enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', ORG_ID_ENCRYPTED)

      // Try to create a bundle without encryption via API
      const response = await fetch(getEndpointUrl('/bundle'), {
        method: 'POST',
        headers: headersEncrypted,
        body: JSON.stringify({
          app_id: APP_NAME_ENCRYPTED,
          version: '1.0.0-unencrypted-api-test',
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          external_url: 'https://example.com/bundle-unencrypted.zip',
          // No session_key - should be rejected
        }),
      })

      // The API should reject this request
      expect(response.ok).toBe(false)
      const data = await response.json() as { error: string }
      expect(data.error).toContain('encryption')

      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', ORG_ID_ENCRYPTED)
    })

    it('should allow encrypted bundle via API when enforcement is enabled', async () => {
      // Enable enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', ORG_ID_ENCRYPTED)

      // Try to create a bundle with encryption via API
      const response = await fetch(getEndpointUrl('/bundle'), {
        method: 'POST',
        headers: headersEncrypted,
        body: JSON.stringify({
          app_id: APP_NAME_ENCRYPTED,
          version: '1.0.0-encrypted-api-test',
          checksum: 'b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcde',
          external_url: 'https://example.com/bundle-encrypted.zip',
          session_key: 'encrypted-session-key-for-api-test',
        }),
      })

      // The API should accept this request
      expect(response.ok).toBe(true)

      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', ORG_ID_ENCRYPTED)
    })

    it('should allow unencrypted bundle via API when enforcement is disabled', async () => {
      // Ensure enforcement is disabled
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', ORG_ID_ENCRYPTED)

      // Try to create a bundle without encryption via API
      const response = await fetch(getEndpointUrl('/bundle'), {
        method: 'POST',
        headers: headersEncrypted,
        body: JSON.stringify({
          app_id: APP_NAME_ENCRYPTED,
          version: '1.0.0-no-enforcement-api-test',
          checksum: 'c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcdef1',
          external_url: 'https://example.com/bundle-no-enforcement.zip',
          // No session_key - should be allowed since enforcement is disabled
        }),
      })

      // The API should accept this request
      expect(response.ok).toBe(true)
    })
  })

  describe('database Trigger Enforcement', () => {
    it('should reject direct insert of unencrypted bundle via trigger', async () => {
      // Enable enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', ORG_ID_ENCRYPTED)

      // Try to insert directly via Supabase SDK (bypassing API)
      const { error } = await getSupabaseClient()
        .from('app_versions')
        .insert({
          app_id: APP_NAME_ENCRYPTED,
          name: '1.0.0-direct-insert-rejected',
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          owner_org: ORG_ID_ENCRYPTED,
          storage_provider: 'r2',
          // No session_key - should be rejected by trigger
        })

      expect(error).not.toBeNull()
      expect(error?.message).toContain('encryption_required')

      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', ORG_ID_ENCRYPTED)
    })

    it('should allow direct insert of encrypted bundle via trigger', async () => {
      // Enable enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', ORG_ID_ENCRYPTED)

      // Try to insert directly via Supabase SDK with session_key
      const { data, error } = await getSupabaseClient()
        .from('app_versions')
        .insert({
          app_id: APP_NAME_ENCRYPTED,
          name: '1.0.0-direct-insert-allowed',
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          owner_org: ORG_ID_ENCRYPTED,
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
        .eq('id', ORG_ID_ENCRYPTED)
    })

    it('should allow direct insert when enforcement is disabled', async () => {
      // Ensure enforcement is disabled
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', ORG_ID_ENCRYPTED)

      // Try to insert directly via Supabase SDK without session_key
      const { data, error } = await getSupabaseClient()
        .from('app_versions')
        .insert({
          app_id: APP_NAME_ENCRYPTED,
          name: '1.0.0-direct-no-enforcement',
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          owner_org: ORG_ID_ENCRYPTED,
          storage_provider: 'r2',
          // No session_key - should be allowed since enforcement is disabled
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(data?.name).toBe('1.0.0-direct-no-enforcement')
    })
  })

  describe('helper Functions', () => {
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
        .eq('id', ORG_ID_ENCRYPTED)

      const { data, error } = await getSupabaseClient()
        .rpc('check_org_encrypted_bundle_enforcement', {
          org_id: ORG_ID_ENCRYPTED,
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
        .eq('id', ORG_ID_ENCRYPTED)

      const { data, error } = await getSupabaseClient()
        .rpc('check_org_encrypted_bundle_enforcement', {
          org_id: ORG_ID_ENCRYPTED,
          session_key: null as unknown as string,
        })

      expect(error).toBeNull()
      expect(data).toBe(false) // Should reject

      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', ORG_ID_ENCRYPTED)
    })

    it('check_org_encrypted_bundle_enforcement should allow encrypted when enforcement is enabled', async () => {
      // Enable enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: true })
        .eq('id', ORG_ID_ENCRYPTED)

      const { data, error } = await getSupabaseClient()
        .rpc('check_org_encrypted_bundle_enforcement', {
          org_id: ORG_ID_ENCRYPTED,
          session_key: 'some-encrypted-data',
        })

      expect(error).toBeNull()
      expect(data).toBe(true) // Should allow

      // Reset enforcement
      await getSupabaseClient()
        .from('orgs')
        .update({ enforce_encrypted_bundles: false })
        .eq('id', ORG_ID_ENCRYPTED)
    })
  })

  describe('get_orgs_v7 includes enforce_encrypted_bundles', () => {
    it('should include enforce_encrypted_bundles field in get_orgs_v7 response', async () => {
      // Use get_orgs_v7 with the encrypted user
      const { data, error } = await getSupabaseClient()
        .rpc('get_orgs_v7', { userid: USER_ID_ENCRYPTED })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(Array.isArray(data)).toBe(true)
      expect(data!.length).toBeGreaterThan(0)

      // Check that ALL orgs in the response have the enforce_encrypted_bundles field
      for (const org of data!) {
        expect(org.enforce_encrypted_bundles).toBeDefined()
        expect(typeof org.enforce_encrypted_bundles).toBe('boolean')
      }
    })
  })
})
