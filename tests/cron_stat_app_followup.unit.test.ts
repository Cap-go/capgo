import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  readStatsBandwidthMock,
  readStatsMauMock,
  readStatsStorageMock,
  readStatsVersionMock,
  supabaseAdminMock,
} = vi.hoisted(() => ({
  readStatsBandwidthMock: vi.fn(),
  readStatsMauMock: vi.fn(),
  readStatsStorageMock: vi.fn(),
  readStatsVersionMock: vi.fn(),
  supabaseAdminMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/stats.ts', () => ({
  readStatsBandwidth: (...args: unknown[]) => readStatsBandwidthMock(...args),
  readStatsMau: (...args: unknown[]) => readStatsMauMock(...args),
  readStatsStorage: (...args: unknown[]) => readStatsStorageMock(...args),
  readStatsVersion: (...args: unknown[]) => readStatsVersionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: (...args: unknown[]) => supabaseAdminMock(...args),
}))

const { app: cronStatApp } = await import('../supabase/functions/_backend/triggers/cron_stat_app.ts')
const { createAllCatch, createHono } = await import('../supabase/functions/_backend/utils/hono.ts')
const { version } = await import('../supabase/functions/_backend/utils/version.ts')

function createSingleBuilder<T>(result: T) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

function createWriteBuilder(error?: Error | null) {
  return {
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    throwOnError: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function createRpcSingleBuilder<T>(result: T) {
  return {
    single: vi.fn().mockResolvedValue(result),
  }
}

function createRpcThrowBuilder(error?: Error | null) {
  return {
    throwOnError: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function createSupabaseStub(options?: {
  customerId?: string | null
  orgSelectError?: Error | null
  orgUpdateError?: Error | null
  queueError?: Error | null
}) {
  const appBuilder = createSingleBuilder({
    data: {
      app_id: 'com.test.app',
      owner_org: 'org-test',
    },
    error: null,
  })
  const orgSelectBuilder = createSingleBuilder({
    data: {
      customer_id: options?.customerId ?? 'cus_test',
      stats_updated_at: '2026-04-20T10:00:00.000Z',
    },
    error: options?.orgSelectError ?? null,
  })
  const orgUpdateBuilder = createWriteBuilder(options?.orgUpdateError)
  const dailyMauBuilder = createWriteBuilder()
  const dailyBandwidthBuilder = createWriteBuilder()
  const dailyStorageBuilder = createWriteBuilder()
  const dailyVersionBuilder = createWriteBuilder()
  const cycleInfoBuilder = createRpcSingleBuilder({
    data: {
      subscription_anchor_start: '2026-04-01T00:00:00.000Z',
      subscription_anchor_end: '2026-04-30T23:59:59.000Z',
    },
    error: null,
  })
  const queueBuilder = createRpcThrowBuilder(options?.queueError)

  const orgBuilders = [orgSelectBuilder, orgUpdateBuilder]

  const client = {
    from: vi.fn((table: string) => {
      switch (table) {
        case 'apps':
          return appBuilder
        case 'daily_mau':
          return dailyMauBuilder
        case 'daily_bandwidth':
          return dailyBandwidthBuilder
        case 'daily_storage':
          return dailyStorageBuilder
        case 'daily_version':
          return dailyVersionBuilder
        case 'orgs': {
          const nextBuilder = orgBuilders.shift()
          if (!nextBuilder) {
            throw new Error('Unexpected orgs builder call')
          }
          return nextBuilder
        }
        default:
          throw new Error(`Unexpected table ${table}`)
      }
    }),
    rpc: vi.fn((name: string) => {
      switch (name) {
        case 'get_cycle_info_org':
          return cycleInfoBuilder
        case 'queue_cron_stat_org_for_org':
          return queueBuilder
        default:
          throw new Error(`Unexpected rpc ${name}`)
      }
    }),
  }

  return {
    client,
    builders: {
      dailyMauBuilder,
      dailyBandwidthBuilder,
      dailyStorageBuilder,
      dailyVersionBuilder,
      orgUpdateBuilder,
      queueBuilder,
    },
  }
}

function createApp() {
  const appGlobal = createHono('cron_stat_app', version)
  appGlobal.route('/', cronStatApp)
  createAllCatch(appGlobal, 'cron_stat_app')
  return appGlobal
}

describe('cron_stat_app follow-up failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.API_SECRET = 'testsecret'
    process.env.ENV_NAME = 'test'
    ;(globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime = {
      waitUntil: () => { },
    }
    readStatsMauMock.mockResolvedValue([
      { app_id: 'com.test.app', date: '2026-04-20', mau: 2 },
    ])
    readStatsBandwidthMock.mockResolvedValue([
      { app_id: 'com.test.app', date: '2026-04-20', bandwidth: 42 },
    ])
    readStatsStorageMock.mockResolvedValue([
      { app_id: 'com.test.app', date: '2026-04-20', storage: 7 },
    ])
    readStatsVersionMock.mockResolvedValue([
      {
        app_id: 'com.test.app',
        date: '2026-04-20',
        version_name: '1.0.0',
        get: 1,
        fail: 0,
        install: 1,
        uninstall: 0,
      },
    ])
  })

  it('returns 500 when queuing plan processing fails after stats writes', async () => {
    const { client, builders } = createSupabaseStub({
      queueError: new Error('error code: 502'),
    })
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apisecret: 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(500)
    expect(builders.dailyMauBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.dailyBandwidthBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.dailyStorageBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.dailyVersionBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.orgUpdateBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.queueBuilder.throwOnError).toHaveBeenCalledTimes(1)

    const payload = await response.json() as { error: string }
    expect(payload.error).toBe('unknown_error')
  })

  it('returns success and still queues plan processing when org timestamp refresh fails after stats writes', async () => {
    const { client, builders } = createSupabaseStub({
      orgUpdateError: new Error('error code: 502'),
    })
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apisecret: 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.dailyMauBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.dailyBandwidthBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.dailyStorageBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.dailyVersionBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.orgUpdateBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.queueBuilder.throwOnError).toHaveBeenCalledTimes(1)

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
  })

  it('returns success when org refresh target lookup fails after stats writes', async () => {
    const { client, builders } = createSupabaseStub({
      orgSelectError: new Error('error code: 502'),
    })
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apisecret: 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.dailyMauBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.dailyBandwidthBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.dailyStorageBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.dailyVersionBuilder.throwOnError).toHaveBeenCalledTimes(1)
    expect(builders.orgUpdateBuilder.throwOnError).not.toHaveBeenCalled()
    expect(builders.queueBuilder.throwOnError).not.toHaveBeenCalled()

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
  })
})
