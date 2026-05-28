import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkPermission = vi.fn()
const supabaseApikey = vi.fn()
const isValidAppId = vi.fn()
const channelUpsert = vi.fn()

vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  BRES: { status: 'ok' },
  simpleError: (error: string, message: string, details: Record<string, unknown> = {}) => {
    const issue = new Error(message)
    ;(issue as Error & { cause?: unknown }).cause = { error, ...details }
    throw issue
  },
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlogErr: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  isInternalVersionName: (version: string) => version === 'builtin' || version === 'unknown',
  isValidAppId,
}))

function buildSupabaseChain(body: { ownerOrg?: string, versionId?: number, existingChannel?: { id: number, version: number | null, created_by: string } | null }) {
  return {
    from(table: string) {
      if (table === 'channels') {
        return {
          select: () => ({
            eq() {
              return this
            },
            maybeSingle: async () => ({
              data: body.existingChannel ?? null,
              error: null,
            }),
          }),
          upsert: channelUpsert,
        }
      }

      if (table === 'apps') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { owner_org: body.ownerOrg ?? 'org-test' }, error: null }),
            }),
          }),
        }
      }

      if (table === 'app_versions') {
        return {
          select: () => ({
            eq() {
              return this
            },
            single: async () => ({ data: { id: body.versionId ?? 123 }, error: null }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('public channel post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPermission.mockResolvedValue(true)
    channelUpsert.mockReturnValue({ throwOnError: vi.fn().mockResolvedValue({ error: null }) })
    isValidAppId.mockReturnValue(true)
    supabaseApikey.mockImplementation(() => buildSupabaseChain({}))
  })

  it('defaults legacy public mobile channel writes to electron false', async () => {
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    const json = vi.fn().mockReturnValue({ ok: true })
    await post(
      { json } as any,
      {
        app_id: 'com.test.legacy-mobile',
        channel: 'ios-default',
        version: '1.0.0',
        public: true,
        ios: true,
        android: false,
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )

    expect(channelUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: 'com.test.legacy-mobile',
        name: 'ios-default',
        public: true,
        ios: true,
        android: false,
        electron: false,
      }),
      { onConflict: 'app_id, name' },
    )
    expect(json).toHaveBeenCalledWith({ status: 'ok' })
  })

  it('preserves explicit electron platform selection', async () => {
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await post(
      { json: vi.fn() } as any,
      {
        app_id: 'com.test.explicit-electron',
        channel: 'all-platforms',
        version: '1.0.0',
        public: true,
        ios: true,
        android: true,
        electron: true,
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )

    expect(channelUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        electron: true,
      }),
      { onConflict: 'app_id, name' },
    )
  })

  it('keeps legacy all-platform public writes electron-compatible when both mobile flags are true', async () => {
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await post(
      { json: vi.fn() } as any,
      {
        app_id: 'com.test.legacy-all-platforms',
        channel: 'production',
        version: '1.0.0',
        public: true,
        ios: true,
        android: true,
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )

    expect(channelUpsert.mock.calls[0][0]).not.toEqual(expect.objectContaining({ electron: false }))
  })

  it('requires create-channel and promote-bundle permissions when creating a channel with a concrete bundle', async () => {
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await post(
      { json: vi.fn() } as any,
      {
        app_id: 'com.test.new-channel-with-version',
        channel: 'production',
        version: '1.0.0',
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )

    expect(checkPermission).toHaveBeenNthCalledWith(1, expect.anything(), 'app.create_channel', { appId: 'com.test.new-channel-with-version' })
    expect(checkPermission).toHaveBeenNthCalledWith(2, expect.anything(), 'channel.promote_bundle', { appId: 'com.test.new-channel-with-version' })
  })

  it('requires only channel settings permission when updating an existing channel without changing bundle state', async () => {
    supabaseApikey.mockImplementation(() =>
      buildSupabaseChain({
        existingChannel: { id: 42, version: null, created_by: 'original-user' },
      }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await post(
      { json: vi.fn() } as any,
      {
        app_id: 'com.test.existing-channel',
        channel: 'production',
        public: false,
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )

    expect(checkPermission).toHaveBeenCalledTimes(1)
    expect(checkPermission).toHaveBeenCalledWith(expect.anything(), 'channel.update_settings', { appId: 'com.test.existing-channel', channelId: 42 })
  })

  it('does not require promote permission when an old client sends the already-linked bundle while updating settings', async () => {
    supabaseApikey.mockImplementation(() =>
      buildSupabaseChain({
        versionId: 123,
        existingChannel: { id: 45, version: 123, created_by: 'original-user' },
      }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await post(
      { json: vi.fn() } as any,
      {
        app_id: 'com.test.existing-channel-same-bundle',
        channel: 'production',
        version: '1.0.0',
        allow_dev: false,
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )

    expect(checkPermission).toHaveBeenCalledTimes(1)
    expect(checkPermission).toHaveBeenCalledWith(expect.anything(), 'channel.update_settings', { appId: 'com.test.existing-channel-same-bundle', channelId: 45 })
  })

  it('requires channel promote permission when updating an existing channel bundle', async () => {
    supabaseApikey.mockImplementation(() =>
      buildSupabaseChain({
        existingChannel: { id: 43, version: null, created_by: 'original-user' },
      }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await post(
      { json: vi.fn() } as any,
      {
        app_id: 'com.test.existing-channel-promote',
        channel: 'production',
        version: '1.0.1',
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )

    expect(checkPermission).toHaveBeenNthCalledWith(1, expect.anything(), 'channel.update_settings', { appId: 'com.test.existing-channel-promote', channelId: 43 })
    expect(checkPermission).toHaveBeenNthCalledWith(2, expect.anything(), 'channel.promote_bundle', { appId: 'com.test.existing-channel-promote', channelId: 43 })
  })

  it('keeps existing no-op channel updates from writing', async () => {
    const json = vi.fn()
    supabaseApikey.mockImplementation(() =>
      buildSupabaseChain({
        ownerOrg: 'org-test',
        versionId: 123,
        existingChannel: {
          id: 44,
          app_id: 'com.test.noop-channel',
          name: 'production',
          version: 123,
          created_by: 'original-user',
          owner_org: 'org-test',
        } as any,
      }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await post(
      { json } as any,
      {
        app_id: 'com.test.noop-channel',
        channel: 'production',
        version: '1.0.0',
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )

    expect(channelUpsert).not.toHaveBeenCalled()
    expect(json).toHaveBeenCalledWith({ status: 'ok' })
  })
})
