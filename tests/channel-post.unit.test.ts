import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateOrCreateChannel = vi.fn()
const checkPermission = vi.fn()
const supabaseApikey = vi.fn()
const isValidAppId = vi.fn()

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
  updateOrCreateChannel,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  isInternalVersionName: (version: string) => version === 'builtin' || version === 'unknown',
  isValidAppId,
}))

function buildSupabaseChain(body: { existingChannelId?: number | null, existingChannelVersion?: number | null, existingRolloutVersion?: number | null, ownerOrg?: string, versionId?: number, eqCalls?: Array<[string, unknown]> }) {
  return {
    from(table: string) {
      if (table === 'apps') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { owner_org: body.ownerOrg ?? 'org-test' }, error: null }),
            }),
          }),
        }
      }

      if (table === 'channels') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: body.existingChannelId == null && body.existingChannelVersion == null && body.existingRolloutVersion == null
                    ? null
                    : {
                        id: body.existingChannelId ?? 99,
                        version: body.existingChannelVersion ?? null,
                        rollout_version: body.existingRolloutVersion ?? null,
                      },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }

      if (table === 'app_versions') {
        return {
          select: () => ({
            eq(column: string, value: unknown) {
              body.eqCalls?.push([column, value])
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
    isValidAppId.mockReturnValue(true)
    supabaseApikey.mockImplementation(() => buildSupabaseChain({}))
    updateOrCreateChannel.mockResolvedValue({ error: null })
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

    expect(updateOrCreateChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        app_id: 'com.test.legacy-mobile',
        name: 'ios-default',
        public: true,
        ios: true,
        android: false,
        electron: false,
      }),
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

    expect(updateOrCreateChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        electron: true,
      }),
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

    expect(updateOrCreateChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({
        electron: false,
      }),
    )
  })

  it('filters numeric rollout target ids to active bundles', async () => {
    const eqCalls: Array<[string, unknown]> = []
    supabaseApikey.mockImplementation(() => buildSupabaseChain({ existingChannelId: 42, existingChannelVersion: 123, versionId: 456, eqCalls }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await post(
      { json: vi.fn() } as any,
      {
        app_id: 'com.test.rollout-id',
        channel: 'production',
        version: '1.0.0',
        rolloutVersion: 456,
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )

    const rolloutIdCallIndex = eqCalls.findIndex(([column, value]) => column === 'id' && value === 456)
    expect(rolloutIdCallIndex).toBeGreaterThanOrEqual(0)
    expect(eqCalls.slice(rolloutIdCallIndex)).toContainEqual(['deleted', false])
    expect(checkPermission).toHaveBeenCalledWith(expect.anything(), 'channel.promote_bundle', { appId: 'com.test.rollout-id', channelId: 42 })
  })

  it('rejects rollout target changes without channel promote permission', async () => {
    supabaseApikey.mockImplementation(() => buildSupabaseChain({ existingChannelId: 42, existingChannelVersion: 123 }))
    checkPermission
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await expect(post(
      { json: vi.fn() } as any,
      {
        app_id: 'com.test.rollout-auth',
        channel: 'production',
        rolloutVersion: '2.0.0',
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )).rejects.toMatchObject({
      cause: expect.objectContaining({ error: 'cannot_promote_bundle' }),
    })

    expect(updateOrCreateChannel).not.toHaveBeenCalled()
  })

  it('rejects rollout targets when a channel has no stable bundle', async () => {
    supabaseApikey.mockImplementation(() => buildSupabaseChain({ existingChannelId: 42, existingChannelVersion: null }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await expect(post(
      { json: vi.fn() } as any,
      {
        app_id: 'com.test.rollout-no-stable',
        channel: 'new-rollout-channel',
        rolloutVersion: '2.0.0',
      },
      { user_id: 'user-test', key: 'capg-key' } as any,
    )).rejects.toMatchObject({
      cause: expect.objectContaining({ error: 'missing_stable_version' }),
    })

    expect(updateOrCreateChannel).not.toHaveBeenCalled()
  })
})
