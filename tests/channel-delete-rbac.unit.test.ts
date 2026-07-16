import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkPermissionMock = vi.fn()
const supabaseApikeyMock = vi.fn()

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: (...args: unknown[]) => supabaseApikeyMock(...args),
}))

const { deleteChannel } = await import('../supabase/functions/_backend/public/channel/delete.ts')

function createChannelBuilder() {
  const deleteResult = {
    data: [{ id: 42 }],
    error: null,
  }
  const builder = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({
      data: { id: 42 },
      error: null,
    }),
  }
  builder.select.mockImplementation(() => builder.delete.mock.calls.length > 0 ? Promise.resolve(deleteResult) : builder)
  return { ...builder, deleteResult }
}

function context() {
  return {
    get: vi.fn((key: string) => {
      if (key === 'capgkey')
        return 'test-apikey'
      return undefined
    }),
    json: vi.fn((body: unknown) => Response.json(body)),
  }
}

describe('channel delete RBAC guard', () => {
  let channelBuilder: ReturnType<typeof createChannelBuilder>
  let c: ReturnType<typeof context>

  beforeEach(() => {
    vi.clearAllMocks()
    channelBuilder = createChannelBuilder()
    c = context()
    checkPermissionMock.mockResolvedValue(true)
    supabaseApikeyMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== 'channels')
          throw new Error(`Unexpected table: ${table}`)
        return channelBuilder
      }),
    })
  })

  it('checks delete permission against the target channel', async () => {
    const response = await deleteChannel(c as any, {
      app_id: 'com.example.app',
      channel: 'production',
    }, { key: 'test-apikey' } as any)

    expect(response.status).toBe(200)
    expect(checkPermissionMock).toHaveBeenCalledTimes(1)
    expect(checkPermissionMock).toHaveBeenCalledWith(c, 'channel.delete', {
      appId: 'com.example.app',
      channelId: 42,
    })
    expect(channelBuilder.delete).toHaveBeenCalledTimes(1)
    expect(channelBuilder.eq).toHaveBeenCalledWith('id', 42)
  })

  it('fails when channel deletion affects no rows', async () => {
    channelBuilder.deleteResult.data = []

    await expect(deleteChannel(c as any, {
      app_id: 'com.example.app',
      channel: 'production',
    }, { key: 'test-apikey' } as any)).rejects.toHaveProperty('status', 400)

    expect(channelBuilder.select).toHaveBeenCalledWith('id')
  })

  it('does not delete the channel when channel-scoped delete is denied', async () => {
    checkPermissionMock.mockResolvedValueOnce(false)

    await expect(deleteChannel(c as any, {
      app_id: 'com.example.app',
      channel: 'production',
    }, { key: 'test-apikey' } as any)).rejects.toHaveProperty('status', 400)

    expect(checkPermissionMock).toHaveBeenCalledTimes(1)
    expect(checkPermissionMock).toHaveBeenCalledWith(c, 'channel.delete', {
      appId: 'com.example.app',
      channelId: 42,
    })
    expect(channelBuilder.delete).not.toHaveBeenCalled()
  })
})
