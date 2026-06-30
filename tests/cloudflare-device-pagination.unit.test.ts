import type { Context } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildReadDevicesCFQuery, countDevicesCF, countInstallSourcesCF } from '../supabase/functions/_backend/utils/cloudflare.ts'
import { readDevicesSB } from '../supabase/functions/_backend/utils/supabase.ts'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

function createReadDevicesQueryMock() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: vi.fn((resolve, reject) => Promise.resolve({ data: [], count: 12, error: null }).then(resolve, reject)),
  }
  const client = {
    from: vi.fn(() => query),
  }

  return { client, query }
}

function createContextMock() {
  return {
    env: {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      CF_ANALYTICS_TOKEN: 'cf-analytics-token',
      CF_ACCOUNT_ANALYTICS_ID: 'cf-account-id',
    },
    req: { url: 'http://localhost/private/devices' },
    get: vi.fn((key: string) => key === 'requestId' ? 'test-request' : undefined),
  }
}

beforeEach(() => {
  vi.mocked(createClient).mockReset()
  vi.unstubAllGlobals()
})

describe('buildReadDevicesCFQuery', () => {
  it.concurrent('applies default device_id cursor pagination when no order is provided', () => {
    const query = buildReadDevicesCFQuery({
      app_id: 'com.example.app',
      cursor: '2026-04-04 03:05:59|11111111-1111-4111-8111-111111111111',
      limit: 1,
    }, false)

    const groupByIndex = query.indexOf('GROUP BY blob1')
    const cursorIndex = query.indexOf(`WHERE device_id > '11111111-1111-4111-8111-111111111111'`)

    expect(groupByIndex).toBeGreaterThan(-1)
    expect(cursorIndex).toBeGreaterThan(groupByIndex)
    expect(query).toContain('ORDER BY device_id ASC')
  })

  it.concurrent('does not read install source blob on default device listing', () => {
    const query = buildReadDevicesCFQuery({
      app_id: 'com.example.app',
      limit: 1,
    }, false)

    expect(query).not.toContain('blob9')
    expect(query).not.toContain('install_source')
  })

  it.concurrent('applies descending cursor pagination after device grouping', () => {
    const query = buildReadDevicesCFQuery({
      app_id: 'com.example.app',
      cursor: '2026-04-04 03:05:59|11111111-1111-4111-8111-111111111111',
      limit: 1,
      order: [{ key: 'updated_at', sortable: 'desc' }],
    }, false)

    const groupByIndex = query.indexOf('GROUP BY blob1')
    const cursorIndex = query.indexOf(`WHERE (updated_at < toDateTime('2026-04-04 03:05:59')`)
    const tiebreakerIndex = query.indexOf(`AND device_id > '11111111-1111-4111-8111-111111111111'`)

    expect(groupByIndex).toBeGreaterThan(-1)
    expect(cursorIndex).toBeGreaterThan(groupByIndex)
    expect(tiebreakerIndex).toBeGreaterThan(cursorIndex)
    expect(query).not.toContain(`AND (timestamp < toDateTime('2026-04-04 03:05:59')`)
    expect(query).toContain(`ORDER BY updated_at DESC, device_id ASC`)
  })

  it.concurrent('applies ascending cursor pagination after device grouping', () => {
    const query = buildReadDevicesCFQuery({
      app_id: 'com.example.app',
      cursor: '2026-04-04 03:05:59|11111111-1111-4111-8111-111111111111',
      limit: 1,
      order: [{ key: 'updated_at', sortable: 'asc' }],
    }, false)

    const cursorIndex = query.indexOf(`WHERE (updated_at > toDateTime('2026-04-04 03:05:59')`)
    const tiebreakerIndex = query.indexOf(`AND device_id > '11111111-1111-4111-8111-111111111111'`)

    expect(query).toContain(`WHERE (updated_at > toDateTime('2026-04-04 03:05:59')`)
    expect(tiebreakerIndex).toBeGreaterThan(cursorIndex)
    expect(query).toContain(`ORDER BY updated_at ASC, device_id ASC`)
  })

  it.concurrent('filters install sources after device grouping', () => {
    const query = buildReadDevicesCFQuery({
      app_id: 'com.example.app',
      installSources: ['app_store', 'amazon_appstore'],
      cursor: '2026-04-04 03:05:59|11111111-1111-4111-8111-111111111111',
      limit: 1,
    }, false)

    const groupByIndex = query.indexOf('GROUP BY blob1')
    const installSourceFilterIndex = query.indexOf(`install_source IN ('app_store', 'amazon_appstore')`)

    expect(query).toContain("argMax(blob9, CASE WHEN blob9 != '' THEN timestamp ELSE toDateTime('1970-01-01 00:00:00') END) AS install_source")
    expect(installSourceFilterIndex).toBeGreaterThan(groupByIndex)
    expect(query).not.toContain(`WHERE index1 = 'com.example.app' AND blob9 IN`)
    expect(query).toContain(`WHERE device_id > '11111111-1111-4111-8111-111111111111' AND install_source IN ('app_store', 'amazon_appstore')`)
  })
})
describe('countDevicesCF', () => {
  it('does not read install source blob on default device counts', async () => {
    let query = ''
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      query = String(init?.body ?? '')
      return new Response(JSON.stringify({
        meta: [{ name: 'total', type: 'UInt64' }],
        data: [{ total: 12 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const count = await countDevicesCF(
      createContextMock() as unknown as Context,
      'com.example.app',
      false,
    )

    expect(count).toBe(12)
    expect(query).toContain('COUNT(DISTINCT blob1) AS total')
    expect(query).not.toContain('blob9')
    expect(query).not.toContain('install_source')
  })
})

describe('countInstallSourcesCF', () => {
  it('counts latest install sources in a dedicated aggregate query', async () => {
    let query = ''
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      query = String(init?.body ?? '')
      return new Response(JSON.stringify({
        meta: [
          { name: 'install_source', type: 'String' },
          { name: 'total', type: 'UInt64' },
        ],
        data: [
          { install_source: 'app_store', total: 3 },
          { install_source: 'testflight', total: 2 },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const counts = await countInstallSourcesCF(createContextMock() as unknown as Context, 'com.example.app')

    expect(counts).toEqual({ app_store: 3, testflight: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(query).toContain('GROUP BY install_source')
    expect(query).toContain('argMax(blob9')
    expect(query).not.toContain('COUNT(DISTINCT blob1) AS total')
  })

  it('reuses cached install source counts for the same app', async () => {
    const cachedResponses = new Map<string, Response>()
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({
        match: vi.fn(async (request: Request) => cachedResponses.get(request.url)),
        put: vi.fn(async (request: Request, response: Response) => {
          cachedResponses.set(request.url, response)
        }),
      })),
    })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      meta: [
        { name: 'install_source', type: 'String' },
        { name: 'total', type: 'UInt64' },
      ],
      data: [{ install_source: 'app_store', total: 3 }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const context = createContextMock() as unknown as Context
    await expect(countInstallSourcesCF(context, 'com.example.app')).resolves.toEqual({ app_store: 3 })
    await expect(countInstallSourcesCF(context, 'com.example.app')).resolves.toEqual({ app_store: 3 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('readDevicesSB', () => {
  it('applies default device_id cursor pagination when no order is provided', async () => {
    const { client, query } = createReadDevicesQueryMock()
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>)

    await readDevicesSB(createContextMock() as unknown as Context, {
      app_id: 'com.example.app',
      cursor: '2026-04-04 03:05:59|11111111-1111-4111-8111-111111111111',
      limit: 1,
    }, false)

    expect(client.from).toHaveBeenCalledWith('devices')
    expect(query.gt).toHaveBeenCalledWith('device_id', '11111111-1111-4111-8111-111111111111')
    expect(query.order).toHaveBeenCalledTimes(1)
    expect(query.order).toHaveBeenCalledWith('device_id', { ascending: true })
    expect(query.limit).toHaveBeenCalledWith(2)
  })

  it('applies install source filters', async () => {
    const { client, query } = createReadDevicesQueryMock()
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>)

    await readDevicesSB(createContextMock() as unknown as Context, {
      app_id: 'com.example.app',
      installSources: ['app_store', 'testflight'],
      limit: 1,
    }, false)

    expect(query.in).toHaveBeenCalledWith('install_source', ['app_store', 'testflight'])
  })

})
