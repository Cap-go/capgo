import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkPermissionMock = vi.fn()
const isValidAppIdMock = vi.fn()
const supabaseApikeyMock = vi.fn()
const supabaseWithAuthMock = vi.fn()
const syncChannelSelfOverrideDeleteMock = vi.fn()
const syncChannelSelfOverrideMock = vi.fn()
const updateOrCreateChannelDeviceMock = vi.fn()

vi.mock('../supabase/functions/_backend/utils/channelSelfStore.ts', () => ({
  syncChannelSelfOverride: syncChannelSelfOverrideMock,
  syncChannelSelfOverrideDelete: syncChannelSelfOverrideDeleteMock,
}))

vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  BRES: { status: 'ok' },
  parseBody: vi.fn(),
  quickError: (status: number, error: string, message: string, details: Record<string, unknown> = {}) => {
    const issue = new Error(message)
    ;(issue as Error & { cause?: unknown }).cause = { status, error, ...details }
    throw issue
  },
  simpleError: (error: string, message: string, details: Record<string, unknown> = {}) => {
    const issue = new Error(message)
    ;(issue as Error & { cause?: unknown }).cause = { error, ...details }
    throw issue
  },
  useCors: async (_c: unknown, next: () => Promise<void>) => next(),
}))

vi.mock('../supabase/functions/_backend/utils/hono_middleware.ts', () => ({
  middlewareV2: () => async (_c: unknown, next: () => Promise<void>) => next(),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: checkPermissionMock,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: supabaseApikeyMock,
  supabaseWithAuth: supabaseWithAuthMock,
  updateOrCreateChannelDevice: updateOrCreateChannelDeviceMock,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  isValidAppId: isValidAppIdMock,
}))

function createContext() {
  return {
    get: vi.fn((key: string) => {
      if (key === 'auth') {
        return {
          apikey: null,
          authType: 'jwt',
          jwt: 'Bearer jwt-test',
          userId: 'user-test',
        }
      }
      if (key === 'requestId')
        return 'request-test'
      return undefined
    }),
    json: vi.fn((body: unknown) => body),
  }
}

function createChannelSelect(channel = { id: 42, app_id: 'com.test.app', owner_org: 'org-test', public: false }) {
  return {
    select() {
      return this
    },
    eq() {
      return this
    },
    single: vi.fn(async () => ({ data: channel, error: null })),
  }
}

function createPublicApiSupabase() {
  return {
    from(table: string) {
      if (table === 'channels')
        return createChannelSelect()
      if (table === 'channel_devices') {
        return {
          delete() {
            return this
          },
          eq() {
            return this
          },
          then(resolve: (value: { error: null }) => unknown) {
            return Promise.resolve(resolve({ error: null }))
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

function createPrivateSupabase() {
  const upsertMock = vi.fn(async () => ({ error: null }))
  const deleteResult = { error: null }
  const deleteChain = {
    delete() {
      return this
    },
    eq() {
      return this
    },
    then(resolve: (value: { error: null }) => unknown) {
      return Promise.resolve(resolve(deleteResult))
    },
  }

  return {
    deleteChain,
    upsertMock,
    client: {
      from(table: string) {
        if (table === 'channels')
          return createChannelSelect()
        if (table === 'channel_devices') {
          return {
            upsert: upsertMock,
            ...deleteChain,
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('channel device override KV sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPermissionMock.mockResolvedValue(true)
    isValidAppIdMock.mockReturnValue(true)
    supabaseApikeyMock.mockReturnValue(createPublicApiSupabase())
    syncChannelSelfOverrideMock.mockResolvedValue(true)
    syncChannelSelfOverrideDeleteMock.mockResolvedValue(true)
    updateOrCreateChannelDeviceMock.mockResolvedValue({ error: null })
  })

  it('mirrors public device API channel override writes into channel_self KV', async () => {
    const { post } = await import('../supabase/functions/_backend/public/device/post.ts')
    const c = createContext()

    await post(c as any, {
      app_id: 'com.test.app',
      channel: 'beta',
      device_id: '11111111-1111-4111-8111-111111111111',
    }, { key: 'capg-key' } as any)

    expect(updateOrCreateChannelDeviceMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      app_id: 'com.test.app',
      channel_id: 42,
      device_id: '11111111-1111-4111-8111-111111111111',
      owner_org: 'org-test',
    }))
    expect(syncChannelSelfOverrideMock).toHaveBeenCalledWith(expect.anything(), {
      app_id: 'com.test.app',
      channel_id: 42,
      device_id: '11111111-1111-4111-8111-111111111111',
    })
  })

  it('mirrors public device API channel override deletes into channel_self KV', async () => {
    const { deleteOverride } = await import('../supabase/functions/_backend/public/device/delete.ts')
    const c = createContext()

    await deleteOverride(c as any, {
      app_id: 'com.test.app',
      device_id: '11111111-1111-4111-8111-111111111111',
    }, { key: 'capg-key' } as any)

    expect(syncChannelSelfOverrideDeleteMock).toHaveBeenCalledWith(
      expect.anything(),
      'com.test.app',
      '11111111-1111-4111-8111-111111111111',
    )
  })

  it('mirrors dashboard channel override writes into channel_self KV', async () => {
    const privateSupabase = createPrivateSupabase()
    supabaseWithAuthMock.mockReturnValue(privateSupabase.client)
    const { setChannelDeviceOverride } = await import('../supabase/functions/_backend/private/channel_device.ts')
    const c = createContext()

    await setChannelDeviceOverride(c as any, {
      app_id: 'com.test.app',
      channel_id: 42,
      device_id: '11111111-1111-4111-8111-111111111111',
    })

    expect(privateSupabase.upsertMock).toHaveBeenCalledWith({
      app_id: 'com.test.app',
      channel_id: 42,
      device_id: '11111111-1111-4111-8111-111111111111',
      owner_org: 'org-test',
    }, { onConflict: 'app_id,device_id' })
    expect(syncChannelSelfOverrideMock).toHaveBeenCalledWith(expect.anything(), {
      app_id: 'com.test.app',
      channel_id: 42,
      device_id: '11111111-1111-4111-8111-111111111111',
      owner_org: 'org-test',
    })
  })

  it('mirrors dashboard channel override deletes into channel_self KV', async () => {
    const privateSupabase = createPrivateSupabase()
    supabaseWithAuthMock.mockReturnValue(privateSupabase.client)
    const { deleteChannelDeviceOverride } = await import('../supabase/functions/_backend/private/channel_device.ts')
    const c = createContext()

    await deleteChannelDeviceOverride(c as any, {
      app_id: 'com.test.app',
      device_id: '11111111-1111-4111-8111-111111111111',
    })

    expect(syncChannelSelfOverrideDeleteMock).toHaveBeenCalledWith(
      expect.anything(),
      'com.test.app',
      '11111111-1111-4111-8111-111111111111',
    )
  })
})
