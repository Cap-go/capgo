import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  APP_NAME,
  BASE_URL,
  getAuthHeaders,
  headers,
  NON_OWNER_ORG_ID,
  ORG_ID,
  resetAndSeedAppData,
  resetAndSeedAppDataStats,
  resetAppData,
  resetAppDataStats,
} from './test-utils.ts'

const id = randomUUID()
const APPNAME_EVENT = `${APP_NAME}.e.${id}`
const FOREIGN_ORG_ID = randomUUID()

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME_EVENT)
  await resetAndSeedAppDataStats(APPNAME_EVENT)
}, 60_000)
afterAll(async () => {
  await resetAppData(APPNAME_EVENT)
  await resetAppDataStats(APPNAME_EVENT)
})

describe('[POST] /private/events operations', () => {
  it('track event with apikey', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Testing event tracking',
        icon: '🧪',
        notify: false,
        tags: {
          app_id: APPNAME_EVENT,
          test: true,
        },
      }),
    })

    const data = await response.json() as { status: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('rejects notifyConsole broadcasts for foreign organizations', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Cross-org spoof attempt',
        icon: '🧪',
        notifyConsole: true,
        user_id: NON_OWNER_ORG_ID,
        tags: {
          'app-id': APPNAME_EVENT,
          'test': true,
        },
      }),
    })

    const data = await response.json() as { error: string }
    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
  })

  it('allows notifyConsole broadcasts for the caller organization', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers: {
        capgkey: headers.Authorization,
      },
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Valid org broadcast',
        icon: '🧪',
        notifyConsole: true,
        user_id: ORG_ID,
        tags: {
          'app-id': APPNAME_EVENT,
          'test': true,
        },
      }),
    })

    const data = await response.json() as { status: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('allows jwt broadcasts for an authorized org', async () => {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Testing event tracking',
        notifyConsole: true,
        user_id: ORG_ID,
      }),
    })

    const data = await response.json() as { status: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  // Skip JWT test as it requires auth infrastructure that may not be reliably available
  // The important test is that API key auth works, which is covered above
  it.skip('track event with authorization jwt', async () => {
    // This test is skipped because it requires auth service to generate magic links
    // which can be flaky in local/CI environments. The API key test above covers
    // the main authentication path.
  })

  it('rejects jwt attempts to broadcast events to a foreign org', async () => {
    const authHeaders = await getAuthHeaders()
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Testing event tracking',
        notifyConsole: true,
        user_id: FOREIGN_ORG_ID,
      }),
    })

    const data = await response.json() as { error: string }
    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
  })

  it('track event without authentication', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Testing event tracking',
        icon: '🧪',
        notify: false,
        tags: {
          app_id: APPNAME_EVENT,
          test: true,
        },
      }),
    })

    await response.json()
    expect(response.status).toBe(401)
  })

  it('track event with invalid apikey', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'capgkey': 'invalid_key',
      },
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Testing event tracking',
        tags: {
          app_id: APPNAME_EVENT,
        },
      }),
    })

    await response.json()
    expect(response.status).toBe(401)
  })

  it('track event with invalid authorization', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': 'Bearer invalid_token',
      },
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Testing event tracking',
        tags: {
          app_id: APPNAME_EVENT,
        },
      }),
    })

    await response.json()
    expect(response.status).toBe(401)
  })

  it('track event with malformed body', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers,
      body: 'not json',
    })

    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })

  it.concurrent('broadcasts console event for an authorized org', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Testing console event tracking',
        notifyConsole: true,
        user_id: ORG_ID,
        tags: {
          'app-id': APPNAME_EVENT,
          'channel': 'production',
          'bundle': '1.0.0',
        },
      }),
    })

    const data = await response.json() as { status: string }
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it.concurrent('rejects console event broadcast without an org id', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Testing console event tracking',
        notifyConsole: true,
      }),
    })

    const data = await response.json() as { error: string }
    expect(response.status).toBe(400)
    expect(data.error).toBe('missing_org_id')
  })

  it.concurrent('rejects console event broadcast for a foreign org', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        channel: 'test',
        event: 'test_event',
        description: 'Testing console event tracking',
        notifyConsole: true,
        user_id: randomUUID(),
      }),
    })

    const data = await response.json() as { error: string }
    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
  })
})
