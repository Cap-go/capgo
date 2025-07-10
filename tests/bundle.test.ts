import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, createAppVersions, fetchBundle, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.app.b.${id}`

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})
afterAll(async () => {
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
})

describe('[GET] /bundle operations', () => {
  it('valid app_id', async () => {
    const { response, data } = await fetchBundle(APPNAME)
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })

  it('invalid app_id', async () => {
    const { response } = await fetchBundle('invalid_app')
    expect(response.status).toBe(400)
  })
})

describe('[POST] /bundle/metadata operations', () => {
  let versionId: number

  beforeAll(async () => {
    // Create a test version to update
    const version = await createAppVersions('1.0.0-test-metadata', APPNAME)
    versionId = version.id
  })

  it('should update bundle metadata successfully', async () => {
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: versionId,
        link: 'https://example.com/docs',
        comment: 'Test bundle comment',
      }),
    })

    const data = await response.json() as { status: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('success')

    // Verify the data was updated in the database
    const supabase = getSupabaseClient()
    const { data: version, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('id', versionId)
      .eq('app_id', APPNAME)
      .single()

    expect(error).toBeNull()
    expect(version).toBeTruthy()
    // Type assertion to access the new fields
    expect((version as any).link).toBe('https://example.com/docs')
    expect((version as any).comment).toBe('Test bundle comment')
  })

  it('should handle missing required fields', async () => {
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        // Missing app_id
        version_id: versionId,
        link: 'https://example.com',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_required_fields')
  })

  it('should handle invalid version_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: 999999, // Non-existent version ID
        link: 'https://example.com',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_find_version')
  })

  it('should handle invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'invalid_app',
        version_id: versionId,
        link: 'https://example.com',
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_find_version')
  })
})

describe('[DELETE] /bundle operations', () => {
  it('invalid version', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version: 'invalid_version',
      }),
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })

  it('invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: 'invalid_app',
      }),
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })

  it('delete specific bundle', async () => {
    const deleteBundle = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version: '1.0.1',
      }),
    })
    const deleteBundleData = await deleteBundle.json() as { status: string }
    expect(deleteBundle.status).toBe(200)
    expect(deleteBundleData.status).toBe('ok')
  })

  it('delete all bundles for an app', async () => {
    const deleteAllBundles = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
      }),
    })

    const deleteAllBundlesData = await deleteAllBundles.json() as { status: string }
    expect(deleteAllBundles.status).toBe(200)
    expect(deleteAllBundlesData.status).toBe('ok')
  })
})

describe('[PUT] /bundle operations - Set bundle to channel', () => {
  let versionId: number
  let channelId: number

  beforeAll(async () => {
    // Create a test version
    const version = await createAppVersions('1.0.0-test-channel', APPNAME)
    versionId = version.id

    // Get the unknown version for this app
    const supabase = getSupabaseClient()
    const { data: unknownVersion } = await supabase
      .from('app_versions')
      .select('id')
      .eq('app_id', APPNAME)
      .eq('name', 'unknown')
      .single()
    if (!unknownVersion) {
      throw new Error('Failed to find unknown version')
    }

    // Create a test channel using proper seeded values
    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        name: 'test-channel',
        app_id: APPNAME,
        version: unknownVersion.id, // Use app's unknown version
        created_by: '6aa76066-55ef-4238-ade6-0b32334a4097', // test@capgo.app user from seed
        owner_org: '046a36ac-e03c-4590-9257-bd6c9dba9ee8', // Demo org from seed
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create test channel: ${error.message}`)
    }
    if (!channel) {
      throw new Error('Failed to create test channel: channel is null')
    }
    channelId = channel.id
  })

  it('should set bundle to channel successfully', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: versionId,
        channel_id: channelId,
      }),
    })

    const data = await response.json() as { status: string, message: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('success')
    expect(data.message).toContain('Bundle')
    expect(data.message).toContain('set to channel')

    // Verify the channel was updated in the database
    const supabase = getSupabaseClient()
    const { data: channel, error } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .eq('app_id', APPNAME)
      .single()

    expect(error).toBeNull()
    expect(channel).toBeTruthy()
    if (channel) {
      expect(channel.version).toBe(versionId)
    }
  })

  it('should handle missing required fields', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        // Missing channel_id
        app_id: APPNAME,
        version_id: versionId,
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_required_fields')
  })

  it('should handle invalid version_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: 999999, // Non-existent version ID
        channel_id: channelId,
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_find_version')
  })

  it('should handle invalid channel_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: versionId,
        channel_id: 999999, // Non-existent channel ID
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_find_channel')
  })

  it('should handle invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        app_id: 'invalid_app',
        version_id: versionId,
        channel_id: channelId,
      }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_access_app')
  })
})
