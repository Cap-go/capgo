import { randomUUID } from 'node:crypto'
import { env } from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getBaseData, headers, PLUGIN_BASE_URL, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

// Rate limiting uses Cloudflare Workers Cache API, which isn't available in Supabase Edge Functions
const USE_CLOUDFLARE = env.USE_CLOUDFLARE_WORKERS === 'true'
const OP_LIMIT_PER_SECOND = 5

const id = randomUUID()
const APPNAME = `com.ratelimit.${id}`

type ChannelSelfMethod = 'POST' | 'PUT' | 'DELETE'
type DeviceApiMethod = 'POST' | 'GET' | 'DELETE'

async function fetchChannelSelfEndpoint(method: ChannelSelfMethod, bodyIn: object) {
  const url = new URL(`${PLUGIN_BASE_URL}/channel_self`)
  if (method === 'DELETE') {
    for (const [key, value] of Object.entries(bodyIn))
      url.searchParams.append(key, value.toString())
  }

  return fetch(url, {
    method,
    body: method !== 'DELETE' ? JSON.stringify(bodyIn) : undefined,
  })
}

async function fetchGetChannels(queryParams: Record<string, string>) {
  const url = new URL(`${PLUGIN_BASE_URL}/channel_self`)
  for (const [key, value] of Object.entries(queryParams))
    url.searchParams.append(key, value)

  return fetch(url, { method: 'GET' })
}

async function fetchDeviceApi(method: DeviceApiMethod, params: Record<string, string>) {
  const url = new URL(`${BASE_URL}/device`)

  if (method === 'GET') {
    for (const [key, value] of Object.entries(params))
      url.searchParams.append(key, value)
  }

  return fetch(url, {
    method,
    headers,
    body: method !== 'GET' ? JSON.stringify(params) : undefined,
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Reusable test suite for rate limiting behavior.
 * Tests: first request succeeds, immediate second is rate limited, after delay succeeds.
 */
async function testRateLimitBehavior(
  name: string,
  makeRequest: (deviceId: string) => Promise<Response>,
) {
  describe(name, () => {
    it('should allow first request', async () => {
      const response = await makeRequest(randomUUID().toLowerCase())
      expect(response.status).not.toBe(429)
    })

    it('should rate limit after burst within 1 second', async () => {
      const deviceId = randomUUID().toLowerCase()

      // Allow up to OP_LIMIT_PER_SECOND within the window
      for (let i = 0; i < OP_LIMIT_PER_SECOND; i++) {
        const response = await makeRequest(deviceId)
        expect(response.status).not.toBe(429)
      }

      // Next one should be rate limited
      const responseLimited = await makeRequest(deviceId)
      expect(responseLimited.status).toBe(429)
    })

    it('should allow request after 1 second delay', async () => {
      const deviceId = randomUUID().toLowerCase()
      // Hit the limit
      for (let i = 0; i < OP_LIMIT_PER_SECOND; i++) {
        const response = await makeRequest(deviceId)
        expect(response.status).not.toBe(429)
      }
      const responseLimited = await makeRequest(deviceId)
      expect(responseLimited.status).toBe(429)

      await sleep(1100)

      const response2 = await makeRequest(deviceId)
      expect(response2.status).not.toBe(429)
    })
  })
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
})

// Skip all rate limiting tests when not running against Cloudflare Workers
// because the Cache API used for rate limiting isn't available in Supabase Edge Functions
describe.skipIf(!USE_CLOUDFLARE)('channel_self rate limiting', () => {
  // For the generic "op-level" tests, avoid the 60s same-channel rule by
  // ensuring the channel differs on every call per deviceId.
  const setCallCounts = new Map<string, number>()

  testRateLimitBehavior('[POST] set operation', async (deviceId) => {
    const data = getBaseData(APPNAME)
    data.device_id = deviceId
    const count = setCallCounts.get(deviceId) ?? 0
    setCallCounts.set(deviceId, count + 1)
    data.channel = `rl-op-${deviceId}-${count}`
    return fetchChannelSelfEndpoint('POST', data)
  })

  testRateLimitBehavior('[PUT] get operation', async (deviceId) => {
    const data = getBaseData(APPNAME)
    data.device_id = deviceId
    return fetchChannelSelfEndpoint('PUT', data)
  })

  testRateLimitBehavior('[DELETE] delete operation', async (deviceId) => {
    const data = getBaseData(APPNAME)
    data.device_id = deviceId
    return fetchChannelSelfEndpoint('DELETE', data)
  })

  testRateLimitBehavior('[GET] list operation', async (deviceId) => {
    const data = getBaseData(APPNAME)
    data.device_id = deviceId
    return fetchGetChannels(data as any)
  })

  describe('same channel 60-second rate limit', () => {
    it('should rate limit same channel set within 60 seconds', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId
      data.channel = 'production'

      const response1 = await fetchChannelSelfEndpoint('POST', data)
      expect(response1.status).not.toBe(429)

      await sleep(1100) // Wait for op-level rate limit to expire

      const response2 = await fetchChannelSelfEndpoint('POST', data)
      expect(response2.status).toBe(429) // Still rate limited by 60-second rule
    })

    it('should allow set with different channel after 1 second', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId
      data.channel = 'production'

      const response1 = await fetchChannelSelfEndpoint('POST', data)
      expect(response1.status).not.toBe(429)

      await sleep(1100)

      data.channel = 'beta'
      const response2 = await fetchChannelSelfEndpoint('POST', data)
      expect(response2.status).not.toBe(429)
    })
  })

  describe('cross-operation independence', () => {
    it('should NOT rate limit different operations on same device', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      const responses = await Promise.all([
        fetchChannelSelfEndpoint('POST', data),
        fetchChannelSelfEndpoint('PUT', data),
        fetchChannelSelfEndpoint('DELETE', data),
        fetchGetChannels(data as any),
      ])

      responses.forEach(r => expect(r.status).not.toBe(429))
    })

    it('should rate limit one operation without affecting others', async () => {
      const deviceId = randomUUID().toLowerCase()
      const data = getBaseData(APPNAME)
      data.device_id = deviceId

      // Exhaust POST
      for (let i = 0; i < OP_LIMIT_PER_SECOND; i++) {
        const response = await fetchChannelSelfEndpoint('POST', { ...data, channel: `rl-xop-${deviceId}-${i}` })
        expect(response.status).not.toBe(429)
      }
      const postLimited = await fetchChannelSelfEndpoint('POST', { ...data, channel: `rl-xop-${deviceId}-limited` })
      expect(postLimited.status).toBe(429)

      // PUT should still be allowed (separate bucket)
      const put = await fetchChannelSelfEndpoint('PUT', data)
      expect(put.status).not.toBe(429)
    })
  })
})

describe.skipIf(!USE_CLOUDFLARE)('device API rate limiting', () => {
  testRateLimitBehavior('[POST] set operation', async (deviceId) => {
    return fetchDeviceApi('POST', { app_id: APPNAME, device_id: deviceId, channel: 'production' })
  })

  testRateLimitBehavior('[GET] get operation', async (deviceId) => {
    return fetchDeviceApi('GET', { app_id: APPNAME, device_id: deviceId })
  })

  testRateLimitBehavior('[DELETE] delete operation', async (deviceId) => {
    return fetchDeviceApi('DELETE', { app_id: APPNAME, device_id: deviceId })
  })

  describe('cross-operation independence', () => {
    it('should NOT rate limit different operations on same device', async () => {
      const deviceId = randomUUID().toLowerCase()

      const responses = await Promise.all([
        fetchDeviceApi('POST', { app_id: APPNAME, device_id: deviceId, channel: 'production' }),
        fetchDeviceApi('GET', { app_id: APPNAME, device_id: deviceId }),
        fetchDeviceApi('DELETE', { app_id: APPNAME, device_id: deviceId }),
      ])

      responses.forEach(r => expect(r.status).not.toBe(429))
    })
  })
})
