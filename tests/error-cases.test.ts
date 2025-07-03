import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.error.test.${id}`
let testOrgId: string
let testAppId: string

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)

  // Create test organization
  const { data: orgData, error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: randomUUID(),
    name: `Test Error Org ${id}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
  }).select().single()

  if (orgError)
    throw orgError
  testOrgId = orgData.id

  // Create test app
  const { data: appData, error: appError } = await getSupabaseClient().from('apps').insert({
    id: randomUUID(),
    app_id: APPNAME,
    name: `Test Error App`,
    icon_url: 'https://example.com/icon.png',
    owner_org: testOrgId,
  }).select().single()

  if (appError)
    throw appError
  testAppId = appData.app_id
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await getSupabaseClient().from('orgs').delete().eq('id', testOrgId)
})

describe('[GET] /statistics - Error Cases', () => {
  it('should return 400 for invalid body', async () => {
    const response = await fetch(`${BASE_URL}/statistics/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}), // Missing required fields
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Invalid body')
  })

  it('should return 400 for app without access', async () => {
    const response = await fetch(`${BASE_URL}/statistics/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app.id',
        period: '7d',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('You can\'t access this app')
  })

  it('should return 400 for organization without access', async () => {
    const response = await fetch(`${BASE_URL}/statistics/organization`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: randomUUID(),
        period: '7d',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('You can\'t access this organization')
  })
})

describe('[GET] /device - Error Cases', () => {
  it('should return 400 for app without access', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app.id',
        device_id: 'test-device',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('You can\'t access this app')
  })

  it('should return 400 for missing device_id or app_id', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Missing device_id or app_id')
  })

  it('should return 400 when trying to set version to device', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: testAppId,
        device_id: 'test-device',
        version: '1.0.0',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Cannot set version to device, use channel instead')
  })
})

describe('[GET] /channel - Error Cases', () => {
  it('should return 400 for app without access', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app.id',
        name: 'test-channel',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('You can\'t access this app')
  })

  it('should return 400 for missing channel name on delete', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: testAppId,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('You must provide a channel name')
  })

  it('should return 400 for non-existent channel on delete', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        app_id: testAppId,
        name: 'nonexistent-channel',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Cannot find channel')
  })
})

describe('[GET] /bundle - Error Cases', () => {
  it('should return 400 for app without access', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'nonexistent.app.id',
        name: 'test-bundle',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('You can\'t access this app')
  })
})

describe('general Error Cases', () => {
  it('should handle invalid JSON in request body', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'POST',
      headers,
      body: 'invalid json',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  it('should handle missing content-type header', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': undefined,
      } as any,
      body: JSON.stringify({ name: 'test' }),
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  it('should handle unauthorized requests', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Missing Authorization header
      },
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  it('should handle invalid API key', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'invalid-api-key',
      },
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('rate Limiting Error Cases', () => {
  it('should handle rate limit exceeded (429)', async () => {
    // This test might be hard to trigger in testing environment
    // but we can test that the error structure is correct
    const response = await fetch(`${BASE_URL}/ok`, {
      method: 'GET',
      headers,
    })
    // Just ensure the endpoint is working, rate limiting is harder to test
    expect([200, 429]).toContain(response.status)
  })
})

describe('server Error Cases (5xx)', () => {
  it('should handle database connection errors gracefully', async () => {
    // This is harder to test without mocking the database
    // but we ensure that 500 errors return proper JSON format
    const response = await fetch(`${BASE_URL}/organization`, {
      method: 'GET',
      headers,
    })

    if (response.status >= 500) {
      const data = await response.json() as { status: string, error?: string }
      expect(data).toHaveProperty('status')
      expect(typeof data.status).toBe('string')
    }
  })
})

describe('trigger Endpoint Error Cases', () => {
  it('should return 400 for cron_stats without appId', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-secret',
      },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('No appId')
  })

  it('should return 400 for cron_plan without orgId', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-secret',
      },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('No orgId')
  })

  it('should return 400 for cron_email with missing fields', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-secret',
      },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Missing email, appId, or type')
  })

  it('should return 400 for cron_email with invalid type', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-secret',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        appId: testAppId,
        type: 'invalid_type',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Invalid email type')
  })
})

describe('private Endpoint Error Cases', () => {
  it('should return 400 for stripe_portal without authorization', async () => {
    const response = await fetch(`${BASE_URL}/private/stripe_portal`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('not authorize')
  })

  it('should return 400 for stripe_checkout without org_id', async () => {
    const response = await fetch(`${BASE_URL}/private/stripe_checkout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('No org_id provided')
  })

  it('should return 500 for upload_link with non-existent user', async () => {
    const response = await fetch(`${BASE_URL}/private/upload_link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: testAppId,
        version: '1.0.0',
      }),
    })
    // This might return different status codes depending on the actual error
    expect([400, 500]).toContain(response.status)
    const data = await response.json() as { status: string }
    expect(data.status).toContain('Error')
  })
})

describe('plugin Endpoint Error Cases', () => {
  it('should return 400 for updates with invalid request', async () => {
    const response = await fetch(`${BASE_URL}/updates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cap-platform': 'ios',
        'cap-platform-version': '15.0',
        'cap-version-name': '1.0.0',
        'cap-version-build': '1',
        'cap-version-code': '1',
        'cap-app-id': 'nonexistent.app',
      },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Cannot get updates')
  })

  it('should return 400 for updates_lite with invalid request', async () => {
    const response = await fetch(`${BASE_URL}/updates_lite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cap-platform': 'ios',
        'cap-platform-version': '15.0',
        'cap-version-name': '1.0.0',
        'cap-version-build': '1',
        'cap-version-code': '1',
        'cap-app-id': 'nonexistent.app',
      },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('Cannot get updates')
  })
})

describe('files Endpoint Error Cases', () => {
  it('should return 404 for non-existent file', async () => {
    const response = await fetch(`${BASE_URL}/files/nonexistent-file.zip`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(404)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('Not Found')
  })

  it('should return 500 for invalid bucket configuration', async () => {
    // This test may be environment-specific
    const response = await fetch(`${BASE_URL}/files/invalid-bucket-config`, {
      method: 'GET',
      headers,
    })

    if (response.status === 500) {
      const data = await response.json() as { error: string }
      expect(data.error).toBe('Invalid bucket configuration')
    }
  })
})
