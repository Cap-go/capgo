import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, createAppVersions, fetchBundle, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const APPNAME = 'com.demo.app.bundle'

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
    const testLink = 'https://example.com/docs'
    const testComment = 'Test bundle comment'
    
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: versionId,
        link: testLink,
        comment: testComment
      }),
    })
    
    const data = await response.json() as { status: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('success')

    // Verify the data was updated in the database
    const supabase = getSupabaseClient()
    const { data: version, error } = await supabase
      .from('app_versions')
      .select('id,name,link,comment')
      .eq('id', versionId)
      .eq('app_id', APPNAME)
      .single()

    expect(error).toBeNull()
    expect(version).toBeTruthy()
    expect(version.link).toBe(testLink)
    expect(version.comment).toBe(testComment)
  })

  it('should handle missing required fields', async () => {
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        // Missing app_id
        version_id: versionId,
        link: 'https://example.com'
      }),
    })
    
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string, error: string }
    expect(data.status).toBe('Missing required fields')
  })

  it('should handle invalid version_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: 999999, // Non-existent version ID
        link: 'https://example.com'
      }),
    })
    
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Cannot find version')
  })

  it('should handle invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'invalid_app',
        version_id: versionId,
        link: 'https://example.com'
      }),
    })
    
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Cannot find version')
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
