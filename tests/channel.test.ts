import { beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, headers, resetAndSeedAppData } from './test-utils.ts'

const APPNAME = 'com.demo.app.channel'

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})

describe('[GET] /channel operations', () => {
  it('get channels', async () => {
    const params = new URLSearchParams({ app_id: APPNAME })
    const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
      method: 'GET',
      headers,
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })

  it('get specific channel', async () => {
    const params = new URLSearchParams({ app_id: APPNAME, channel: 'production' })
    const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
      method: 'GET',
      headers,
    })

    const data = await response.json<{ name: string }>()
    expect(response.status).toBe(200)
    expect(data.name).toBe('production')
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
      }),
    })
    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
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
