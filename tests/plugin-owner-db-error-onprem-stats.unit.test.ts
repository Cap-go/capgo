import { beforeEach, describe, expect, it, vi } from 'vitest'

const setAppStatusMock = vi.fn(() => Promise.resolve())

;(globalThis as any).EdgeRuntime = undefined

function connectionTerminatedError() {
  return Object.assign(new Error('Failed query: select from apps'), {
    name: 'DrizzleQueryError',
    cause: new Error('Connection terminated unexpectedly'),
  })
}

function ownerLookupFailingDrizzle() {
  const error = connectionTerminatedError()
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          leftJoin: () => ({
            limit: () => Promise.reject(error),
          }),
        }),
      }),
    }),
  } as any
}

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
  cloudlogErr: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/appStatus.ts', () => ({
  getAppStatus: vi.fn(() => Promise.resolve({
    status: null,
    allow_device_custom_id: true,
    block_provider_infra_requests: false,
    cacheHit: false,
  })),
  setAppStatus: setAppStatusMock,
}))

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/discord.ts', () => ({
  sendDiscordAlert500: vi.fn(() => Promise.resolve()),
  sendDiscordAlert: vi.fn(() => Promise.resolve()),
}))

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/invalids_ip.ts', () => ({
  invalidIpInfo: vi.fn(async () => ({ blocked: false })),
}))

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/notifications.ts', () => ({
  sendNotifOrgCached: vi.fn(() => Promise.resolve()),
}))

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/plugin_stats.ts', () => ({
  createStatsMau: vi.fn(() => Promise.resolve()),
  createStatsVersion: vi.fn(() => Promise.resolve()),
  onPremStats: vi.fn(() => Promise.resolve()),
  sendStatsAndDevice: vi.fn(() => Promise.resolve()),
}))

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/utils.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase/functions/_backend/plugin_runtime/utils/utils.ts')>()
  return {
    ...actual,
    backgroundTask: vi.fn((_c: unknown, p: Promise<unknown> | (() => Promise<unknown>)) => {
      const result = typeof p === 'function' ? p() : p
      return Promise.resolve(result).catch(() => undefined)
    }),
    isLimited: vi.fn(() => false),
  }
})

vi.mock('../supabase/functions/_backend/plugin_runtime/utils/pg.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase/functions/_backend/plugin_runtime/utils/pg.ts')>()
  return {
    ...actual,
    getPgClient: vi.fn(async () => ({})),
    getDrizzleClient: vi.fn(() => ownerLookupFailingDrizzle()),
    closeClient: vi.fn(async () => undefined),
    getReadReplicaBinding: vi.fn(() => null),
    getLazyPgQueryCount: vi.fn(() => 0),
    getEffectiveDeviceChannelNamePostgres: vi.fn(async () => null),
    getAppVersionPostgres: vi.fn(async () => null),
  }
})

function createContext() {
  return {
    get: (key: string) => (key === 'requestId' ? '1493ea04' : undefined),
    set: vi.fn(),
    header: vi.fn(),
    res: { headers: new Headers() },
    req: {
      method: 'POST',
      path: '/stats',
      header: () => undefined,
      raw: { cf: {} },
    },
  } as any
}

describe('/stats owner lookup DB errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAppOwnerPostgres rethrows connection loss instead of returning null', async () => {
    const { getAppOwnerPostgres } = await import('../supabase/functions/_backend/plugin_runtime/utils/pg.ts')

    await expect(getAppOwnerPostgres(createContext(), 'com.trial.app', ownerLookupFailingDrizzle(), ['mau', 'bandwidth']))
      .rejects.toMatchObject({
        name: 'DrizzleQueryError',
        cause: { message: 'Connection terminated unexpectedly' },
      })
  })

  it('does not sticky-cache onprem when owner lookup fails', async () => {
    const { app } = await import('../supabase/functions/_backend/plugin_runtime/plugins/stats.ts')
    const response = await app.fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'android',
        device_id: 'ac4135b3-fda6-449e-b0fe-88680ab67105',
        app_id: 'com.trial.app',
        version_build: '1.0.0',
        version_name: '1.0.0',
        plugin_version: '8.51.0',
        version_os: '17',
        action: 'app_moved_to_foreground',
        custom_id: '',
        is_emulator: false,
        is_prod: true,
      }),
    }), createContext(), { waitUntil: () => {} } as any)

    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(setAppStatusMock).not.toHaveBeenCalledWith(
      expect.anything(),
      'com.trial.app',
      'onprem',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
  })
})
