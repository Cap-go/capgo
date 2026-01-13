import type { ManifestEntry } from 'supabase/functions/_backend/utils/downloadUrl.ts'

import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getBaseData, getSupabaseClient, postUpdate, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.demo.app.updates.${id}`

const manifestData = { file_name: 'test', s3_path: '/test_file.html', file_hash: '1234567890' }

// Store initial state for cleanup
let initialR2Path: string | null = null
let versionId: number | null = null

interface UpdateRes {
  error?: string
  url?: string
  checksum?: string
  version?: string
  message?: string
  manifest?: ManifestEntry[]
}

// Helper to insert manifest entries directly into the manifest table
// This bypasses the trigger/queue system which doesn't run in test environment
async function insertManifestEntries(appVersionId: number) {
  const supabase = getSupabaseClient()
  // First, delete any existing manifest entries for this version
  await supabase.from('manifest').delete().eq('app_version_id', appVersionId)
  // Insert the manifest entry
  const { error } = await supabase.from('manifest').insert({
    app_version_id: appVersionId,
    file_name: manifestData.file_name,
    s3_path: manifestData.s3_path,
    file_hash: manifestData.file_hash,
    file_size: 100,
  })
  if (error)
    throw new Error(`Failed to insert manifest entry: ${error.message}`)

  // Update the manifest_count on the version
  await supabase.from('app_versions').update({ manifest_count: 1 }).eq('id', appVersionId)

  // Also update manifest_bundle_count on the app to enable manifest fetching
  const { data: version } = await supabase.from('app_versions').select('app_id').eq('id', appVersionId).single()
  if (version) {
    await supabase.from('apps').update({ manifest_bundle_count: 1 }).eq('app_id', version.app_id)
  }
}

// Helper to remove manifest entries
async function removeManifestEntries(appVersionId: number) {
  const supabase = getSupabaseClient()
  await supabase.from('manifest').delete().eq('app_version_id', appVersionId)
  await supabase.from('app_versions').update({ manifest_count: 0 }).eq('id', appVersionId)
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)

  // Store initial state for version 1.0.0 for cleanup
  const supabase = getSupabaseClient()
  const { data: versionData } = await supabase
    .from('app_versions')
    .select('id, r2_path')
    .eq('name', '1.0.0')
    .eq('app_id', APPNAME)
    .single()

  if (versionData) {
    versionId = versionData.id
    initialR2Path = versionData.r2_path
  }
})

afterEach(async () => {
  // Reset the version to its initial state after each test
  // This ensures test isolation and prevents interdependencies
  const supabase = getSupabaseClient()

  if (versionId) {
    // Remove any manifest entries added during the test
    await supabase.from('manifest').delete().eq('app_version_id', versionId)

    // Reset app_versions fields to initial state
    await supabase
      .from('app_versions')
      .update({
        r2_path: initialR2Path,
        manifest_count: 0,
      })
      .eq('id', versionId)
  }

  // Reset app-level manifest_bundle_count
  await supabase.from('apps').update({ manifest_bundle_count: 0 }).eq('app_id', APPNAME)
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
})

// Delta manifest test constants
const DELTA_APPNAME = `com.demo.app.delta.${id}`
let deltaOldVersionId: number | null = null
let deltaNewVersionId: number | null = null

// Helper to insert multiple manifest entries for a version
async function insertMultipleManifestEntries(appVersionId: number, entries: { file_name: string, file_hash: string, s3_path: string }[]) {
  const supabase = getSupabaseClient()
  // First, delete any existing manifest entries for this version
  await supabase.from('manifest').delete().eq('app_version_id', appVersionId)
  // Insert all manifest entries in a single batch
  const { error } = await supabase.from('manifest').insert(
    entries.map(entry => ({
      app_version_id: appVersionId,
      file_name: entry.file_name,
      s3_path: entry.s3_path,
      file_hash: entry.file_hash,
      file_size: 100,
    })),
  )
  if (error)
    throw new Error(`Failed to insert manifest entries: ${error.message}`)

  // Update the manifest_count on the version
  await supabase.from('app_versions').update({ manifest_count: entries.length }).eq('id', appVersionId)

  // Also update manifest_bundle_count on the app to enable manifest fetching
  const { data: version } = await supabase.from('app_versions').select('app_id').eq('id', appVersionId).single()
  if (version) {
    await supabase.from('apps').update({ manifest_bundle_count: entries.length }).eq('app_id', version.app_id)
  }
}

describe('update manifest scenarios', () => {
  it('manifest update', async () => {
    // test manifest update working with plugin version >= 6.25.0
    const baseData = getBaseData(APPNAME)
    // Get the version ID for 1.0.0
    const { data: versionData, error: versionError } = await getSupabaseClient()
      .from('app_versions')
      .select('id')
      .eq('name', '1.0.0')
      .eq('app_id', APPNAME)
      .single()

    if (versionError || !versionData) {
      console.log('Version data not found', versionError)
      throw new Error('Version data not found')
    }

    // Insert manifest entries directly into the manifest table
    await insertManifestEntries(versionData.id)

    baseData.version_name = '1.1.0'
    baseData.plugin_version = '6.25.0'
    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.manifest).toBeDefined()
    expect(json.manifest?.[0].file_name).toBe('test')
    expect(json.manifest?.[0].download_url).toContain('/test_file.html')
    expect(json.manifest?.[0].file_hash).toBe('1234567890')
  })

  // test for plugin version < 6.8.0
  it('manifest should not be available with plugin version < 6.8.0', async () => {
    const baseData = getBaseData(APPNAME)
    baseData.version_name = '1.1.0'
    baseData.plugin_version = '6.7.0'

    // Get the version ID and ensure manifest entries exist
    const { data: versionData } = await getSupabaseClient()
      .from('app_versions')
      .select('id')
      .eq('name', '1.0.0')
      .eq('app_id', APPNAME)
      .single()

    if (versionData) {
      await insertManifestEntries(versionData.id)
    }

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.manifest).toBeUndefined()
  })

  // test for an update with neither manifest nor r2_path
  it('update fail with nothing', async () => {
    const baseData = getBaseData(APPNAME)

    // Get the version ID
    const { data: versionData } = await getSupabaseClient()
      .from('app_versions')
      .select('id')
      .eq('name', '1.0.0')
      .eq('app_id', APPNAME)
      .single()

    // Clear r2_path and remove manifest entries
    await getSupabaseClient()
      .from('app_versions')
      .update({ r2_path: null })
      .eq('name', '1.0.0')
      .eq('app_id', APPNAME)
      .throwOnError()

    if (versionData) {
      await removeManifestEntries(versionData.id)
    }

    // Also reset manifest_bundle_count on the app
    await getSupabaseClient().from('apps').update({ manifest_bundle_count: 0 }).eq('app_id', APPNAME)

    baseData.version_name = '1.1.0'
    baseData.plugin_version = '6.25.0'
    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.message).toBe('Cannot get bundle')
  })

  it('update with only manifest', async () => {
    const baseData = getBaseData(APPNAME)

    // Get the version ID
    const { data: versionData } = await getSupabaseClient()
      .from('app_versions')
      .select('id')
      .eq('name', '1.0.0')
      .eq('app_id', APPNAME)
      .single()

    // Clear r2_path
    await getSupabaseClient()
      .from('app_versions')
      .update({ r2_path: null })
      .eq('name', '1.0.0')
      .eq('app_id', APPNAME)
      .throwOnError()

    // Insert manifest entries
    if (versionData) {
      await insertManifestEntries(versionData.id)
    }

    baseData.version_name = '1.1.0'
    baseData.plugin_version = '6.25.0'
    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.manifest).toBeDefined()
  })
})

describe('delta manifest scenarios', () => {
  beforeAll(async () => {
    // Set up the delta manifest test app with two versions
    await resetAndSeedAppData(DELTA_APPNAME)
    const supabase = getSupabaseClient()

    // Get version IDs for old (1.359.0) and new (1.0.0) versions
    // Note: resetAndSeedAppData creates versions 1.0.0, 1.0.1, 1.359.0, 1.360.0, 1.361.0
    // The production channel points to version 1.0.0 by default
    const { data: oldVersion } = await supabase
      .from('app_versions')
      .select('id')
      .eq('name', '1.359.0')
      .eq('app_id', DELTA_APPNAME)
      .single()

    const { data: newVersion } = await supabase
      .from('app_versions')
      .select('id')
      .eq('name', '1.0.0')
      .eq('app_id', DELTA_APPNAME)
      .single()

    if (oldVersion)
      deltaOldVersionId = oldVersion.id
    if (newVersion)
      deltaNewVersionId = newVersion.id

    // Set up manifest entries for delta testing:
    // Old version (1.359.0): file_a.js (hash1), file_b.js (hash2)
    // New version (1.0.0): file_a.js (hash1 - unchanged), file_b.js (hash3 - changed), file_c.js (hash4 - new)
    if (deltaOldVersionId) {
      await insertMultipleManifestEntries(deltaOldVersionId, [
        { file_name: 'file_a.js', file_hash: 'hash_unchanged_1', s3_path: '/file_a.js' },
        { file_name: 'file_b.js', file_hash: 'hash_old_2', s3_path: '/file_b.js' },
      ])
    }

    if (deltaNewVersionId) {
      await insertMultipleManifestEntries(deltaNewVersionId, [
        { file_name: 'file_a.js', file_hash: 'hash_unchanged_1', s3_path: '/file_a.js' }, // Same hash - should be excluded
        { file_name: 'file_b.js', file_hash: 'hash_new_3', s3_path: '/file_b.js' }, // Different hash - should be included
        { file_name: 'file_c.js', file_hash: 'hash_new_4', s3_path: '/file_c.js' }, // New file - should be included
      ])
    }
  })

  afterAll(async () => {
    await resetAppData(DELTA_APPNAME)
    await resetAppDataStats(DELTA_APPNAME)
  })

  it('returns delta manifest with only changed/new files', async () => {
    // Request update from old version (1.359.0) to new version (1.0.0)
    // Should only return file_b.js (changed hash) and file_c.js (new file)
    // file_a.js should be excluded because it has the same hash
    const baseData = getBaseData(DELTA_APPNAME)
    baseData.version_name = '1.359.0' // Device is on old version
    baseData.plugin_version = '7.1.0' // Plugin version that supports manifest

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()

    expect(json.manifest).toBeDefined()
    expect(json.manifest?.length).toBe(2) // Only file_b and file_c

    // Verify the returned files are the changed/new ones
    const fileNames = json.manifest?.map(m => m.file_name).sort()
    expect(fileNames).toEqual(['file_b.js', 'file_c.js'])

    // Verify file_a.js is NOT in the response (it has unchanged hash)
    expect(json.manifest?.find(m => m.file_name === 'file_a.js')).toBeUndefined()

    // Verify file_b has new hash
    const fileB = json.manifest?.find(m => m.file_name === 'file_b.js')
    expect(fileB?.file_hash).toBe('hash_new_3')

    // Verify file_c is the new file
    const fileC = json.manifest?.find(m => m.file_name === 'file_c.js')
    expect(fileC?.file_hash).toBe('hash_new_4')
  })

  it('returns full manifest for first install (builtin version)', async () => {
    // When device is on 'builtin', it should receive full manifest (all 3 files)
    const baseData = getBaseData(DELTA_APPNAME)
    baseData.version_name = 'builtin' // First install
    baseData.plugin_version = '7.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()

    expect(json.manifest).toBeDefined()
    expect(json.manifest?.length).toBe(3) // All files: file_a, file_b, file_c

    const fileNames = json.manifest?.map(m => m.file_name).sort()
    expect(fileNames).toEqual(['file_a.js', 'file_b.js', 'file_c.js'])
  })

  it('returns full manifest when old version does not exist', async () => {
    // When device's version doesn't exist in DB, should return full manifest
    const baseData = getBaseData(DELTA_APPNAME)
    baseData.version_name = '99.99.99' // Non-existent version
    baseData.plugin_version = '7.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()

    expect(json.manifest).toBeDefined()
    expect(json.manifest?.length).toBe(3) // All files (graceful fallback)

    const fileNames = json.manifest?.map(m => m.file_name).sort()
    expect(fileNames).toEqual(['file_a.js', 'file_b.js', 'file_c.js'])
  })

  it('returns empty manifest when all files are identical', async () => {
    // Create a scenario where old and new versions have identical manifests
    const supabase = getSupabaseClient()

    // Get the 1.0.1 version (different from the one on channel)
    const { data: identicalVersion } = await supabase
      .from('app_versions')
      .select('id')
      .eq('name', '1.0.1')
      .eq('app_id', DELTA_APPNAME)
      .single()

    if (identicalVersion) {
      // Set up identical manifest entries as the new version (1.0.0)
      await insertMultipleManifestEntries(identicalVersion.id, [
        { file_name: 'file_a.js', file_hash: 'hash_unchanged_1', s3_path: '/file_a.js' },
        { file_name: 'file_b.js', file_hash: 'hash_new_3', s3_path: '/file_b.js' },
        { file_name: 'file_c.js', file_hash: 'hash_new_4', s3_path: '/file_c.js' },
      ])
    }

    try {
      const baseData = getBaseData(DELTA_APPNAME)
      baseData.version_name = '1.0.1' // Device has identical manifest
      baseData.plugin_version = '7.1.0'

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()

      // When all files are identical, delta should be empty
      expect(json.manifest).toBeDefined()
      expect(json.manifest?.length).toBe(0)
    }
    finally {
      // Clean up: remove the manifest entries we just added
      if (identicalVersion) {
        await supabase.from('manifest').delete().eq('app_version_id', identicalVersion.id)
        await supabase.from('app_versions').update({ manifest_count: 0 }).eq('id', identicalVersion.id)
      }
    }
  })
})
