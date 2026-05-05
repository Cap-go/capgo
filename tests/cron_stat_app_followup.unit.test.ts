import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  readStatsBandwidthMock,
  closeClientMock,
  getPgClientMock,
  readStatsMauMock,
  readStatsStorageMock,
  readStatsVersionMock,
  supabaseAdminMock,
} = vi.hoisted(() => ({
  readStatsBandwidthMock: vi.fn(),
  closeClientMock: vi.fn(),
  getPgClientMock: vi.fn(),
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

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: (...args: unknown[]) => closeClientMock(...args),
  getPgClient: (...args: unknown[]) => getPgClientMock(...args),
}))

const { app: cronStatApp } = await import('../supabase/functions/_backend/triggers/cron_stat_app.ts')
const { createAllCatch, createHono } = await import('../supabase/functions/_backend/utils/hono.ts')
const { version } = await import('../supabase/functions/_backend/utils/version.ts')

function createSingleBuilder<T>(result: T) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

function createWriteBuilder(error?: Error | null) {
  const builder = {
    data: null,
    error: error ?? null,
    status: error ? 500 : 200,
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    throwOnError: vi.fn().mockImplementation(() => error ? Promise.reject(error) : Promise.resolve(builder)),
  }

  return builder
}

function createRpcSingleBuilder<T>(result: T) {
  return {
    single: vi.fn().mockResolvedValue(result),
  }
}

function createRpcResultBuilder(result?: { data: unknown, error: Error | null, status?: number | null }) {
  return vi.fn().mockResolvedValue(result ?? {
    data: null,
    error: null,
    status: 200,
  })
}

function hasPendingRefresh(rows: Array<{
  stats_refresh_requested_at: string | null
  stats_updated_at: string | null
}>): boolean {
  const staleCutoff = Date.now() - 5 * 60 * 1000

  return rows.some((row) => {
    if (!row.stats_refresh_requested_at)
      return false

    const requestedAt = Date.parse(row.stats_refresh_requested_at)
    if (Number.isNaN(requestedAt) || requestedAt < staleCutoff)
      return false

    if (!row.stats_updated_at)
      return true

    const updatedAt = Date.parse(row.stats_updated_at)
    return Number.isNaN(updatedAt) || requestedAt > updatedAt
  })
}

function createSupabaseStub(options?: {
  customerId?: string | null
  orgSelectError?: Error | null
  orgUpdateError?: Error | null
  pendingAppRefreshes?: boolean
  pendingAppRows?: Array<{
    app_id: string
    stats_refresh_requested_at: string | null
    stats_updated_at: string | null
  }>
  queueError?: Error | null
  queueStatus?: number | null
}) {
  const appSelectBuilder = createSingleBuilder({
    data: {
      app_id: 'com.test.app',
      owner_org: 'org-test',
    },
    error: null,
  })
  const pendingAppRows = options?.pendingAppRows ?? (
    options?.pendingAppRefreshes
      ? [
          {
            app_id: 'com.other.app',
            stats_refresh_requested_at: new Date(Date.now() - 60 * 1000).toISOString(),
            stats_updated_at: null,
          },
        ]
      : []
  )
  const pendingAppsQuery = vi.fn().mockResolvedValue({
    rows: [{ has_pending: hasPendingRefresh(pendingAppRows) }],
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
  const markAppStatsRefreshedBuilder = createRpcResultBuilder({
    data: '2026-04-20T12:00:00.000Z',
    error: null,
    status: 200,
  })
  let appSelectConsumed = false
  const queueBuilder = createRpcResultBuilder({
    data: null,
    error: options?.queueError ?? null,
    status: options?.queueStatus ?? (options?.queueError ? 500 : 200),
  })
  const pgClient = {
    query: pendingAppsQuery,
  }
  const orgBuilder = {
    select: vi.fn().mockReturnValue(orgSelectBuilder),
    update: vi.fn().mockReturnValue(orgUpdateBuilder),
  }

  const client = {
    from: vi.fn((table: string) => {
      switch (table) {
        case 'apps': {
          if (!appSelectConsumed) {
            appSelectConsumed = true
            return appSelectBuilder
          }
          throw new Error('Unexpected apps read after app owner lookup')
        }
        case 'daily_mau':
          return dailyMauBuilder
        case 'daily_bandwidth':
          return dailyBandwidthBuilder
        case 'daily_storage':
          return dailyStorageBuilder
        case 'daily_version':
          return dailyVersionBuilder
        case 'orgs':
          return orgBuilder
        default:
          throw new Error(`Unexpected table ${table}`)
      }
    }),
    rpc: vi.fn((name: string, args?: unknown) => {
      switch (name) {
        case 'get_cycle_info_org':
          return cycleInfoBuilder
        case 'mark_app_stats_refreshed':
          return markAppStatsRefreshedBuilder(args)
        case 'queue_cron_stat_org_for_org':
          return queueBuilder(args)
        default:
          throw new Error(`Unexpected rpc ${name}`)
      }
    }),
  }
  getPgClientMock.mockReturnValue(pgClient)
  closeClientMock.mockResolvedValue(undefined)

  return {
    client,
    builders: {
      dailyMauBuilder,
      dailyBandwidthBuilder,
      dailyStorageBuilder,
      dailyVersionBuilder,
      markAppStatsRefreshedBuilder,
      orgBuilder,
      orgUpdateBuilder,
      pendingAppsQuery,
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

  it('returns success when queuing plan processing fails after stats writes', async () => {
    const { client, builders } = createSupabaseStub({
      queueError: new Error('temporary upstream failure'),
      queueStatus: 502,
    })
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.dailyMauBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyBandwidthBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyStorageBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyVersionBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.orgBuilder.update).toHaveBeenCalledTimes(1)
    expect(builders.queueBuilder).toHaveBeenCalledTimes(3)

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
  })

  it('retries queuing plan processing before succeeding', async () => {
    const { client, builders } = createSupabaseStub()
    builders.queueBuilder
      .mockResolvedValueOnce({
        data: null,
        error: new Error('temporary upstream failure'),
        status: 502,
      })
      .mockResolvedValueOnce({
        data: null,
        error: new Error('temporary upstream failure'),
        status: 502,
      })
      .mockResolvedValue({ data: null, error: null, status: 200 })
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.queueBuilder).toHaveBeenCalledTimes(3)

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
  })

  it('does not retry non-retryable queue failures', async () => {
    const { client, builders } = createSupabaseStub({
      queueError: new Error('invalid queue payload'),
      queueStatus: 400,
    })
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.queueBuilder).toHaveBeenCalledTimes(1)

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
  })

  it('retries thrown queue failures before giving up', async () => {
    const { client, builders } = createSupabaseStub()
    builders.queueBuilder.mockRejectedValue(new Error('fetch failed'))
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.queueBuilder).toHaveBeenCalledTimes(3)

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
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
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.markAppStatsRefreshedBuilder).toHaveBeenCalledTimes(1)
    expect(builders.dailyMauBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyBandwidthBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyStorageBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyVersionBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.orgBuilder.update).toHaveBeenCalledTimes(3)
    expect(client.rpc).toHaveBeenCalledWith('queue_cron_stat_org_for_org', {
      org_id: 'org-test',
      customer_id: 'cus_test',
    })

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
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.markAppStatsRefreshedBuilder).toHaveBeenCalledTimes(1)
    expect(builders.dailyMauBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyBandwidthBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyStorageBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyVersionBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.orgBuilder.update).not.toHaveBeenCalled()
    expect(client.rpc).not.toHaveBeenCalledWith('queue_cron_stat_org_for_org', expect.anything())

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
  })

  it('returns success without updating org freshness while another app refresh is still pending', async () => {
    const { client, builders } = createSupabaseStub({
      pendingAppRefreshes: true,
    })
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.markAppStatsRefreshedBuilder).toHaveBeenCalledTimes(1)
    expect(builders.dailyMauBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyBandwidthBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyStorageBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.dailyVersionBuilder.upsert).toHaveBeenCalledTimes(1)
    expect(builders.pendingAppsQuery).toHaveBeenCalledTimes(1)
    expect(builders.orgBuilder.update).not.toHaveBeenCalled()
    expect(client.rpc).not.toHaveBeenCalledWith('queue_cron_stat_org_for_org', expect.anything())

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
  })

  it('ignores stale pending refresh markers when deciding org completion', async () => {
    const { client, builders } = createSupabaseStub({
      pendingAppRows: [
        {
          app_id: 'com.other.app',
          stats_refresh_requested_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          stats_updated_at: null,
        },
      ],
    })
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.pendingAppsQuery).toHaveBeenCalledTimes(1)
    expect(builders.orgBuilder.update).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith('queue_cron_stat_org_for_org', {
      org_id: 'org-test',
      customer_id: 'cus_test',
    })

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
  })

  it('retries the pending refresh lookup before completing org refresh', async () => {
    const { client, builders } = createSupabaseStub()
    builders.pendingAppsQuery
      .mockRejectedValueOnce(new Error('error code: 502'))
      .mockRejectedValueOnce(new Error('error code: 502'))
      .mockResolvedValue({
        rows: [{ has_pending: false }],
      })
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(200)
    expect(builders.pendingAppsQuery).toHaveBeenCalledTimes(3)
    expect(builders.orgBuilder.update).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith('queue_cron_stat_org_for_org', {
      org_id: 'org-test',
      customer_id: 'cus_test',
    })

    const payload = await response.json() as { status: string }
    expect(payload.status).toBe('Stats saved')
  })

  it('surfaces pending refresh lookup failures after retries', async () => {
    const { client, builders } = createSupabaseStub()
    builders.pendingAppsQuery.mockRejectedValue(new Error('error code: 502'))
    supabaseAdminMock.mockReturnValue(client)

    const response = await createApp().fetch(new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apisecret': 'testsecret',
      },
      body: JSON.stringify({
        appId: 'com.test.app',
        orgId: 'org-test',
      }),
    }), {}, {
      waitUntil: () => { },
    } as any)

    expect(response.status).toBe(500)
    expect(builders.pendingAppsQuery).toHaveBeenCalledTimes(3)
    expect(builders.orgBuilder.update).not.toHaveBeenCalled()
    expect(client.rpc).not.toHaveBeenCalledWith('queue_cron_stat_org_for_org', expect.anything())
  })
})
