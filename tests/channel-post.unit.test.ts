import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateOrCreateChannel = vi.fn()
const checkPermission = vi.fn()
const setChannel = vi.fn()
const supabaseAdmin = vi.fn()
const supabaseApikey = vi.fn()
const isValidAppId = vi.fn()
const cleanupChannelQuery = {
  delete: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
}
const cleanupSupabase = {
  from: vi.fn(),
}

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
  supabaseAdmin,
  supabaseApikey,
  updateOrCreateChannel,
}))

vi.mock('../supabase/functions/_backend/public/bundle/set_channel.ts', () => ({
  setChannel,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  isInternalVersionName: (version: string) => version === 'builtin' || version === 'unknown',
  isValidAppId,
}))

function buildAdminChain(body: {
  existingChannelId?: number | null
  existingChannelVersion?: number | null
  existingRolloutVersion?: number | null
  ownerOrg?: string
  versionId?: number
  versionError?: { message: string } | null
  eqCalls?: Array<[string, unknown]>
  fromCalls?: string[]
} = {}) {
  return {
    from(table: string) {
      body.fromCalls?.push(table)
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
            eq() {
              return this
            },
            maybeSingle: async () => ({
              data: body.existingChannelId == null
                ? null
                : {
                    id: body.existingChannelId,
                    version: body.existingChannelVersion ?? null,
                    rollout_version: body.existingRolloutVersion ?? null,
                  },
              error: null,
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
            single: async () => body.versionError ? { data: null, error: body.versionError } : { data: { id: body.versionId ?? 123 }, error: null },
          }),
        }
      }

      throw new Error(`Unexpected admin table: ${table}`)
    },
  }
}

function apiKey() {
  return { user_id: 'user-test', key: 'capg-key' } as any
}

function context() {
  return {
    get: vi.fn((key: string) => {
      if (key === 'auth')
        return { authType: 'apikey', userId: 'user-test', apikey: apiKey() }
      if (key === 'requestId')
        return 'channel-post-test'
      return undefined
    }),
    json: vi.fn().mockReturnValue({ ok: true }),
  } as any
}

describe('public channel post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPermission.mockResolvedValue(true)
    isValidAppId.mockReturnValue(true)
    supabaseAdmin.mockImplementation(() => buildAdminChain())
    supabaseApikey.mockReturnValue(cleanupSupabase)
    cleanupSupabase.from.mockReturnValue(cleanupChannelQuery)
    cleanupChannelQuery.delete.mockReturnValue(cleanupChannelQuery)
    cleanupChannelQuery.eq.mockReturnValue(cleanupChannelQuery)
    cleanupChannelQuery.select.mockResolvedValue({ data: [{ id: 99 }], error: null })
    updateOrCreateChannel.mockResolvedValue({ data: { id: 99 }, error: null })
    setChannel.mockResolvedValue(new Response(null, { status: 200 }))
  })

  it('defaults legacy public mobile channel writes to electron false', async () => {
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')
    const c = context()

    await post(c, {
      app_id: 'com.test.legacy-mobile',
      channel: 'ios-default',
      version: '1.0.0',
      public: true,
      ios: true,
      android: false,
    }, apiKey())

    expect(updateOrCreateChannel).toHaveBeenCalledWith(
      c,
      expect.objectContaining({
        app_id: 'com.test.legacy-mobile',
        name: 'ios-default',
        public: true,
        ios: true,
        android: false,
        electron: false,
      }),
      null,
      false,
    )
    expect(c.json).toHaveBeenCalledWith({ status: 'ok' })
  })

  it('preserves explicit electron platform selection', async () => {
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')
    const c = context()

    await post(c, {
      app_id: 'com.test.explicit-electron',
      channel: 'all-platforms',
      version: '1.0.0',
      public: true,
      ios: true,
      android: true,
      electron: true,
    }, apiKey())

    expect(updateOrCreateChannel).toHaveBeenCalledWith(c, expect.objectContaining({ electron: true }), null, false)
  })

  it('keeps legacy all-platform public writes electron-compatible when both mobile flags are true', async () => {
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')
    const c = context()

    await post(c, {
      app_id: 'com.test.legacy-all-platforms',
      channel: 'production',
      version: '1.0.0',
      public: true,
      ios: true,
      android: true,
    }, apiKey())

    expect(updateOrCreateChannel).toHaveBeenCalledWith(c, expect.not.objectContaining({ electron: false }), null, false)
  })

  it('preserves the stable version for a settings-only update without channel.read or bundle lookup', async () => {
    const fromCalls: string[] = []
    supabaseAdmin.mockImplementation(() => buildAdminChain({
      existingChannelId: 42,
      existingChannelVersion: 123,
      fromCalls,
    }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')
    const c = context()

    await post(c, {
      app_id: 'com.test.settings-only',
      channel: 'production',
      public: false,
    }, apiKey())

    expect(checkPermission).toHaveBeenCalledTimes(1)
    expect(checkPermission).toHaveBeenCalledWith(c, 'channel.update_settings', { appId: 'com.test.settings-only', channelId: 42 })
    expect(fromCalls).toEqual(['channels', 'apps'])
    expect(updateOrCreateChannel).toHaveBeenCalledWith(c, expect.objectContaining({ version: 123, public: false }), 42, true)
  })

  it('requires promote permission before explicit version lookup, even when the name is current', async () => {
    const fromCalls: string[] = []
    supabaseAdmin.mockImplementation(() => buildAdminChain({
      existingChannelId: 42,
      existingChannelVersion: 123,
      fromCalls,
    }))
    checkPermission
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await expect(post(context(), {
      app_id: 'com.test.same-version',
      channel: 'production',
      version: '1.0.0',
    }, apiKey())).rejects.toMatchObject({
      cause: expect.objectContaining({ error: 'cannot_access_app' }),
    })

    expect(checkPermission).toHaveBeenNthCalledWith(1, expect.anything(), 'channel.update_settings', { appId: 'com.test.same-version', channelId: 42 })
    expect(checkPermission).toHaveBeenNthCalledWith(2, expect.anything(), 'channel.promote_bundle', { appId: 'com.test.same-version', channelId: 42 })
    expect(fromCalls).toEqual(['channels', 'apps'])
    expect(updateOrCreateChannel).not.toHaveBeenCalled()
  })

  it('uses the admin version lookup after a scoped channel key proves settings and promote permissions', async () => {
    supabaseAdmin.mockImplementation(() => buildAdminChain({
      existingChannelId: 42,
      existingChannelVersion: 123,
      versionId: 456,
    }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')
    const c = context()

    await post(c, {
      app_id: 'com.test.channel-admin-version',
      channel: 'production',
      version: '2.0.0',
    }, apiKey())

    expect(checkPermission).toHaveBeenNthCalledWith(1, c, 'channel.update_settings', { appId: 'com.test.channel-admin-version', channelId: 42 })
    expect(checkPermission).toHaveBeenNthCalledWith(2, c, 'channel.promote_bundle', { appId: 'com.test.channel-admin-version', channelId: 42 })
    expect(updateOrCreateChannel).toHaveBeenCalledWith(c, expect.objectContaining({ version: 456 }), 42, false)
  })

  it('writes a rollout promotion as the stable version when body.version is omitted', async () => {
    supabaseAdmin.mockImplementation(() => buildAdminChain({
      existingChannelId: 42,
      existingChannelVersion: 123,
      existingRolloutVersion: 456,
    }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')
    const c = context()

    await post(c, {
      app_id: 'com.test.promote-rollout',
      channel: 'production',
      promoteToStable: true,
    }, apiKey())

    expect(checkPermission).toHaveBeenCalledWith(c, 'channel.promote_bundle', { appId: 'com.test.promote-rollout', channelId: 42 })
    expect(updateOrCreateChannel).toHaveBeenCalledWith(c, expect.objectContaining({ version: 456, rollout_version: null }), 42, false)
  })

  it('authorizes a new channel before resolving its requested bundle', async () => {
    const events: string[] = []
    const admin = buildAdminChain()
    updateOrCreateChannel.mockResolvedValue({ data: { id: 77 }, error: null })
    supabaseAdmin.mockImplementation(() => ({
      from(table: string) {
        events.push(`from:${table}`)
        return admin.from(table)
      },
    }))
    checkPermission.mockImplementation(async (_context: unknown, permission: string) => {
      events.push(`permission:${permission}`)
      return true
    })
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')
    const c = context()
    const key = apiKey()

    await post(c, {
      app_id: 'com.test.new-channel-version',
      channel: 'production',
      version: '1.0.0',
    }, key)

    expect(events).toEqual([
      'from:channels',
      'permission:app.create_channel',
      'from:apps',
      'permission:channel.promote_bundle',
      'from:app_versions',
    ])
    expect(updateOrCreateChannel).toHaveBeenCalledWith(c, expect.objectContaining({
      app_id: 'com.test.new-channel-version',
      name: 'production',
      version: null,
    }), null, false)
    expect(setChannel).toHaveBeenCalledWith(c, {
      app_id: 'com.test.new-channel-version',
      channel_id: 77,
      version_id: 123,
    }, key)
  })

  it('cleans up a new channel when its scoped promotion permission is denied', async () => {
    const fromCalls: string[] = []
    const c = context()
    updateOrCreateChannel.mockResolvedValue({ data: { id: 456 }, error: null })
    supabaseAdmin.mockImplementation(() => buildAdminChain({ fromCalls }))
    checkPermission
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await expect(post(c, {
      app_id: 'com.test.new-channel-permission-denied',
      channel: 'preview',
      version: '1.0.0',
    }, apiKey())).rejects.toMatchObject({
      cause: expect.objectContaining({ error: 'cannot_access_app' }),
    })

    expect(fromCalls).toEqual(['channels', 'apps'])
    expect(setChannel).not.toHaveBeenCalled()
    expect(supabaseApikey).toHaveBeenCalledWith(c, 'capg-key')
    expect(cleanupSupabase.from).toHaveBeenCalledWith('channels')
    expect(cleanupChannelQuery.delete).toHaveBeenCalledOnce()
    expect(cleanupChannelQuery.eq).toHaveBeenNthCalledWith(1, 'id', 456)
    expect(cleanupChannelQuery.eq).toHaveBeenNthCalledWith(2, 'app_id', 'com.test.new-channel-permission-denied')
    expect(cleanupChannelQuery.eq).toHaveBeenNthCalledWith(3, 'created_by', 'user-test')
    expect(cleanupChannelQuery.select).toHaveBeenCalledWith('id')
  })

  it('cleans up a new channel when its requested bundle cannot be found', async () => {
    const c = context()
    updateOrCreateChannel.mockResolvedValue({ data: { id: 457 }, error: null })
    supabaseAdmin.mockImplementation(() => buildAdminChain({
      versionError: { message: 'bundle not found' },
    }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await expect(post(c, {
      app_id: 'com.test.new-channel-version-missing',
      channel: 'preview',
      version: '1.0.0',
    }, apiKey())).rejects.toThrow('bundle not found')

    expect(setChannel).not.toHaveBeenCalled()
    expect(cleanupChannelQuery.eq).toHaveBeenNthCalledWith(1, 'id', 457)
    expect(cleanupChannelQuery.select).toHaveBeenCalledWith('id')
  })

  it('cleans up a new channel when bundle association fails', async () => {
    const associationError = new Error('Cannot associate bundle with the new channel')
    const c = context()
    const key = apiKey()
    updateOrCreateChannel.mockResolvedValue({ data: { id: 458 }, error: null })
    setChannel.mockRejectedValue(associationError)
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await expect(post(c, {
      app_id: 'com.test.new-channel-association-failure',
      channel: 'preview',
      version: '1.0.0',
    }, key)).rejects.toBe(associationError)

    expect(setChannel).toHaveBeenCalledWith(c, {
      app_id: 'com.test.new-channel-association-failure',
      channel_id: 458,
      version_id: 123,
    }, key)
    expect(cleanupChannelQuery.eq).toHaveBeenNthCalledWith(1, 'id', 458)
    expect(cleanupChannelQuery.select).toHaveBeenCalledWith('id')
    expect(c.json).not.toHaveBeenCalled()
  })

  it('requires promote bundle permission to explicitly clear a channel version', async () => {
    supabaseAdmin.mockImplementation(() => buildAdminChain({ existingChannelId: 42, existingChannelVersion: 123 }))
    checkPermission
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await expect(post(context(), {
      app_id: 'com.test.clear-version',
      channel: 'production',
      version: null,
    }, apiKey())).rejects.toMatchObject({
      cause: expect.objectContaining({ error: 'cannot_access_app' }),
    })

    expect(updateOrCreateChannel).not.toHaveBeenCalled()
  })

  it('filters numeric rollout target ids to active bundles', async () => {
    const eqCalls: Array<[string, unknown]> = []
    supabaseAdmin.mockImplementation(() => buildAdminChain({
      existingChannelId: 42,
      existingChannelVersion: 123,
      versionId: 456,
      eqCalls,
    }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await post(context(), {
      app_id: 'com.test.rollout-id',
      channel: 'production',
      rolloutVersion: 456,
    }, apiKey())

    const rolloutIdCallIndex = eqCalls.findIndex(([column, value]) => column === 'id' && value === 456)
    expect(rolloutIdCallIndex).toBeGreaterThanOrEqual(0)
    expect(eqCalls.slice(rolloutIdCallIndex)).toContainEqual(['deleted', false])
    expect(checkPermission).toHaveBeenCalledWith(expect.anything(), 'channel.promote_bundle', { appId: 'com.test.rollout-id', channelId: 42 })
  })

  it('rejects rollout target changes without channel promote permission', async () => {
    supabaseAdmin.mockImplementation(() => buildAdminChain({ existingChannelId: 42, existingChannelVersion: 123 }))
    checkPermission
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await expect(post(context(), {
      app_id: 'com.test.rollout-auth',
      channel: 'production',
      rolloutVersion: '2.0.0',
    }, apiKey())).rejects.toMatchObject({
      cause: expect.objectContaining({ error: 'cannot_promote_bundle' }),
    })

    expect(updateOrCreateChannel).not.toHaveBeenCalled()
  })

  it('rejects rollout targets when a channel has no stable bundle', async () => {
    supabaseAdmin.mockImplementation(() => buildAdminChain({ existingChannelId: 42, existingChannelVersion: null }))
    const { post } = await import('../supabase/functions/_backend/public/channel/post.ts')

    await expect(post(context(), {
      app_id: 'com.test.rollout-no-stable',
      channel: 'new-rollout-channel',
      rolloutVersion: '2.0.0',
    }, apiKey())).rejects.toMatchObject({
      cause: expect.objectContaining({ error: 'missing_stable_version' }),
    })

    expect(updateOrCreateChannel).not.toHaveBeenCalled()
  })
})
