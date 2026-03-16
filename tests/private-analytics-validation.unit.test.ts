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

beforeEach(() => {
  vi.clearAllMocks()
  checkPermissionMock.mockResolvedValue(true)
  countDevicesMock.mockResolvedValue(0)
  readDevicesMock.mockResolvedValue([])
  readStatsMock.mockResolvedValue([])
})

describe('private analytics route validation', () => {
  it('rejects malformed deviceIds on /private/stats', async () => {
    const response = await statsApp.request(postJson('http://local/', {
      appId: 'com.example.app',
      devicesId: ['1) OR 1=1 --'],
    }))

    await expectInvalidBody(response)
    expect(checkPermissionMock).not.toHaveBeenCalled()
    expect(readStatsMock).not.toHaveBeenCalled()
  })

  it('rejects malformed actions on /private/stats', async () => {
    const response = await statsApp.request(postJson('http://local/', {
      appId: 'com.example.app',
      actions: ['get', '\' OR 1=1 --'],
    }))

    await expectInvalidBody(response)
    expect(checkPermissionMock).not.toHaveBeenCalled()
    expect(readStatsMock).not.toHaveBeenCalled()
  })

  it('rejects non-numeric limits on /private/stats', async () => {
    const response = await statsApp.request(postJson('http://local/', {
      appId: 'com.example.app',
      limit: '1 UNION SELECT 1',
    }))

    await expectInvalidBody(response)
    expect(checkPermissionMock).not.toHaveBeenCalled()
    expect(readStatsMock).not.toHaveBeenCalled()
  })

  it('rejects control characters in /private/stats search', async () => {
    const response = await statsApp.request(postJson('http://local/', {
      appId: 'com.example.app',
      search: 'bad\u0000query',
    }))

    await expectInvalidBody(response)
    expect(checkPermissionMock).not.toHaveBeenCalled()
    expect(readStatsMock).not.toHaveBeenCalled()
  })

  it('rejects malformed deviceIds on /private/stats/export', async () => {
    const response = await statsApp.request(postJson('http://local/export', {
      appId: 'com.example.app',
      devicesId: ['1) OR 1=1 --'],
      format: 'json',
    }))

    await expectInvalidBody(response)
    expect(checkPermissionMock).not.toHaveBeenCalled()
    expect(readStatsMock).not.toHaveBeenCalled()
  })

  it('rejects malformed deviceIds on /private/devices', async () => {
    const response = await devicesApp.request(postJson('http://local/', {
      appId: 'com.example.app',
      devicesId: ['1) OR 1=1 --'],
    }))

    await expectInvalidBody(response)
    expect(checkPermissionMock).not.toHaveBeenCalled()
    expect(readDevicesMock).not.toHaveBeenCalled()
    expect(countDevicesMock).not.toHaveBeenCalled()
  })

  it('rejects non-numeric limits on /private/devices', async () => {
    const response = await devicesApp.request(postJson('http://local/', {
      appId: 'com.example.app',
      limit: '1 UNION SELECT 1',
    }))

    await expectInvalidBody(response)
    expect(checkPermissionMock).not.toHaveBeenCalled()
    expect(readDevicesMock).not.toHaveBeenCalled()
    expect(countDevicesMock).not.toHaveBeenCalled()
  })
})
