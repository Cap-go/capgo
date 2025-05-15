import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, headers, resetAndSeedAppData, resetAppData } from './test-utils.ts'

// Note: We need a way to get a valid API key ID for PUT and DELETE tests.
// Assuming resetAndSeedAppData creates a default app and potentially an API key we can query?
// Or we might need to create one in the POST test and store its ID.
let createdApiKeyId: number | null = null // To store the ID of the key created in POST test

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
    // Assuming the test user has at least one key after seeding
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'GET',
      headers,
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    // Add more specific checks if needed, e.g., checking the structure of the returned keys
  })

  // GET specific key might require knowing an ID beforehand or using the one created in POST
  it('get specific api key by id', async () => {
    if (!createdApiKeyId) {
      console.warn('Skipping GET specific API key test as no key ID is available.')
      return
    }
    const response = await fetch(`${BASE_URL}/apikey/${createdApiKeyId}`, {
      method: 'GET',
      headers,
    })

    const data = await response.json() // Adjust type if specific structure is known
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('id', createdApiKeyId) // Or check other properties like 'name'
  })

  it('get api key with invalid id', async () => {
    const response = await fetch(`${BASE_URL}/apikey/424242`, {
      method: 'GET',
      headers,
    })
    const data = await response.json()
    expect(data).toHaveProperty('error', 'Failed to get API key')
    expect(response.status).toBe(404) // Assuming 404 for not found
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
        // Add other required fields based on post.ts, like limited_to_orgs if needed
        // Example: limited_to_orgs: []
      }),
    })
    const data = await response.json<{ key: string, id: number }>() // Assuming response structure based on post.ts
    expect(response.status).toBe(200) // Or 201 Created
    expect(data).toHaveProperty('key')
    expect(data).toHaveProperty('id')
    expect(typeof data.key).toBe('string')
    expect(typeof data.id).toBe('number')
    createdApiKeyId = data.id // Store the ID for later tests
    const verifyResponse = await fetch(`${BASE_URL}/apikey/${createdApiKeyId}`, { headers })
    const verifyData = await verifyResponse.json() as { name: string } // Add type assertion
    expect(verifyData.name).toBe(keyName)
  })

  it('create api key with missing name', async () => {
    const response = await fetch(`${BASE_URL}/apikey`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}), // Missing name
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400) // Assuming 400 for bad request
  })
})

describe('[PUT] /apikey/:id operations', () => {
  it('update api key name', async () => {
    if (!createdApiKeyId) {
      console.warn('Skipping PUT API key test as no key ID is available.')
      return
    }
    const newName = 'updated-test-key-name'
    const response = await fetch(`${BASE_URL}/apikey/${createdApiKeyId}`, { // Path parameter
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: newName,
        // Include other fields to update based on PUT.ts
      }),
    })

    const data = await response.json() // Check response structure based on PUT.ts
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('name', newName) // Assuming success indicator
    // Optional: Verify the update with a GET request
    const verifyResponse = await fetch(`${BASE_URL}/apikey/${createdApiKeyId}`, { headers })
    const verifyData = await verifyResponse.json() as { name: string } // Add type assertion
    expect(verifyData.name).toBe(newName)
  })

  it('update api key with invalid id', async () => {
    const response = await fetch(`${BASE_URL}/apikey/424242`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ name: 'wont-work' }),
    })
    await response.arrayBuffer()
    expect(response.status).toBe(404) // Assuming 404 for not found
  })

  // Add more PUT tests for different scenarios (e.g., updating permissions)
})

describe('[DELETE] /apikey/:id operations', () => {
  it('delete api key', async () => {
    if (!createdApiKeyId) {
      console.warn('Skipping DELETE API key test as no key ID is available.')
      return
    }
    const response = await fetch(`${BASE_URL}/apikey/${createdApiKeyId}`, { // Path parameter
      method: 'DELETE',
      headers,
      // DELETE body is usually ignored, but check delete.ts if it expects one
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('success', true) // Assuming success indicator

    // Optional: Verify deletion with a GET request (should be 404)
    const verifyResponse = await fetch(`${BASE_URL}/apikey/${createdApiKeyId}`, { headers })
    expect(verifyResponse.status).toBe(404)

    createdApiKeyId = null // Clear the ID as it's deleted
  })

  it('delete api key with invalid id', async () => {
    const response = await fetch(`${BASE_URL}/apikey/424242`, {
      method: 'DELETE',
      headers,
    })
    await response.arrayBuffer()
    expect(response.status).toBe(404) // Assuming 404 for not found
  })

  it('delete already deleted api key', async () => {
    // Use a key ID that was just deleted or known not to exist
    // Re-use the invalid ID test or ensure createdApiKeyId is null from previous test
    const idToDelete = createdApiKeyId ?? 'previously_deleted_or_invalid_id'
    if (idToDelete === 'previously_deleted_or_invalid_id' && createdApiKeyId === null) {
      // If we are sure the previous test deleted it, we can proceed
    }
    else if (!createdApiKeyId) {
      console.warn('Skipping re-delete test, no suitable key ID.')
      return
    }

    const response = await fetch(`${BASE_URL}/apikey/${idToDelete}`, {
      method: 'DELETE',
      headers,
    })
    await response.arrayBuffer()
    expect(response.status).toBe(404) // Should still be 404 if it doesn't exist
  })
})
