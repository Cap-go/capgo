import type { Context } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildReadDevicesCFQuery } from '../supabase/functions/_backend/utils/cloudflare.ts'
import { readDevicesSB } from '../supabase/functions/_backend/utils/supabase.ts'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

function createReadDevicesQueryMock() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: vi.fn((resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject)),
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
    },
    get: vi.fn((key: string) => key === 'requestId' ? 'test-request' : undefined),
  }
}

beforeEach(() => {
  vi.mocked(createClient).mockReset()
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
})
