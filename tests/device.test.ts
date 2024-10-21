import { beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, headers, resetAndSeedAppData, resetAndSeedAppDataStats } from './test-utils.ts'

const APPNAME = 'com.demo.app.device'

beforeAll(async () => {
  await Promise.all([resetAndSeedAppData(APPNAME), resetAndSeedAppDataStats(APPNAME)])
})

describe('[GET] /device operations', () => {
  it('all devices', async () => {
    const params = new URLSearchParams({ app_id: APPNAME })
    const response = await fetch(`${BASE_URL}/device?${params.toString()}&api=v2`, {
      method: 'GET',
      headers,
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })

  it('specific device', async () => {
    const params = new URLSearchParams({
      app_id: APPNAME,
      device_id: '00000000-0000-0000-0000-000000000000',
    })
    const response = await fetch(`${BASE_URL}/device?${params.toString()}&api=v2`, {
      method: 'GET',
      headers,
    })

    const data = await response.json<{ device_id: string }>()
    expect(response.status).toBe(200)
    expect(data.device_id).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('invalid app_id', async () => {
    const params = new URLSearchParams({ app_id: 'invalid_app' })
    const response = await fetch(`${BASE_URL}/device?${params.toString()}&api=v2`, {
      method: 'GET',
      headers,
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })

  it('invalid device_id', async () => {
    const params = new URLSearchParams({
      app_id: APPNAME,
      device_id: 'invalid_device',
    })
    const response = await fetch(`${BASE_URL}/device?${params.toString()}`, {
      method: 'GET',
      headers,
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })
})

describe('[POST] /device operations', () => {
  it('link device', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        device_id: 'test_device',
        version_id: '1.0.0',
        channel: 'no_access',
      }),
    })

    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'invalid_app',
        device_id: 'test_device',
      }),
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })
})

describe('[DELETE] /device operations', () => {
  it('unlink device', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        device_id: 'test_device',
        app_id: APPNAME,
      }),
    })

    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('invalid device_id', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        device_id: 'invalid_device',
        app_id: APPNAME,
      }),
    })
    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })
})
