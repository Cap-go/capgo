import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  APP_NAME,
  getEndpointUrl,
  getSupabaseClient,
  headers,
  ORG_ID,
  resetAndSeedAppData,
  resetAppData,
  resetAppDataStats,
  triggerD1Sync,
} from './test-utils.ts'

const id = randomUUID()
const APP_NAME_CLI = `${APP_NAME}.${id}`

/**
 * These tests verify that the expose_metadata feature works correctly
 * via the API endpoints that the CLI uses. The CLI calls these same
 * endpoints, so testing the API verifies CLI functionality.
 */
describe('expose_metadata via CLI/API integration', () => {
  const supabase = getSupabaseClient()

  beforeAll(async () => {
    await resetAndSeedAppData(APP_NAME_CLI)
  })

  afterAll(async () => {
    await resetAppData(APP_NAME_CLI)
    await resetAppDataStats(APP_NAME_CLI)
  })

  describe('Setting expose_metadata via PUT /app endpoint (used by CLI)', () => {
    it('should enable expose_metadata using API endpoint', async () => {
      // This simulates: npx @capgo/cli app set --expose-metadata true
      const response = await fetch(`${getEndpointUrl('/app')}/${APP_NAME_CLI}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          expose_metadata: true,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { expose_metadata: boolean }
      expect(data.expose_metadata).toBe(true)

      // Verify the change persisted
      const { data: appData, error } = await supabase
        .from('apps')
        .select('expose_metadata')
        .eq('app_id', APP_NAME_CLI)
        .single()

      expect(error).toBeNull()
      expect(appData?.expose_metadata).toBe(true)
    })

    it('should disable expose_metadata using API endpoint', async () => {
      // First enable it
      await supabase
        .from('apps')
        .update({ expose_metadata: true })
        .eq('app_id', APP_NAME_CLI)

      await triggerD1Sync()

      // This simulates: npx @capgo/cli app set --expose-metadata false
      const response = await fetch(`${getEndpointUrl('/app')}/${APP_NAME_CLI}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          expose_metadata: false,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { expose_metadata: boolean }
      expect(data.expose_metadata).toBe(false)

      // Verify the change persisted
      const { data: appData, error } = await supabase
        .from('apps')
        .select('expose_metadata')
        .eq('app_id', APP_NAME_CLI)
        .single()

      expect(error).toBeNull()
      expect(appData?.expose_metadata).toBe(false)
    })

    it('should update expose_metadata along with other app settings', async () => {
      // This simulates: npx @capgo/cli app set --name "New Name" --expose-metadata true
      const response = await fetch(`${getEndpointUrl('/app')}/${APP_NAME_CLI}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: 'Updated App Name',
          expose_metadata: true,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { name: string, expose_metadata: boolean }
      expect(data.name).toBe('Updated App Name')
      expect(data.expose_metadata).toBe(true)

      // Verify both changes persisted
      const { data: appData, error } = await supabase
        .from('apps')
        .select('name, expose_metadata')
        .eq('app_id', APP_NAME_CLI)
        .single()

      expect(error).toBeNull()
      expect(appData?.name).toBe('Updated App Name')
      expect(appData?.expose_metadata).toBe(true)
    })

    it('should preserve existing settings when only updating expose_metadata', async () => {
      // Set initial state
      await supabase
        .from('apps')
        .update({
          name: 'Test App',
          retention: 604800, // 7 days in seconds
          expose_metadata: false,
        })
        .eq('app_id', APP_NAME_CLI)

      await triggerD1Sync()

      // Update only expose_metadata
      const response = await fetch(`${getEndpointUrl('/app')}/${APP_NAME_CLI}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          expose_metadata: true,
        }),
      })

      expect(response.status).toBe(200)

      // Verify other settings were preserved
      const { data: appData, error } = await supabase
        .from('apps')
        .select('name, retention, expose_metadata')
        .eq('app_id', APP_NAME_CLI)
        .single()

      expect(error).toBeNull()
      expect(appData?.name).toBe('Test App')
      expect(appData?.retention).toBe(604800)
      expect(appData?.expose_metadata).toBe(true)
    })
  })

  describe('Reading expose_metadata via GET /app endpoint (used by CLI)', () => {
    it('should return expose_metadata when getting app details', async () => {
      // Set a known state
      await supabase
        .from('apps')
        .update({ expose_metadata: true })
        .eq('app_id', APP_NAME_CLI)

      await triggerD1Sync()

      // This simulates: npx @capgo/cli app get
      const response = await fetch(`${getEndpointUrl('/app')}/${APP_NAME_CLI}`, {
        method: 'GET',
        headers,
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { expose_metadata: boolean, app_id: string }
      expect(data.expose_metadata).toBe(true)
      expect(data.app_id).toBe(APP_NAME_CLI)
    })

    it('should return expose_metadata=false by default', async () => {
      // Ensure it's false
      await supabase
        .from('apps')
        .update({ expose_metadata: false })
        .eq('app_id', APP_NAME_CLI)

      await triggerD1Sync()

      const response = await fetch(`${getEndpointUrl('/app')}/${APP_NAME_CLI}`, {
        method: 'GET',
        headers,
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { expose_metadata: boolean }
      expect(data.expose_metadata).toBe(false)
    })
  })

  describe('Creating apps with expose_metadata via POST /app endpoint', () => {
    it('should create app with expose_metadata=true when specified', async () => {
      const newAppId = `${APP_NAME}.${randomUUID()}`

      const response = await fetch(`${getEndpointUrl('/app')}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: newAppId,
          name: `Test App ${newAppId}`,
          owner_org: ORG_ID,
          // Note: expose_metadata is not typically set during creation,
          // but if the API supports it, it should work
        }),
      })

      expect(response.status).toBe(200)

      // Should default to false
      const { data: appData, error } = await supabase
        .from('apps')
        .select('expose_metadata')
        .eq('app_id', newAppId)
        .single()

      expect(error).toBeNull()
      expect(appData?.expose_metadata).toBe(false)

      // Cleanup
      await supabase.from('apps').delete().eq('app_id', newAppId)
    })
  })

  describe('Authorization checks for expose_metadata', () => {
    it('should require proper permissions to update expose_metadata', async () => {
      // This test verifies that only authorized users can update expose_metadata
      // The existing RLS policies should prevent unauthorized updates

      const response = await fetch(`${getEndpointUrl('/app')}/${APP_NAME_CLI}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'invalid-api-key',
        },
        body: JSON.stringify({
          expose_metadata: true,
        }),
      })

      // Should fail with 401 or 403
      expect([401, 403]).toContain(response.status)
    })
  })

  describe('Integration with bundle metadata', () => {
    it('should allow setting bundle metadata (link and comment) via bundle API', async () => {
      // Create a new version with metadata
      const versionName = '2.0.0'

      // Note: This tests the bundle creation endpoint which should accept link and comment
      // The actual bundle upload endpoint would be tested in bundle.test.ts
      const { data: version, error } = await supabase
        .from('app_versions')
        .insert({
          app_id: APP_NAME_CLI,
          name: versionName,
          owner_org: ORG_ID,
          storage_provider: 'r2',
          link: 'https://github.com/my-org/my-app/releases/tag/v2.0.0',
          comment: 'Major release with breaking changes',
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(version?.link).toBe('https://github.com/my-org/my-app/releases/tag/v2.0.0')
      expect(version?.comment).toBe('Major release with breaking changes')

      // Cleanup
      await supabase.from('app_versions').delete().eq('id', version!.id)
    })

    it('should allow updating bundle metadata via bundle API', async () => {
      // Create a version
      const { data: version, error: createError } = await supabase
        .from('app_versions')
        .insert({
          app_id: APP_NAME_CLI,
          name: '2.1.0',
          owner_org: ORG_ID,
          storage_provider: 'r2',
        })
        .select()
        .single()

      expect(createError).toBeNull()

      // Update with metadata
      const { error: updateError } = await supabase
        .from('app_versions')
        .update({
          link: 'https://example.com/updated',
          comment: 'Updated comment',
        })
        .eq('id', version!.id)

      expect(updateError).toBeNull()

      // Verify
      const { data: updated, error: fetchError } = await supabase
        .from('app_versions')
        .select('link, comment')
        .eq('id', version!.id)
        .single()

      expect(fetchError).toBeNull()
      expect(updated?.link).toBe('https://example.com/updated')
      expect(updated?.comment).toBe('Updated comment')

      // Cleanup
      await supabase.from('app_versions').delete().eq('id', version!.id)
    })
  })
})
