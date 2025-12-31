import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  APP_NAME,
  getBaseData,
  getEndpointUrl,
  getSupabaseClient,
  headers,
  ORG_ID,
  postUpdate,
  resetAndSeedAppData,
  resetAppData,
  resetAppDataStats,
  STRIPE_INFO_CUSTOMER_ID,
} from './test-utils.ts'

const id = randomUUID()
const APP_NAME_METADATA = `${APP_NAME}.${id}`

interface UpdateRes {
  error?: string
  url?: string
  checksum?: string
  version?: string
  message?: string
  link?: string
  comment?: string
}

beforeAll(async () => {
  await resetAndSeedAppData(APP_NAME_METADATA)
})

afterAll(async () => {
  await resetAppData(APP_NAME_METADATA)
  await resetAppDataStats(APP_NAME_METADATA)
})

describe('expose_metadata feature', () => {
  const supabase = getSupabaseClient()

  describe('[PUT] /app - expose_metadata field', () => {
    it('should set expose_metadata to true via API', async () => {
      const response = await fetch(`${getEndpointUrl('/app')}/${APP_NAME_METADATA}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          expose_metadata: true,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { expose_metadata: boolean }
      expect(data.expose_metadata).toBe(true)

      // Verify in database
      const { data: appData, error } = await supabase
        .from('apps')
        .select('expose_metadata')
        .eq('app_id', APP_NAME_METADATA)
        .single()

      expect(error).toBeNull()
      expect(appData?.expose_metadata).toBe(true)
    })

    it('should set expose_metadata to false via API', async () => {
      // First set to true
      await supabase
        .from('apps')
        .update({ expose_metadata: true })
        .eq('app_id', APP_NAME_METADATA)

      
      // Then set to false via API
      const response = await fetch(`${getEndpointUrl('/app')}/${APP_NAME_METADATA}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          expose_metadata: false,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { expose_metadata: boolean }
      expect(data.expose_metadata).toBe(false)

      // Verify in database
      const { data: appData, error } = await supabase
        .from('apps')
        .select('expose_metadata')
        .eq('app_id', APP_NAME_METADATA)
        .single()

      expect(error).toBeNull()
      expect(appData?.expose_metadata).toBe(false)
    })

    it('should default expose_metadata to false for new apps', async () => {
      const newAppId = `${APP_NAME}.${randomUUID()}`

      const createResponse = await fetch(`${getEndpointUrl('/app')}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: newAppId,
          name: `Test App ${newAppId}`,
          owner_org: ORG_ID,
        }),
      })

      expect(createResponse.status).toBe(200)

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

  describe('[POST] /updates - metadata exposure with plugin version', () => {
    beforeAll(async () => {
      // Ensure the org has a valid plan (reset exceeded flags that might be set by other tests)
      await supabase
        .from('stripe_info')
        .update({
          is_good_plan: true,
          mau_exceeded: false,
          bandwidth_exceeded: false,
          storage_exceeded: false,
          build_time_exceeded: false,
        })
        .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)

      // Add link and comment to the default version (1.0.0)
      const { data, error } = await supabase
        .from('app_versions')
        .update({
          link: 'https://example.com/release-notes',
          comment: 'This is a test release with new features',
        })
        .eq('app_id', APP_NAME_METADATA)
        .eq('name', '1.0.0')
        .select('id')
        .single()

      if (error || !data)
        throw error ?? new Error('Failed to update version with metadata')
    })

    it('should expose metadata when expose_metadata=true and plugin version >= 7.35.0', async () => {
      // Enable expose_metadata
      await supabase
        .from('apps')
        .update({ expose_metadata: true })
        .eq('app_id', APP_NAME_METADATA)

      
      const baseData = getBaseData(APP_NAME_METADATA)
      baseData.version_name = '1.1.0' // Request older version to trigger update
      baseData.plugin_version = '7.35.0' // Exact minimum version

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)

      const json = await response.json<UpdateRes>()
      expect(json.version).toBe('1.0.0')
      expect(json.link).toBe('https://example.com/release-notes')
      expect(json.comment).toBe('This is a test release with new features')
    })

    it('should expose metadata when expose_metadata=true and plugin version > 7.35.0', async () => {
      // Ensure expose_metadata is true
      await supabase
        .from('apps')
        .update({ expose_metadata: true })
        .eq('app_id', APP_NAME_METADATA)

      
      const baseData = getBaseData(APP_NAME_METADATA)
      baseData.version_name = '1.1.0'
      baseData.plugin_version = '7.36.0' // Higher version

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)

      const json = await response.json<UpdateRes>()
      expect(json.version).toBe('1.0.0')
      expect(json.link).toBe('https://example.com/release-notes')
      expect(json.comment).toBe('This is a test release with new features')
    })

    it('should NOT expose metadata when expose_metadata=true but plugin version < 7.35.0', async () => {
      // Ensure expose_metadata is true
      await supabase
        .from('apps')
        .update({ expose_metadata: true })
        .eq('app_id', APP_NAME_METADATA)

      
      const baseData = getBaseData(APP_NAME_METADATA)
      baseData.version_name = '1.1.0'
      baseData.plugin_version = '7.34.9' // Older version

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)

      const json = await response.json<UpdateRes>()
      expect(json.version).toBe('1.0.0')
      expect(json.link).toBeUndefined()
      expect(json.comment).toBeUndefined()
    })

    it('should NOT expose metadata when expose_metadata=false even with plugin version >= 7.35.0', async () => {
      // Disable expose_metadata
      await supabase
        .from('apps')
        .update({ expose_metadata: false })
        .eq('app_id', APP_NAME_METADATA)

      
      const baseData = getBaseData(APP_NAME_METADATA)
      baseData.version_name = '1.1.0'
      baseData.plugin_version = '7.35.0'

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)

      const json = await response.json<UpdateRes>()
      expect(json.version).toBe('1.0.0')
      expect(json.link).toBeUndefined()
      expect(json.comment).toBeUndefined()
    })

    it('should NOT expose metadata when expose_metadata=false and plugin version < 7.35.0', async () => {
      // Ensure expose_metadata is false
      await supabase
        .from('apps')
        .update({ expose_metadata: false })
        .eq('app_id', APP_NAME_METADATA)

      
      const baseData = getBaseData(APP_NAME_METADATA)
      baseData.version_name = '1.1.0'
      baseData.plugin_version = '7.34.0'

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)

      const json = await response.json<UpdateRes>()
      expect(json.version).toBe('1.0.0')
      expect(json.link).toBeUndefined()
      expect(json.comment).toBeUndefined()
    })

    it('should handle missing metadata fields gracefully when expose_metadata=true', async () => {
      // Create a version without link/comment but with checksum/external_url
      const { data: newVersion, error: insertError } = await supabase
        .from('app_versions')
        .insert({
          app_id: APP_NAME_METADATA,
          name: '0.9.0',
          owner_org: ORG_ID,
          storage_provider: 'r2',
          checksum: 'test-checksum-0.9.0',
          external_url: 'https://example.com/bundle-0.9.0.zip',
        })
        .select('id')
        .single()

      expect(insertError).toBeNull()
      expect(newVersion).not.toBeNull()

      // Get original version first
      const { data: originalVersion } = await supabase
        .from('app_versions')
        .select('id')
        .eq('app_id', APP_NAME_METADATA)
        .eq('name', '1.0.0')
        .single()

      try {
        // Set channel to this version
        await supabase
          .from('channels')
          .update({ version: newVersion!.id })
          .eq('app_id', APP_NAME_METADATA)
          .eq('name', 'production')

        await supabase
          .from('apps')
          .update({ expose_metadata: true })
          .eq('app_id', APP_NAME_METADATA)

        
        const baseData = getBaseData(APP_NAME_METADATA)
        baseData.version_name = '1.1.0'
        baseData.plugin_version = '7.35.0'

        const response = await postUpdate(baseData)
        expect(response.status).toBe(200)

        const json = await response.json<UpdateRes>()
        // Should get update with version
        expect(json.version).toBe('0.9.0')
        // Should not have metadata fields since they're null
        expect(json.link).toBeUndefined()
        expect(json.comment).toBeUndefined()
      }
      finally {
        // Cleanup - restore original version
        await supabase
          .from('channels')
          .update({ version: originalVersion!.id })
          .eq('app_id', APP_NAME_METADATA)
          .eq('name', 'production')

        await supabase
          .from('app_versions')
          .delete()
          .eq('id', newVersion!.id)

              }
    })

    it('should expose metadata with only link when comment is null', async () => {
      try {
        // Update version to have only link
        await supabase
          .from('app_versions')
          .update({
            link: 'https://example.com/link-only',
            comment: null,
          })
          .eq('app_id', APP_NAME_METADATA)
          .eq('name', '1.0.0')

        await supabase
          .from('apps')
          .update({ expose_metadata: true })
          .eq('app_id', APP_NAME_METADATA)

        
        const baseData = getBaseData(APP_NAME_METADATA)
        baseData.version_name = '1.1.0'
        baseData.plugin_version = '7.35.0'

        const response = await postUpdate(baseData)
        expect(response.status).toBe(200)

        const json = await response.json<UpdateRes>()
        // Should get an update
        if (json.version) {
          expect(json.link).toBe('https://example.com/link-only')
          expect(json.comment).toBeUndefined()
        }
      }
      finally {
        // Restore original metadata
        await supabase
          .from('app_versions')
          .update({
            link: 'https://example.com/release-notes',
            comment: 'This is a test release with new features',
          })
          .eq('app_id', APP_NAME_METADATA)
          .eq('name', '1.0.0')

              }
    })

    it('should expose metadata with only comment when link is null', async () => {
      try {
        // Update version to have only comment
        await supabase
          .from('app_versions')
          .update({
            link: null,
            comment: 'Comment without a link',
          })
          .eq('app_id', APP_NAME_METADATA)
          .eq('name', '1.0.0')

        await supabase
          .from('apps')
          .update({ expose_metadata: true })
          .eq('app_id', APP_NAME_METADATA)

        
        const baseData = getBaseData(APP_NAME_METADATA)
        baseData.version_name = '1.1.0'
        baseData.plugin_version = '7.35.0'

        const response = await postUpdate(baseData)
        expect(response.status).toBe(200)

        const json = await response.json<UpdateRes>()
        // Should get an update
        if (json.version) {
          expect(json.link).toBeUndefined()
          expect(json.comment).toBe('Comment without a link')
        }
      }
      finally {
        // Restore both fields for other tests
        await supabase
          .from('app_versions')
          .update({
            link: 'https://example.com/release-notes',
            comment: 'This is a test release with new features',
          })
          .eq('app_id', APP_NAME_METADATA)
          .eq('name', '1.0.0')

              }
    })
  })

  describe('edge cases', () => {
    it('should not expose metadata with very old plugin version', async () => {
      await supabase
        .from('apps')
        .update({ expose_metadata: true })
        .eq('app_id', APP_NAME_METADATA)

      
      const baseData = getBaseData(APP_NAME_METADATA)
      baseData.version_name = '1.1.0'
      baseData.plugin_version = '1.0.0' // Very old version

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)

      const json = await response.json<UpdateRes>()
      // Should still return a valid response, just without metadata
      if (json.version) {
        expect(json.link).toBeUndefined()
        expect(json.comment).toBeUndefined()
      }
    })

    it('should work correctly with latest plugin version', async () => {
      await supabase
        .from('apps')
        .update({ expose_metadata: true })
        .eq('app_id', APP_NAME_METADATA)

      
      const baseData = getBaseData(APP_NAME_METADATA)
      baseData.version_name = '1.1.0'
      baseData.plugin_version = '8.0.0' // Future version

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)

      const json = await response.json<UpdateRes>()
      // Should expose metadata for newer versions
      if (json.version) {
        expect(json.link).toBe('https://example.com/release-notes')
        expect(json.comment).toBe('This is a test release with new features')
      }
    })
  })
})
