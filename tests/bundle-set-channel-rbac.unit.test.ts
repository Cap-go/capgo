import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkPermissionMock = vi.fn()
const closeClientMock = vi.fn()
const logPgErrorMock = vi.fn()
const queryMock = vi.fn()
const releaseMock = vi.fn()
const connectMock = vi.fn()
const pgClientMock = { connect: connectMock }

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: (...args: unknown[]) => closeClientMock(...args),
  getPgClient: () => pgClientMock,
  logPgError: (...args: unknown[]) => logPgErrorMock(...args),
}))

const { setChannel } = await import('../supabase/functions/_backend/public/bundle/set_channel.ts')

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
    queryMock.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.channels')) {
        return { rowCount: 1, rows: [{ name: 'production', owner_org: '046a36ac-e03c-4590-9257-bd6c9dba9ee8' }] }
      }
      if (text.includes('FROM public.app_versions')) {
        return { rowCount: 1, rows: [{ name: '1.0.0' }] }
      }
      return {
        rowCount: text.includes('UPDATE public.channels') ? 1 : undefined,
        rows: [],
      }
    })
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
    expect(checkPermissionMock).toHaveBeenCalledTimes(1)
    expect(checkPermissionMock).toHaveBeenCalledWith(c, 'channel.promote_bundle', {
      appId: 'com.example.app',
      channelId: 42,
    })
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('FROM public.app_versions'), [
      7,
      'com.example.app',
    ])
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('FROM public.channels'), [
      42,
      'com.example.app',
    ])
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE public.channels'), [
      7,
      42,
      'com.example.app',
      '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    ])
  })

  it('does not update the channel when channel-scoped promotion is denied', async () => {
    const c = context()
    checkPermissionMock.mockResolvedValueOnce(false)

    await expect(setChannel(c as any, {
      app_id: 'com.example.app',
      version_id: 7,
      channel_id: 42,
    }, { key: 'test-apikey' } as any)).rejects.toHaveProperty('status', 400)

    expect(checkPermissionMock).toHaveBeenCalledTimes(1)
    expect(checkPermissionMock).toHaveBeenCalledWith(c, 'channel.promote_bundle', {
      appId: 'com.example.app',
      channelId: 42,
    })
    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('FROM public.channels'), [
      42,
      'com.example.app',
    ])
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('FROM public.app_versions'), expect.anything())
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE public.channels'), expect.anything())
  })
})
