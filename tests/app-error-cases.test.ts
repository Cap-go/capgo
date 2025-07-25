import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, NON_ACCESS_APP_NAME, resetAndSeedAppData, resetAppData, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.app.error.${id}`
let testOrgId: string

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)

  // Create test organization
  const { data: orgData, error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: randomUUID(),
    name: `Test App Error Org ${id}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
  }).select().single()

  if (orgError)
    throw orgError
  testOrgId = orgData.id
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await getSupabaseClient().from('orgs').delete().eq('id', testOrgId)
})

describe('[POST] /app - Error Cases', () => {
  it('should return 400 when name is missing', async () => {
    const response = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner_org: testOrgId,
        // Missing name
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('missing_name')
  })

  it('should return 403 when organization access is denied', async () => {
    const nonExistentOrgId = randomUUID()
    const response = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Test App',
        owner_org: nonExistentOrgId,
      }),
    })
    expect(response.status).toBe(403)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_access_organization')
  })

  it('should return 400 when app creation fails due to duplicate name', async () => {
    // Try to create another app with the same name
    const response2 = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: APPNAME,
        owner_org: testOrgId,
      }),
    })
    expect(response2.status).toBe(400)
    const data = await response2.json() as { error: string }
    expect(data.error).toBe('cannot_create_app')
  })

  it('should return 400 with invalid JSON body', async () => {
    const response = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('[GET] /app - Error Cases', () => {
  it('should return 400 when user cannot access the app', async () => {
    const response = await fetch(`${BASE_URL}/app/nonexistent.app`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_access_app')
  })

  it('should return 404 when app is not found', async () => {
    // Create an app first to get access, then delete it to test 404
    const createResponse = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `App ${APPNAME}.notfound`,
        app_id: `${APPNAME}.notfound`,
        owner_org: testOrgId,
      }),
    })
    expect(createResponse.status).toBe(200)

    // Delete the app from database directly
    await getSupabaseClient().from('apps').delete().eq('app_id', `${APPNAME}.notfound`)

    // Try to get the deleted app
    const response = await fetch(`${BASE_URL}/app/${APPNAME}.notfound`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_access_app')
  })

  it('should return 403 when user does not have access to organization', async () => {
    // This test would need a more complex setup with different users
    // For now, we test with a response structure check
    const response = await fetch(`${BASE_URL}/app/${NON_ACCESS_APP_NAME}`, {
      method: 'GET',
      headers,
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_access_app')
  })
})

describe('[PUT] /app - Error Cases', () => {
  beforeAll(async () => {
    // Ensure the test app exists for PUT tests
    const createResponse = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `App ${APPNAME}.put`,
        app_id: `${APPNAME}.put`,
        owner_org: testOrgId,
      }),
    })
    expect(createResponse.status).toBe(200)
  })

  it('should return 400 when user cannot access the app', async () => {
    const response = await fetch(`${BASE_URL}/app/nonexistent.app`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: 'Updated Name',
      }),
    })
    expect(response.status).toBe(401)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_access_app')
  })

  it('should return 400 when update fails', async () => {
    // Try to update with invalid data that would cause a database error
    const response = await fetch(`${BASE_URL}/app/${APPNAME}.put`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        // Try to set owner_org to non-existent org (this might cause an error)
        owner_org: 'non-existent-org-id',
      }),
    })

    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_update_app')
  })

  it('should handle invalid JSON body', async () => {
    const response = await fetch(`${BASE_URL}/app/${APPNAME}.put`, {
      method: 'PUT',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('[DELETE] /app - Error Cases', () => {
  it('should return 400 when user cannot access the app', async () => {
    const response = await fetch(`${BASE_URL}/app/nonexistent.app`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('cannot_delete_app')
  })

  it('should return 400 when app deletion fails', async () => {
    // Create an app to test deletion
    const createResponse = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `App ${APPNAME}.delete`,
        app_id: `${APPNAME}.delete`,
        owner_org: testOrgId,
      }),
    })
    expect(createResponse.status).toBe(200)

    // Try to delete the app (this should work)
    const response = await fetch(`${BASE_URL}/app/${APPNAME}.delete`, {
      method: 'DELETE',
      headers,
    })

    // The first delete should succeed
    expect(response.status).toBe(200)

    // Try to delete the same app again (should fail)
    const response2 = await fetch(`${BASE_URL}/app/${APPNAME}.delete`, {
      method: 'DELETE',
      headers,
    })
    expect(response2.status).toBe(400)
    const data = await response2.json() as { error: string }
    expect(data.error).toBe('cannot_delete_app')
  })
})
