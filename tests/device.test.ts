import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_NAME, BASE_URL, headers, resetAndSeedAppData, resetAndSeedAppDataStats, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APPNAME_DEVICE = `${APP_NAME}.d.${id}`

beforeAll(async () => {
  await Promise.all([resetAndSeedAppData(APPNAME_DEVICE), resetAndSeedAppDataStats(APPNAME_DEVICE)])
})
afterAll(async () => {
  await resetAppData(APPNAME_DEVICE)
  await resetAppDataStats(APPNAME_DEVICE)
})

describe.concurrent('[GET] /device operations', () => {
  it.concurrent('all devices', async () => {
    const params = new URLSearchParams({ app_id: APPNAME_DEVICE })
    const response = await fetch(`${BASE_URL}/device?${params.toString()}&api=v2`, {
      method: 'GET',
      headers,
    })

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })

  it.concurrent('specific device', async () => {
    const params = new URLSearchParams({
      app_id: APPNAME_DEVICE,
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

  it.concurrent('invalid app_id', async () => {
    const params = new URLSearchParams({ app_id: 'invalid_app' })
    const response = await fetch(`${BASE_URL}/device?${params.toString()}&api=v2`, {
      method: 'GET',
      headers,
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })

  it.concurrent('invalid device_id', async () => {
    const params = new URLSearchParams({
      app_id: APPNAME_DEVICE,
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
        app_id: APPNAME_DEVICE,
        device_id: 'test_device',
        channel: 'no_access',
      }),
    })

    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.error).toBe('ok')
  })

  it.concurrent('invalid app_id', async () => {
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

  it.concurrent('invalid version_id', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME_DEVICE,
        device_id: 'test_device',
        version_id: '1.0.0',
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
        app_id: APPNAME_DEVICE,
      }),
    })

    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.error).toBe('ok')
  })

  it.concurrent('invalid device_id', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        device_id: 'invalid_device',
        app_id: APPNAME_DEVICE,
      }),
    })
    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.error).toBe('ok')
  })
})
