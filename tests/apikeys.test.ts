import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, headers, resetAndSeedAppData, resetAppData } from './test-utils.ts'

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
