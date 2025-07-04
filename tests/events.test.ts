import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_NAME, BASE_URL, headers, resetAndSeedAppData, resetAndSeedAppDataStats, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APPNAME_EVENT = `${APP_NAME}.e.${id}`

beforeAll(async () => {
  await Promise.all([resetAndSeedAppData(APPNAME_EVENT), resetAndSeedAppDataStats(APPNAME_EVENT)])
})
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

  // it('track event with authorization jwt', async () => {
  //   const supabase = getSupabaseClient()

  //   const { data: magicLink, error: magicError } = await supabase.auth.admin.generateLink({
  //     type: 'magiclink',
  //     email: USER_EMAIL,
  //   })

  //   if (magicError) {
  //     console.error('generate_magic_link_error', magicError)
  //     throw new Error('generate_magic_link_error')
  //   }

  //   const { data: authData, error: authError } = await supabase.auth.verifyOtp({ token_hash: magicLink.properties.hashed_token, type: 'email' })

  //   if (authError) {
  //     console.error('auth_error', authError)
  //     throw new Error('auth_error')
  //   }

  //   const jwt = authData.session?.access_token

  //   const response = await fetch(`${BASE_URL}/private/events`, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //       'Authorization': `Bearer ${jwt}`,
  //     },
  //     body: JSON.stringify({
  //       channel: 'test',
  //       event: 'test_event',
  //       description: 'Testing event tracking',
  //       icon: '🧪',
  //       notify: false,
  //       tags: {
  //         app_id: APPNAME_EVENT,
  //         test: true,
  //       },
  //     }),
  //   })

  //   const data = await response.json() as { status: string }
  //   expect(response.status).toBe(200)
  //   expect(data.status).toBe('ok')
  // })

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
    expect(response.status).toBe(400)
  })

  it('track event with invalid apikey', async () => {
    const response = await fetch(`${BASE_URL}/private/events`, {
      method: 'POST',
      headers: {
        ...headers,
        capgkey: 'invalid_key',
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
    expect(response.status).toBe(400)
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
    expect(response.status).toBe(400)
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
})
