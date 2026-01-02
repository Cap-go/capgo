import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, resetAndSeedAppData, resetAppData } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.app.key.${id}`

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})

afterAll(async () => {
  await resetAppData(APPNAME)
})

describe('[GET] /apikey operations', () => {
  it('get api keys for the user', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'GET',
      headers,
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })

  it('get specific api key by id', async () => {
    // Using seeded API key ID 10 (dedicated test key)
    const response = await fetch(`${BASE_URL}/apikey/10`, {
      method: 'GET',
      headers,
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('id', 10)
  })

  it('get api key with invalid id', async () => {
    const response = await fetch(`${BASE_URL}/apikey/424242`, {
      method: 'GET',
      headers,
    })
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'failed_to_get_apikey')
    expect(response.status).toBe(404)
  })
})

describe('[POST] /apikey operations', () => {
  it('create api key', async () => {
    const keyName = 'test-key-creation'
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: keyName,
      }),
    })
    const data = await response.json<{ key: string, id: number }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('key')
    expect(data).toHaveProperty('id')
    expect(typeof data.key).toBe('string')
    expect(typeof data.id).toBe('number')

    // Verify the created key
    const verifyResponse = await fetch(`${BASE_URL}/apikey/${data.id}`, { headers })
    const verifyData = await verifyResponse.json() as { name: string }
    expect(verifyData.name).toBe(keyName)
  })

  it('create api key with missing name', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'name_is_required')
  })

  it('create api key with empty name', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '' }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'name_is_required')
  })

  it('create api key with invalid mode', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'test-key',
        mode: 'invalid_mode',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'invalid_mode')
  })

  it('create api key with non-existent org_id', async () => {
    const nonExistentOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'test-key',
        org_id: nonExistentOrgId,
      }),
    })
    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'org_not_found')
  })

  it('create api key with non-existent app_id', async () => {
    const nonExistentAppId = randomUUID()
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'test-key',
        app_id: nonExistentAppId,
      }),
    })
    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'app_not_found')
  })

  it('create api key with invalid JSON body', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('[PUT] /apikey/:id operations', () => {
  it('update api key name', async () => {
    // Using seeded API key ID 11 (dedicated test key for update name)
    const newName = 'updated-test-key-name'
    const response = await fetch(`${BASE_URL}/apikey/11`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: newName,
      }),
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('name', newName)

    // Verify the update
    const verifyResponse = await fetch(`${BASE_URL}/apikey/11`, { headers })
    const verifyData = await verifyResponse.json() as { name: string }
    expect(verifyData.name).toBe(newName)
  })

  it('update api key with invalid id', async () => {
    const response = await fetch(`${BASE_URL}/apikey/424242`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: 'wont-work' }),
    })
    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error')
  })

  it('update api key with invalid mode', async () => {
    // Using seeded API key ID 12 (dedicated test key for update mode)
    const response = await fetch(`${BASE_URL}/apikey/12`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        mode: 'invalid_mode',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toContain('invalid_mode')
  })

  it('update api key with invalid limited_to_apps format', async () => {
    // Using seeded API key ID 13 (dedicated test key for update apps)
    const response = await fetch(`${BASE_URL}/apikey/13`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        limited_to_apps: 'not_an_array',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'limited_to_apps_must_be_an_array_of_strings')
  })

  it('update api key with invalid limited_to_orgs format', async () => {
    // Create a temporary key for this test
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'temp-test-key' }),
    })
    const createData = await createResponse.json<{ id: number }>()

    const response = await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        limited_to_orgs: 'not_an_array',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'limited_to_orgs_must_be_an_array_of_strings')
  })

  it('update api key with no valid fields', async () => {
    // Create a temporary key for this test
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'temp-test-key-2' }),
    })
    const createData = await createResponse.json<{ id: number }>()

    const response = await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(500)
    const data = await response.json() as { error: string }
    expect(data.error).toContain('failed_to_update_apikey')
  })
})

describe('[DELETE] /apikey/:id operations', () => {
  it('delete api key', async () => {
    // Create a key specifically for deletion
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'key-to-delete' }),
    })
    const createData = await createResponse.json<{ id: number }>()

    const response = await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      method: 'DELETE',
      headers,
    })

    const data = await response.json() as { success: boolean }
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('success', true)

    // Verify deletion
    const verifyResponse = await fetch(`${BASE_URL}/apikey/${createData.id}`, { headers })
    expect(verifyResponse.status).toBe(404)
  })

  it('delete api key with invalid id', async () => {
    const response = await fetch(`${BASE_URL}/apikey/424242`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error')
  })

  it('delete already deleted api key', async () => {
    // Create and delete a key, then try to delete again
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'key-to-double-delete' }),
    })
    const createData = await createResponse.json<{ id: number }>()

    // First deletion
    await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      method: 'DELETE',
      headers,
    })

    // Second deletion attempt
    const response = await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error')
  })
})

describe('[POST] /apikey hashed key operations', () => {
  it('create hashed api key', async () => {
    const keyName = 'test-hashed-key'
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: keyName,
        hashed: true,
      }),
    })
    const data = await response.json<{ key: string, key_hash: string, id: number }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('key')
    expect(data).toHaveProperty('key_hash')
    expect(data).toHaveProperty('id')
    expect(typeof data.key).toBe('string')
    expect(typeof data.key_hash).toBe('string')
    // The key should be a UUID format
    expect(data.key).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i)
    // The key_hash should be a SHA-256 hex string (64 characters)
    expect(data.key_hash).toMatch(/^[\da-f]{64}$/i)

    // Verify the created key exists but key column in DB should be null
    const verifyResponse = await fetch(`${BASE_URL}/apikey/${data.id}`, { headers })
    const verifyData = await verifyResponse.json() as { name: string, key: string | null, key_hash: string }
    expect(verifyData.name).toBe(keyName)
    // In the database, the key should be null for hashed keys
    expect(verifyData.key).toBeNull()
    expect(verifyData.key_hash).toBe(data.key_hash)

    // Cleanup
    await fetch(`${BASE_URL}/apikey/${data.id}`, {
      method: 'DELETE',
      headers,
    })
  })

  it('create plain api key (hashed: false)', async () => {
    const keyName = 'test-plain-key-explicit'
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: keyName,
        hashed: false,
      }),
    })
    const data = await response.json<{ key: string, key_hash: string | null, id: number }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('key')
    expect(typeof data.key).toBe('string')
    // Plain key should not have key_hash set
    expect(data.key_hash).toBeNull()

    // Verify the key is stored in plain
    const verifyResponse = await fetch(`${BASE_URL}/apikey/${data.id}`, { headers })
    const verifyData = await verifyResponse.json() as { key: string, key_hash: string | null }
    expect(verifyData.key).toBe(data.key)
    expect(verifyData.key_hash).toBeNull()

    // Cleanup
    await fetch(`${BASE_URL}/apikey/${data.id}`, {
      method: 'DELETE',
      headers,
    })
  })

  it('create hashed api key with mode and limitations', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'hashed-key-with-options',
        hashed: true,
        mode: 'read',
      }),
    })
    const data = await response.json<{ key: string, key_hash: string, id: number, mode: string }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('key')
    expect(data).toHaveProperty('key_hash')
    expect(data.mode).toBe('read')

    // Cleanup
    await fetch(`${BASE_URL}/apikey/${data.id}`, {
      method: 'DELETE',
      headers,
    })
  })

  it('hashed key can be used for authentication', async () => {
    // Create a hashed key
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'hashed-key-for-auth-test',
        hashed: true,
      }),
    })
    const createData = await createResponse.json<{ key: string, id: number }>()
    expect(createResponse.status).toBe(200)

    // Use the plain key value to authenticate (the system should hash it and find the key)
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': createData.key,
    }

    // Try to list API keys using the hashed key for auth
    const listResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'GET',
      headers: authHeaders,
    })
    expect(listResponse.status).toBe(200)
    const listData = await listResponse.json()
    expect(Array.isArray(listData)).toBe(true)

    // Cleanup - use original headers since new key might have restrictions
    await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      method: 'DELETE',
      headers,
    })
  })
})

describe('[POST] /apikey hashed key with expiration', () => {
  it('create hashed api key with expiration date', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'hashed-key-with-expiration',
        hashed: true,
        expires_at: futureDate,
      }),
    })
    const data = await response.json<{ key: string, key_hash: string, id: number, expires_at: string }>()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('key')
    expect(data).toHaveProperty('key_hash')
    expect(data).toHaveProperty('expires_at')
    // Key should be UUID format
    expect(data.key).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i)
    // key_hash should be SHA-256 hex (64 chars)
    expect(data.key_hash).toMatch(/^[\da-f]{64}$/i)
    // expires_at should match what we sent
    expect(new Date(data.expires_at).getTime()).toBeCloseTo(new Date(futureDate).getTime(), -3)

    // Verify in DB: key should be null, key_hash and expires_at should be set
    const verifyResponse = await fetch(`${BASE_URL}/apikey/${data.id}`, { headers })
    const verifyData = await verifyResponse.json() as { key: string | null, key_hash: string, expires_at: string }
    expect(verifyData.key).toBeNull()
    expect(verifyData.key_hash).toBe(data.key_hash)
    expect(verifyData.expires_at).not.toBeNull()

    // Cleanup
    await fetch(`${BASE_URL}/apikey/${data.id}`, {
      method: 'DELETE',
      headers,
    })
  })

  it('hashed key with expiration can be used for authentication', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'hashed-key-expiration-auth-test',
        hashed: true,
        expires_at: futureDate,
      }),
    })
    const createData = await createResponse.json<{ key: string, id: number }>()
    expect(createResponse.status).toBe(200)

    // Use the plain key value to authenticate
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': createData.key,
    }

    const listResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'GET',
      headers: authHeaders,
    })
    expect(listResponse.status).toBe(200)
    const listData = await listResponse.json()
    expect(Array.isArray(listData)).toBe(true)

    // Cleanup
    await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      method: 'DELETE',
      headers,
    })
  })

  it('expired hashed key should be rejected for authentication', async () => {
    // Create a hashed key with future expiration
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'hashed-key-to-expire',
        hashed: true,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
    const createData = await createResponse.json<{ key: string, id: number }>()
    expect(createResponse.status).toBe(200)

    // Manually set the key to expired via direct DB update
    const { error } = await getSupabaseClient().from('apikeys')
      .update({ expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', createData.id)
    expect(error).toBeNull()

    // Try to use the expired hashed key for authentication
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': createData.key,
    }

    const listResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'GET',
      headers: authHeaders,
    })
    // Should be rejected as unauthorized
    expect(listResponse.status).toBe(401)
  })
})

describe('[RLS] hashed API key with direct Supabase SDK', () => {
  it('hashed key works with RLS via Supabase SDK (simulating CLI usage)', async () => {
    // Create a hashed key via API
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'hashed-key-rls-test',
        hashed: true,
      }),
    })
    const createData = await createResponse.json<{ key: string, id: number }>()
    expect(createResponse.status).toBe(200)

    // Now use the hashed key directly with Supabase SDK (bypassing our API)
    // This simulates how the CLI uses the SDK with capgkey header
    const supabaseWithHashedKey = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            capgkey: createData.key, // The plain key that user received
          },
        },
      },
    )

    // Try to query apps table - this goes through RLS which uses get_identity()
    const { data: apps, error: appsError } = await supabaseWithHashedKey
      .from('apps')
      .select('app_id, name')
      .limit(5)

    expect(appsError).toBeNull()
    expect(Array.isArray(apps)).toBe(true)

    // Also test calling an RPC that uses get_identity
    const { data: orgs, error: orgsError } = await supabaseWithHashedKey
      .rpc('get_orgs_v7')

    expect(orgsError).toBeNull()
    expect(Array.isArray(orgs)).toBe(true)

    // Cleanup
    await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      method: 'DELETE',
      headers,
    })
  })

  it('plain key still works with RLS via Supabase SDK', async () => {
    // Create a plain (non-hashed) key via API
    const createResponse = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'plain-key-rls-test',
        hashed: false,
      }),
    })
    const createData = await createResponse.json<{ key: string, id: number }>()
    expect(createResponse.status).toBe(200)

    // Use plain key with Supabase SDK
    const supabaseWithPlainKey = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            capgkey: createData.key,
          },
        },
      },
    )

    // Try to query apps table
    const { data: apps, error: appsError } = await supabaseWithPlainKey
      .from('apps')
      .select('app_id, name')
      .limit(5)

    expect(appsError).toBeNull()
    expect(Array.isArray(apps)).toBe(true)

    // Cleanup
    await fetch(`${BASE_URL}/apikey/${createData.id}`, {
      method: 'DELETE',
      headers,
    })
  })
})
