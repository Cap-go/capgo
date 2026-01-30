import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_NAME, BASE_URL, headers, resetAndSeedAppData, resetAppData } from './test-utils.ts'

const id = randomUUID()
const APPNAME_NAV = `${APP_NAME}.nav.${id}`

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME_NAV)
})

afterAll(async () => {
  await resetAppData(APPNAME_NAV)
})

describe('[POST] /private/navigation_events operations', () => {
  it('should send app:created navigation event with apikey', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        type: 'app:created',
        data: {
          appId: APPNAME_NAV,
        },
      }),
    })

    const data = await response.json() as { status: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('should send bundle:uploaded navigation event with apikey', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        type: 'bundle:uploaded',
        data: {
          appId: APPNAME_NAV,
          bundleId: '1.0.0',
          bundleName: 'Test Bundle',
        },
      }),
    })

    const data = await response.json() as { status: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('should send logs:error navigation event with apikey', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        type: 'logs:error',
        data: {
          appId: APPNAME_NAV,
        },
      }),
    })

    const data = await response.json() as { status: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('should reject invalid event type', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        type: 'invalid:type',
        data: {
          appId: APPNAME_NAV,
        },
      }),
    })

    expect(response.status).toBe(400)
  })

  it('should reject missing appId', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        type: 'app:created',
        data: {},
      }),
    })

    expect(response.status).toBe(400)
  })

  it('should reject bundle:uploaded without bundleId', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        type: 'bundle:uploaded',
        data: {
          appId: APPNAME_NAV,
        },
      }),
    })

    expect(response.status).toBe(400)
  })

  it('should reject request without authentication', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'app:created',
        data: {
          appId: APPNAME_NAV,
        },
      }),
    })

    expect(response.status).toBe(401)
  })

  it('should reject request with invalid apikey', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'capgkey': 'invalid_key',
      },
      body: JSON.stringify({
        type: 'app:created',
        data: {
          appId: APPNAME_NAV,
        },
      }),
    })

    expect(response.status).toBe(401)
  })

  it('should reject request for app not owned by user', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        type: 'app:created',
        data: {
          appId: 'com.nonexistent.app',
        },
      }),
    })

    expect(response.status).toBe(400)
  })

  it('should reject malformed body', async () => {
    const response = await fetch(`${BASE_URL}/private/navigation_events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: 'not json',
    })

    expect(response.status).toBe(400)
  })
})
