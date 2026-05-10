import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkPermissionMock = vi.fn()
const supabaseApikeyMock = vi.fn()
const closeClientMock = vi.fn()
const logPgErrorMock = vi.fn()
const queryMock = vi.fn()
const releaseMock = vi.fn()
const connectMock = vi.fn()
const pgClientMock = { connect: connectMock }

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: (...args: unknown[]) => supabaseApikeyMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: (...args: unknown[]) => closeClientMock(...args),
  getPgClient: () => pgClientMock,
  logPgError: (...args: unknown[]) => logPgErrorMock(...args),
}))

const { setChannel } = await import('../supabase/functions/_backend/public/bundle/set_channel.ts')

function queryBuilderFactory(table: string) {
  const rows: Record<string, unknown> = {
    apps: { owner_org: '046a36ac-e03c-4590-9257-bd6c9dba9ee8' },
    app_versions: { id: 7, name: '1.0.0', app_id: 'com.example.app' },
    channels: { id: 42, name: 'production', app_id: 'com.example.app' },
  }

  return {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: rows[table], error: null }),
  }
}

function context() {
  return {
    get: vi.fn((key: string) => {
      if (key === 'capgkey')
        return 'test-apikey'
      if (key === 'requestId')
        return 'test-request'
      return undefined
    }),
    json: vi.fn((body: unknown) => Response.json(body)),
  }
}

describe('bundle set channel RBAC guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPermissionMock.mockResolvedValue(true)
    supabaseApikeyMock.mockReturnValue({
      from: vi.fn((table: string) => queryBuilderFactory(table)),
    })
    queryMock.mockImplementation(async (text: string) => ({
      rowCount: text.includes('UPDATE public.channels') ? 1 : undefined,
    }))
    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock,
    })
  })

  it('checks promotion permission against the target channel', async () => {
    const c = context()

    const response = await setChannel(c as any, {
      app_id: 'com.example.app',
      version_id: 7,
      channel_id: 42,
    }, { key: 'test-apikey' } as any)

    expect(response.status).toBe(200)
    expect(checkPermissionMock).toHaveBeenNthCalledWith(1, c, 'channel.promote_bundle', {
      appId: 'com.example.app',
    })
    expect(checkPermissionMock).toHaveBeenNthCalledWith(2, c, 'channel.promote_bundle', {
      appId: 'com.example.app',
      channelId: 42,
    })
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE public.channels'), [
      7,
      42,
      'com.example.app',
      '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    ])
  })

  it('does not update the channel when channel-scoped promotion is denied', async () => {
    const c = context()
    checkPermissionMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await expect(setChannel(c as any, {
      app_id: 'com.example.app',
      version_id: 7,
      channel_id: 42,
    }, { key: 'test-apikey' } as any)).rejects.toHaveProperty('status', 400)

    expect(checkPermissionMock).toHaveBeenNthCalledWith(1, c, 'channel.promote_bundle', {
      appId: 'com.example.app',
    })
    expect(checkPermissionMock).toHaveBeenNthCalledWith(2, c, 'channel.promote_bundle', {
      appId: 'com.example.app',
      channelId: 42,
    })
    expect(connectMock).not.toHaveBeenCalled()
  })
})
