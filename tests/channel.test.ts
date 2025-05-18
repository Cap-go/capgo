import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.app.c.${id}`

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})
afterAll(async () => {
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
})

describe('[GET] /channel operations', () => {
  it('get channels', async () => {
    const params = new URLSearchParams({ app_id: APPNAME })
    const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
      method: 'GET',
      headers,
    })

    const data = await response.json()
    console.log(data)
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })

  it('get channels includes public field channel', async () => {
    const params = new URLSearchParams({ app_id: APPNAME })
    const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
      method: 'GET',
      headers,
    })

    const data = await response.json()
    for (const o of data as any[]) {
      expect(o.public).toBeDefined()
    }
  })

  it('get specific channel', async () => {
    const params = new URLSearchParams({ app_id: APPNAME, channel: 'production' })
    const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
      method: 'GET',
      headers,
    })

    const data = await response.json<{ name: string, public: boolean }>()
    expect(response.status).toBe(200)
    expect(data.name).toBe('production')
    expect(data.public).toBe(true)
  })

  it('invalid app_id', async () => {
    const params = new URLSearchParams({ app_id: 'invalid_app' })
    const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
      method: 'GET',
      headers,
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })
})

describe('[POST] /channel operations', () => {
  it('create channel', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        channel: 'test_channel',
        public: true,
        android: true,
        ios: true,
      }),
    })
    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')

    // verify default channel
    const { data: app, error: dbError } = await getSupabaseClient()
      .from('apps')
      .select(`
        default_channel_android:channels!default_channel_android(name, id),
        default_channel_ios:channels!default_channel_ios(name, id)
      `)
      .eq('app_id', APPNAME)
      .single()
    if (dbError) {
      console.log('Cannot find app', dbError)
      throw dbError
    }
    expect(app.default_channel_android?.name).toBe('test_channel')
    expect(app.default_channel_ios?.name).toBe('test_channel')
    // I assume that both the android and ios default channels are the same
    expect(app.default_channel_android?.id).toBe(app.default_channel_ios?.id)
  })

  it('update channel', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        channel: 'production',
        disableAutoUpdateUnderNative: false,
      }),
    })

    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'invalid_app',
        channel: 'test_channel',
      }),
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })
})

describe('[DELETE] /channel operations', () => {
  it('invalid channel', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        channel: 'invalid_channel',
        app_id: APPNAME,
      }),
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })

  it('delete channel', async () => {
    const response = await fetch(`${BASE_URL}/channel`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        channel: 'production',
        app_id: APPNAME,
      }),
    })

    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })
})
