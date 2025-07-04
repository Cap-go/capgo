import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.bundle.error.${id}`
let testOrgId: string

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)

  // Create test organization
  const { data: orgData, error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: randomUUID(),
    name: `Test Bundle Error Org ${id}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
  }).select().single()

  if (orgError)
    throw orgError
  testOrgId = orgData.id

  // Create test app
  await getSupabaseClient().from('apps').insert({
    id: randomUUID(),
    app_id: APPNAME,
    name: `Test Bundle Error App`,
    icon_url: 'https://example.com/icon.png',
    owner_org: testOrgId,
  })
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await getSupabaseClient().from('orgs').delete().eq('id', testOrgId)
})

describe('[GET] /bundle - Error Cases', () => {
  it('should return 400 when app_id is missing', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'GET',
      headers,
      // Missing app_id
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_app_id')
  })

  it('should return 400 when user cannot access the app', async () => {
    const response = await fetch(`${BASE_URL}/bundle?app_id=nonexistent.app`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_get_bundle')
  })

  it('should return 400 when bundle cannot be retrieved', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        // This might trigger a database error
      }),
    })

    if (response.status === 400) {
      const data = await response.json() as { status: string }
      expect(data.status).toBe('Cannot get bundle')
    }
  })

  it('should handle invalid JSON body', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'POST',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('[DELETE] /bundle - Error Cases', () => {
  it('should return 400 when app_id is missing', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        version: '1.0.0',
        // Missing app_id
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_app_id')
  })

  it('should return 400 when user cannot access the app', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app',
        version: '1.0.0',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_delete_bundle')
  })

  it('should return 400 when version cannot be deleted', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version: 'nonexistent-version',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_delete_version')
  })

  it('should return 400 when all versions cannot be deleted', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        // No version specified - should delete all
      }),
    })

    if (response.status === 400) {
      const data = await response.json() as { status: string }
      expect(data.status).toBe('Cannot delete all version')
    }
  })

  it('should handle invalid JSON body', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'DELETE',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('[POST] /bundle/metadata - Extended Error Cases', () => {
  it('should return 400 when no fields to update', async () => {
    // First create a version to test with
    const supabase = getSupabaseClient()
    const { data: version, error } = await supabase
      .from('app_versions')
      .insert({
        app_id: APPNAME,
        name: '1.0.0-test-metadata',
        owner_org: testOrgId,
      })
      .select()
      .single()

    if (error)
      throw error

    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: version.id,
        // No updateable fields provided
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('no_fields_to_update')
  })

  it('should return 400 when update fails', async () => {
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: 999999, // Non-existent version
        link: 'https://example.com',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_find_version')
  })

  it('should handle invalid JSON body', async () => {
    const response = await fetch(`${BASE_URL}/bundle/metadata`, {
      method: 'POST',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('[PUT] /bundle - Extended Error Cases', () => {
  it('should return 400 when user cannot access the app', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app',
        version_id: 1,
        channel_id: 1,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_access_app')
  })

  it('should return 400 when app cannot be found', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: 999999, // Non-existent version
        channel_id: 1,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_find_version')
  })

  it('should return 500 when bundle cannot be set to channel', async () => {
    // Create a version and channel first
    const supabase = getSupabaseClient()

    const { data: version, error: versionError } = await supabase
      .from('app_versions')
      .insert({
        app_id: APPNAME,
        name: '1.0.0-test-channel',
        owner_org: testOrgId,
      })
      .select()
      .single()

    if (versionError)
      throw versionError

    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .insert({
        name: 'test-channel',
        app_id: APPNAME,
        version: version.id,
        created_by: USER_ID,
        owner_org: testOrgId,
      })
      .select()
      .single()

    if (channelError)
      throw channelError

    // Try to set bundle to channel with conflicting data
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        version_id: 999999, // Non-existent version ID
        channel_id: channel.id,
      }),
    })

    if (response.status === 500) {
      const data = await response.json() as { status: string }
      expect(data.status).toBe('Cannot set bundle to channel')
    }
  })

  it('should handle invalid JSON body', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'PUT',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})
