import type { Context } from 'hono'
import { getRuntimeKey } from 'hono/adapter'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countDevicesCF, countInstallSourcesCF } from '../supabase/functions/_backend/utils/cloudflare.ts'
import { countInstallSources } from '../supabase/functions/_backend/utils/stats.ts'
import { countDevicesSB, countInstallSourcesSB } from '../supabase/functions/_backend/utils/supabase.ts'

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
  countInstallSourcesCF: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  countDevicesSB: vi.fn(),
  countInstallSourcesSB: vi.fn(),
}))
function createContextMock(env: Record<string, unknown>) {
  return {
    env,
    get: vi.fn((key: string) => key === 'requestId' ? 'test-request' : undefined),
  } as unknown as Context
}
describe('countInstallSources routing', () => {
  beforeEach(() => {
    vi.mocked(getRuntimeKey).mockReset()
    vi.mocked(countDevicesCF).mockReset()
    vi.mocked(countDevicesSB).mockReset()
    vi.mocked(countInstallSourcesCF).mockReset()
    vi.mocked(countInstallSourcesSB).mockReset()
  })

  it('fails install-source counts when Worker writes use Analytics Engine but read config is missing', () => {
    vi.mocked(getRuntimeKey).mockReturnValue('workerd')

    expect(() => countInstallSources(
      createContextMock({ DEVICE_INFO: {} }),
      'com.example.app',
    )).toThrow('Cannot count install sources without Analytics Engine read configuration')

    expect(countInstallSourcesCF).not.toHaveBeenCalled()
    expect(countInstallSourcesSB).not.toHaveBeenCalled()
  })

  it('uses Analytics Engine for install-source counts when read config is available', async () => {
    vi.mocked(getRuntimeKey).mockReturnValue('workerd')
    vi.mocked(countInstallSourcesCF).mockReturnValue(Promise.resolve({ app_store: 4 }))

    await expect(countInstallSources(
      createContextMock({
        DEVICE_INFO: {},
        CF_ANALYTICS_TOKEN: 'token',
        CF_ACCOUNT_ANALYTICS_ID: 'account',
      }),
      'com.example.app',
    )).resolves.toEqual({ app_store: 4 })

    expect(countInstallSourcesCF).toHaveBeenCalledTimes(1)
    expect(countInstallSourcesSB).not.toHaveBeenCalled()
    expect(countDevicesCF).not.toHaveBeenCalled()
    expect(countDevicesSB).not.toHaveBeenCalled()
  })
})
