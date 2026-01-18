import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getBaseData, PLUGIN_BASE_URL, resetAndSeedAppData, resetAppData, resetAppDataStats, headers } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.ratelimit.${id}`

async function fetchChannelSelfEndpoint(method: 'POST' | 'PUT' | 'DELETE', bodyIn: object) {
  const url = new URL(`${PLUGIN_BASE_URL}/channel_self`)
  if (method === 'DELETE') {
    for (const [key, value] of Object.entries(bodyIn))
      url.searchParams.append(key, value.toString())
  }

  const body = method !== 'DELETE' ? JSON.stringify(bodyIn) : undefined
  const response = await fetch(url, {
    method,
    body,
  })

  return response
}

async function fetchGetChannels(queryParams: Record<string, string>) {
  const url = new URL(`${PLUGIN_BASE_URL}/channel_self`)
  for (const [key, value] of Object.entries(queryParams))
    url.searchParams.append(key, value)

  const response = await fetch(url, {
    method: 'GET',
  })

  return response
}

async function fetchDeviceApi(method: 'POST' | 'GET' | 'DELETE', params: Record<string, string>) {
  const url = new URL(`${BASE_URL}/device`)

  if (method === 'GET') {
    for (const [key, value] of Object.entries(params))
      url.searchParams.append(key, value)
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (method !== 'GET') {
    options.body = JSON.stringify(params)
  }

  return fetch(url, options)
}

/**
 * Helper to wait for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
})

describe('channel_self rate limiting', () => {
  describe('[POST] /channel_self rate limiting (set operation)', () => {
    it('should allow first set request', async () => {
      const data = getBaseData(APPNAME)
      data.device_id = randomUUID().toLowerCase()

      const response = await fetchChannelSelfEndpoint('POST', data)
      // First request should succeed (200) or return channel_not_found/other expected errors
      expect(response.status).not.toBe(429)
    })

    it('should rate limit immediate second set request with same device', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // First request
      const response1 = await fetchChannelSelfEndpoint('POST', data)
      expect(response1.status).not.toBe(429)

      // Immediate second request should be rate limited
      const response2 = await fetchChannelSelfEndpoint('POST', data)
      expect(response2.status).toBe(429)
      const json = await response2.json<{ error: string }>()
      expect(json.error).toBe('too_many_requests')
    })

    it('should allow set request after 1 second delay', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // First request
      const response1 = await fetchChannelSelfEndpoint('POST', data)
      expect(response1.status).not.toBe(429)

      // Wait 1.1 seconds
      await sleep(1100)

      // Second request should succeed (not rate limited)
      const response2 = await fetchChannelSelfEndpoint('POST', data)
      expect(response2.status).not.toBe(429)
    })

    it('should rate limit same channel set within 60 seconds', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId
      data.channel = 'production'

      // First request
      const response1 = await fetchChannelSelfEndpoint('POST', data)
      expect(response1.status).not.toBe(429)

      // Wait for operation rate limit to expire (1+ second)
      await sleep(1100)

      // Second request with SAME channel should still be rate limited (60 second rule)
      const response2 = await fetchChannelSelfEndpoint('POST', data)
      expect(response2.status).toBe(429)
    })

    it('should allow set with different channel after 1 second delay', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId
      data.channel = 'production'

      // First request with channel 'production'
      const response1 = await fetchChannelSelfEndpoint('POST', data)
      expect(response1.status).not.toBe(429)

      // Wait for operation rate limit to expire
      await sleep(1100)

      // Second request with DIFFERENT channel should succeed
      data.channel = 'beta'
      const response2 = await fetchChannelSelfEndpoint('POST', data)
      expect(response2.status).not.toBe(429)
    })
  })

  describe('[PUT] /channel_self rate limiting (get operation)', () => {
    it('should allow first get request', async () => {
      const data = getBaseData(APPNAME)
      data.device_id = randomUUID().toLowerCase()

      const response = await fetchChannelSelfEndpoint('PUT', data)
      expect(response.status).not.toBe(429)
    })

    it('should rate limit immediate second get request', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // First request
      const response1 = await fetchChannelSelfEndpoint('PUT', data)
      expect(response1.status).not.toBe(429)

      // Immediate second request should be rate limited
      const response2 = await fetchChannelSelfEndpoint('PUT', data)
      expect(response2.status).toBe(429)
    })

    it('should allow get request after 1 second delay', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // First request
      const response1 = await fetchChannelSelfEndpoint('PUT', data)
      expect(response1.status).not.toBe(429)

      // Wait 1.1 seconds
      await sleep(1100)

      // Second request should succeed
      const response2 = await fetchChannelSelfEndpoint('PUT', data)
      expect(response2.status).not.toBe(429)
    })
  })

  describe('[DELETE] /channel_self rate limiting (delete operation)', () => {
    it('should allow first delete request', async () => {
      const data = getBaseData(APPNAME)
      data.device_id = randomUUID().toLowerCase()

      const response = await fetchChannelSelfEndpoint('DELETE', data)
      expect(response.status).not.toBe(429)
    })

    it('should rate limit immediate second delete request', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // First request
      const response1 = await fetchChannelSelfEndpoint('DELETE', data)
      expect(response1.status).not.toBe(429)

      // Immediate second request should be rate limited
      const response2 = await fetchChannelSelfEndpoint('DELETE', data)
      expect(response2.status).toBe(429)
    })

    it('should allow delete request after 1 second delay', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // First request
      const response1 = await fetchChannelSelfEndpoint('DELETE', data)
      expect(response1.status).not.toBe(429)

      // Wait 1.1 seconds
      await sleep(1100)

      // Second request should succeed
      const response2 = await fetchChannelSelfEndpoint('DELETE', data)
      expect(response2.status).not.toBe(429)
    })
  })

  describe('[GET] /channel_self rate limiting (list operation)', () => {
    it('should allow first list request', async () => {
      const data = getBaseData(APPNAME)
      data.device_id = randomUUID().toLowerCase()

      const response = await fetchGetChannels(data as any)
      expect(response.status).not.toBe(429)
    })

    it('should rate limit immediate second list request', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // First request
      const response1 = await fetchGetChannels(data as any)
      expect(response1.status).not.toBe(429)

      // Immediate second request should be rate limited
      const response2 = await fetchGetChannels(data as any)
      expect(response2.status).toBe(429)
    })

    it('should allow list request after 1 second delay', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // First request
      const response1 = await fetchGetChannels(data as any)
      expect(response1.status).not.toBe(429)

      // Wait 1.1 seconds
      await sleep(1100)

      // Second request should succeed
      const response2 = await fetchGetChannels(data as any)
      expect(response2.status).not.toBe(429)
    })
  })

  describe('cross-operation rate limiting independence', () => {
    it('should NOT rate limit different operations on same device', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // POST request (set operation)
      const response1 = await fetchChannelSelfEndpoint('POST', data)
      expect(response1.status).not.toBe(429)

      // PUT request (get operation) immediately after - should NOT be rate limited
      const response2 = await fetchChannelSelfEndpoint('PUT', data)
      expect(response2.status).not.toBe(429)

      // DELETE request (delete operation) immediately after - should NOT be rate limited
      const response3 = await fetchChannelSelfEndpoint('DELETE', data)
      expect(response3.status).not.toBe(429)

      // GET request (list operation) immediately after - should NOT be rate limited
      const response4 = await fetchGetChannels(data as any)
      expect(response4.status).not.toBe(429)
    })

    it('should rate limit each operation independently', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // First POST request
      const response1 = await fetchChannelSelfEndpoint('POST', data)
      expect(response1.status).not.toBe(429)

      // First PUT request - should NOT be rate limited (different operation)
      const response2 = await fetchChannelSelfEndpoint('PUT', data)
      expect(response2.status).not.toBe(429)

      // Second POST request - SHOULD be rate limited
      const response3 = await fetchChannelSelfEndpoint('POST', data)
      expect(response3.status).toBe(429)

      // Second PUT request - SHOULD be rate limited
      const response4 = await fetchChannelSelfEndpoint('PUT', data)
      expect(response4.status).toBe(429)
    })
  })
})

describe('device API rate limiting', () => {
  describe('[POST] /device rate limiting (set operation)', () => {
    it('should allow first set request', async () => {
      const deviceId = randomUUID().toLowerCase()
      const response = await fetchDeviceApi('POST', {
        app_id: APPNAME,
        device_id: deviceId,
        channel: 'production',
      })
      expect(response.status).not.toBe(429)
    })

    it('should rate limit immediate second set request', async () => {
      const deviceId = randomUUID().toLowerCase()
      const params = {
        app_id: APPNAME,
        device_id: deviceId,
        channel: 'production',
      }

      // First request
      const response1 = await fetchDeviceApi('POST', params)
      expect(response1.status).not.toBe(429)

      // Immediate second request should be rate limited
      const response2 = await fetchDeviceApi('POST', params)
      expect(response2.status).toBe(429)
    })

    it('should allow set request after 1 second delay', async () => {
      const deviceId = randomUUID().toLowerCase()
      const params = {
        app_id: APPNAME,
        device_id: deviceId,
        channel: 'production',
      }

      // First request
      const response1 = await fetchDeviceApi('POST', params)
      expect(response1.status).not.toBe(429)

      // Wait 1.1 seconds
      await sleep(1100)

      // Second request should succeed
      const response2 = await fetchDeviceApi('POST', params)
      expect(response2.status).not.toBe(429)
    })
  })

  describe('[GET] /device rate limiting (get operation)', () => {
    it('should allow first get request', async () => {
      const deviceId = randomUUID().toLowerCase()
      const response = await fetchDeviceApi('GET', {
        app_id: APPNAME,
        device_id: deviceId,
      })
      expect(response.status).not.toBe(429)
    })

    it('should rate limit immediate second get request', async () => {
      const deviceId = randomUUID().toLowerCase()
      const params = {
        app_id: APPNAME,
        device_id: deviceId,
      }

      // First request
      const response1 = await fetchDeviceApi('GET', params)
      expect(response1.status).not.toBe(429)

      // Immediate second request should be rate limited
      const response2 = await fetchDeviceApi('GET', params)
      expect(response2.status).toBe(429)
    })

    it('should allow get request after 1 second delay', async () => {
      const deviceId = randomUUID().toLowerCase()
      const params = {
        app_id: APPNAME,
        device_id: deviceId,
      }

      // First request
      const response1 = await fetchDeviceApi('GET', params)
      expect(response1.status).not.toBe(429)

      // Wait 1.1 seconds
      await sleep(1100)

      // Second request should succeed
      const response2 = await fetchDeviceApi('GET', params)
      expect(response2.status).not.toBe(429)
    })
  })

  describe('[DELETE] /device rate limiting (delete operation)', () => {
    it('should allow first delete request', async () => {
      const deviceId = randomUUID().toLowerCase()
      const response = await fetchDeviceApi('DELETE', {
        app_id: APPNAME,
        device_id: deviceId,
      })
      expect(response.status).not.toBe(429)
    })

    it('should rate limit immediate second delete request', async () => {
      const deviceId = randomUUID().toLowerCase()
      const params = {
        app_id: APPNAME,
        device_id: deviceId,
      }

      // First request
      const response1 = await fetchDeviceApi('DELETE', params)
      expect(response1.status).not.toBe(429)

      // Immediate second request should be rate limited
      const response2 = await fetchDeviceApi('DELETE', params)
      expect(response2.status).toBe(429)
    })

    it('should allow delete request after 1 second delay', async () => {
      const deviceId = randomUUID().toLowerCase()
      const params = {
        app_id: APPNAME,
        device_id: deviceId,
      }

      // First request
      const response1 = await fetchDeviceApi('DELETE', params)
      expect(response1.status).not.toBe(429)

      // Wait 1.1 seconds
      await sleep(1100)

      // Second request should succeed
      const response2 = await fetchDeviceApi('DELETE', params)
      expect(response2.status).not.toBe(429)
    })
  })

  describe('cross-operation rate limiting independence', () => {
    it('should NOT rate limit different operations on same device', async () => {
      const deviceId = randomUUID().toLowerCase()
      const params = {
        app_id: APPNAME,
        device_id: deviceId,
        channel: 'production',
      }

      // POST request (set operation)
      const response1 = await fetchDeviceApi('POST', params)
      expect(response1.status).not.toBe(429)

      // GET request (get operation) immediately after - should NOT be rate limited
      const response2 = await fetchDeviceApi('GET', { app_id: APPNAME, device_id: deviceId })
      expect(response2.status).not.toBe(429)

      // DELETE request (delete operation) immediately after - should NOT be rate limited
      const response3 = await fetchDeviceApi('DELETE', { app_id: APPNAME, device_id: deviceId })
      expect(response3.status).not.toBe(429)
    })
  })
})
