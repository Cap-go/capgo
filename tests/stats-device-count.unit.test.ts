import type { Context } from 'hono'
import { getRuntimeKey } from 'hono/adapter'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countDevicesCF } from '../supabase/functions/_backend/utils/cloudflare.ts'
import { countDevices } from '../supabase/functions/_backend/utils/stats.ts'
import { countDevicesSB } from '../supabase/functions/_backend/utils/supabase.ts'

vi.mock('hono/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('hono/adapter')>()
  return {
    ...actual,
    env: vi.fn((c: Context) => (c as Context & { env?: Record<string, string> }).env ?? {}),
    getRuntimeKey: vi.fn(),
  }
})

vi.mock('../supabase/functions/_backend/utils/cloudflare.ts', () => ({
  countDevicesCF: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  countDevicesSB: vi.fn(),
}))

function createContextMock(env: Record<string, unknown>) {
  return {
    env,
    get: vi.fn((key: string) => key === 'requestId' ? 'test-request' : undefined),
  } as unknown as Context
}

describe('countDevices install-source routing', () => {
  beforeEach(() => {
    vi.mocked(getRuntimeKey).mockReset()
    vi.mocked(countDevicesCF).mockReset()
    vi.mocked(countDevicesSB).mockReset()
  })

  it('fails install-source counts when Worker writes use Analytics Engine but read config is missing', () => {
    vi.mocked(getRuntimeKey).mockReturnValue('workerd')

    expect(() => countDevices(
      createContextMock({ DEVICE_INFO: {} }),
      'com.example.app',
      false,
      [],
      undefined,
      undefined,
      ['app_store'],
    )).toThrow(HTTPException)

    expect(countDevicesCF).not.toHaveBeenCalled()
    expect(countDevicesSB).not.toHaveBeenCalled()
  })

  it('uses Analytics Engine for install-source counts when read config is available', async () => {
    vi.mocked(getRuntimeKey).mockReturnValue('workerd')
    vi.mocked(countDevicesCF).mockReturnValue(Promise.resolve(4))

    await expect(countDevices(
      createContextMock({
        DEVICE_INFO: {},
        CF_ANALYTICS_TOKEN: 'token',
        CF_ACCOUNT_ANALYTICS_ID: 'account',
      }),
      'com.example.app',
      false,
      [],
      undefined,
      undefined,
      ['app_store'],
    )).resolves.toBe(4)

    expect(countDevicesCF).toHaveBeenCalledTimes(1)
    expect(countDevicesSB).not.toHaveBeenCalled()
  })
})
