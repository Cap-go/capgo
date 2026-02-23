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
    const response = await fetch(`${BASE_URL}/device?${params.toString()}`, {
      method: 'GET',
      headers,
    })

    const data = await response.json<{ data: unknown[], nextCursor?: string, hasMore: boolean }>()
    expect(response.status).toBe(200)
    expect(Array.isArray(data.data)).toBe(true)
    expect(typeof data.hasMore).toBe('boolean')
  })

  it.concurrent('specific device', async () => {
    // Use unique device ID for this test
    const deviceId = randomUUID()
    const params = new URLSearchParams({
      app_id: APPNAME_DEVICE,
      device_id: deviceId,
    })
    const response = await fetch(`${BASE_URL}/device?${params.toString()}`, {
      method: 'GET',
      headers,
    })

    const data = await response.json<{ device_id: string }>()
    expect(response.status).toBe(200)
    expect(data.device_id).toBe(deviceId)
  })

  it.concurrent('invalid app_id', async () => {
    const params = new URLSearchParams({ app_id: 'invalid_app' })
    const response = await fetch(`${BASE_URL}/device?${params.toString()}`, {
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
    expect(response.status).toBe(404)
  })
})

describe('[POST] /device operations', () => {
  // Each test gets its own unique device ID to avoid conflicts
  it('link device', async () => {
    const deviceId = randomUUID()

    const response = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME_DEVICE,
        device_id: deviceId,
        channel: 'no_access',
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json<{ status: string }>()
    expect(data.status).toBe('ok')

    // Verify the device was linked
    const params = new URLSearchParams({
      app_id: APPNAME_DEVICE,
      device_id: deviceId,
    })
    const getResponse = await fetch(`${BASE_URL}/device?${params.toString()}`, {
      method: 'GET',
      headers,
    })
    expect(getResponse.status).toBe(200)
    const deviceData = await getResponse.json<{ device_id: string, channel?: string }>()
    expect(deviceData.device_id).toBe(deviceId)
    expect(deviceData.channel).toBe('no_access')
  })

  it.concurrent('invalid app_id', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: 'invalid_app',
        device_id: randomUUID(),
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
        device_id: randomUUID(),
        version_id: '1.0.0',
      }),
    })
    await response.arrayBuffer()
    expect(response.status).toBe(400)
  })
})

describe('[DELETE] /device operations', () => {
  // Each test creates and deletes its own unique device
  it('unlink device', async () => {
    // First create a device to delete
    const deviceId = randomUUID()

    // Create the device
    const createResponse = await fetch(`${BASE_URL}/device`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME_DEVICE,
        device_id: deviceId,
        channel: 'no_access',
      }),
    })
    expect(createResponse.status).toBe(200)

    // Now delete it
    const deleteResponse = await fetch(`${BASE_URL}/device`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        device_id: deviceId,
        app_id: APPNAME_DEVICE,
      }),
    })

    expect(deleteResponse.status).toBe(200)
    const data = await deleteResponse.json<{ status: string }>()
    expect(data.status).toBe('ok')

    // Verify device is gone
    const params = new URLSearchParams({
      app_id: APPNAME_DEVICE,
      device_id: deviceId,
    })
    const getResponse = await fetch(`${BASE_URL}/device?${params.toString()}`, {
      method: 'GET',
      headers,
    })
    expect(getResponse.status).toBe(404)
  })

  it.concurrent('invalid device_id', async () => {
    const response = await fetch(`${BASE_URL}/device`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        device_id: randomUUID(),
        app_id: APPNAME_DEVICE,
      }),
    })
    const data = await response.json<{ status: string }>()
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })
})
