import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isValidAppId } from '../supabase/functions/_backend/utils/utils.ts'
import { BASE_URL, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const VALID_APPNAME = `com.app.valid.${id}`
let testOrgId: string

beforeAll(async () => {
  await resetAndSeedAppData(VALID_APPNAME)

  // Create test organization
  const { data: orgData, error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: randomUUID(),
    name: `Test App ID Validation Org ${id}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
  }).select().single()

  if (orgError)
    throw orgError
  testOrgId = orgData.id
})

afterAll(async () => {
  await resetAppData(VALID_APPNAME)
  await getSupabaseClient().from('orgs').delete().eq('id', testOrgId)
})

describe('isValidAppId helper function', () => {
  it('should accept valid reverse domain app IDs', () => {
    expect(isValidAppId('com.example.app')).toBe(true)
    expect(isValidAppId('ee.forgr.demoapp')).toBe(true)
    expect(isValidAppId('com.company.product-name')).toBe(true)
    expect(isValidAppId('com.company.product_name')).toBe(true)
    expect(isValidAppId('io.ionic.starter')).toBe(true)
  })

  it('should reject invalid app IDs', () => {
    expect(isValidAppId('')).toBe(false)
    expect(isValidAppId('app')).toBe(false)
    expect(isValidAppId('app_name')).toBe(false)
    expect(isValidAppId('.com.example')).toBe(false)
    expect(isValidAppId('com.example.')).toBe(false)
    expect(isValidAppId('com..example')).toBe(false)
    expect(isValidAppId('com.example.app+')).toBe(false)
    expect(isValidAppId('[appid]')).toBe(false)
  })

  it('should reject empty or null values', () => {
    expect(isValidAppId('')).toBe(false)
    expect(isValidAppId(null as any)).toBe(false)
    expect(isValidAppId(undefined as any)).toBe(false)
  })
})

describe('[POST] /app - app_id validation', () => {
  it('should reject app creation with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'invalid-app-id',
        name: 'Test App',
        owner_org: testOrgId,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })

  it('should reject app creation with app_id without domain', async () => {
    const response = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'justappname',
        name: 'Test App',
        owner_org: testOrgId,
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })

  it('should accept app creation with valid app_id', async () => {
    const validAppId = `com.test.valid.${randomUUID()}`
    const response = await fetch(`${BASE_URL}/app`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: validAppId,
        name: 'Test Valid App',
        owner_org: testOrgId,
      }),
    })
    expect(response.status).toBe(200)
    const data = await response.json() as { app_id: string }
    expect(data.app_id).toBe(validAppId)

    // Cleanup
    await getSupabaseClient().from('apps').delete().eq('app_id', validAppId)
  })
})

describe('[POST] /bundle - app_id validation', () => {
  it('should reject bundle creation with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'invalid-app',
        version: '1.0.0',
        external_url: 'https://example.com/bundle.zip',
        checksum: 'abc123',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })

  it('should reject bundle creation with app_id starting with dot', async () => {
    const response = await fetch(`${BASE_URL}/bundle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: '.com.example.app',
        version: '1.0.0',
        external_url: 'https://example.com/bundle.zip',
        checksum: 'abc123',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[POST] /channel - app_id validation', () => {
  it('should reject channel creation with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'nodomainapp',
        channel: 'test-channel',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })

  it('should reject channel creation with special characters in app_id', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'com.example.app+special',
        channel: 'test-channel',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[POST] /device - app_id validation', () => {
  it('should reject device link with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'badappid',
        device_id: '00000000-0000-0000-0000-000000000000',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[GET] /app/:id - app_id validation', () => {
  it('should reject getting app with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/app/invalid-app-id`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })

  it('should reject getting app with app_id containing brackets', async () => {
    const response = await fetch(`${BASE_URL}/app/[appid]`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[PUT] /app/:id - app_id validation', () => {
  it('should reject updating app with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/app/no-domain`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        name: 'Updated Name',
      }),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[DELETE] /app/:id - app_id validation', () => {
  it('should reject deleting app with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/app/justname`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[GET] /bundle - app_id validation', () => {
  it('should reject getting bundles with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle?app_id=invalid`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[DELETE] /bundle - app_id validation', () => {
  it('should reject deleting bundle with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/bundle?app_id=badid&version=1.0.0`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[GET] /channel - app_id validation', () => {
  it('should reject getting channels with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/channel?app_id=wrongformat`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[DELETE] /channel - app_id validation', () => {
  it('should reject deleting channel with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/channel?app_id=bad&channel=production`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[GET] /device - app_id validation', () => {
  it('should reject getting devices with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/device?app_id=wrongformat`, {
      method: 'GET',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})

describe('[DELETE] /device - app_id validation', () => {
  it('should reject deleting device override with invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/device?app_id=bad&device_id=00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
      headers,
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('invalid_app_id')
  })
})
