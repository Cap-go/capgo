import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app as devicesApp } from '../supabase/functions/_backend/private/devices.ts'
import { app as statsApp } from '../supabase/functions/_backend/private/stats.ts'

const checkPermissionMock = vi.fn()
const countDevicesMock = vi.fn()
const readDevicesMock = vi.fn()
const readStatsMock = vi.fn()

vi.mock('../supabase/functions/_backend/utils/hono_middleware.ts', () => ({
  middlewareV2: () => async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/stats.ts', () => ({
  countDevices: (...args: unknown[]) => countDevicesMock(...args),
  readDevices: (...args: unknown[]) => readDevicesMock(...args),
  readStats: (...args: unknown[]) => readStatsMock(...args),
}))

function postJson(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function expectInvalidBody(response: Response) {
  expect(response.status).toBe(400)
  expect(await response.text()).toContain('Invalid body')
}

async function expectRejectedStatsBody(body: Record<string, unknown>, url = 'http://local/') {
  const response = await statsApp.request(postJson(url, {
    appId: 'com.example.app',
    ...body,
  }))

  await expectInvalidBody(response)
  expect(checkPermissionMock).not.toHaveBeenCalled()
  expect(readStatsMock).not.toHaveBeenCalled()
}

async function expectRejectedDevicesBody(body: Record<string, unknown>) {
  const response = await devicesApp.request(postJson('http://local/', {
    appId: 'com.example.app',
    ...body,
  }))

  await expectInvalidBody(response)
  expect(checkPermissionMock).not.toHaveBeenCalled()
  expect(readDevicesMock).not.toHaveBeenCalled()
  expect(countDevicesMock).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  checkPermissionMock.mockResolvedValue(true)
  countDevicesMock.mockResolvedValue(0)
  readDevicesMock.mockResolvedValue([])
  readStatsMock.mockResolvedValue([])
})

describe('private analytics route validation', () => {
  it.each([
    ['malformed deviceIds', { devicesId: ['1) OR 1=1 --'] }],
    ['malformed actions', { actions: ['get', '\' OR 1=1 --'] }],
    ['non-numeric limits', { limit: '1 UNION SELECT 1' }],
    ['control characters in search', { search: 'bad\u0000query' }],
  ])('rejects %s on /private/stats', async (_label, body) => {
    await expectRejectedStatsBody(body)
  })

  it('accepts backend_refusal on /private/stats', async () => {
    const response = await statsApp.request(postJson('http://local/', {
      appId: 'com.example.app',
      actions: ['backend_refusal'],
    }))

    expect(response.status).toBe(200)
    expect(checkPermissionMock).toHaveBeenCalledTimes(1)
    expect(readStatsMock).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed deviceIds on /private/stats/export', async () => {
    await expectRejectedStatsBody({
      devicesId: ['1) OR 1=1 --'],
      format: 'json',
    }, 'http://local/export')
  })

  it.each([
    ['malformed deviceIds', { devicesId: ['1) OR 1=1 --'] }],
    ['non-numeric limits', { limit: '1 UNION SELECT 1' }],
  ])('rejects %s on /private/devices', async (_label, body) => {
    await expectRejectedDevicesBody(body)
  })
})
