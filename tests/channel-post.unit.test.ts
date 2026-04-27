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
  isValidAppId,
}))

function buildSupabaseChain(body: { ownerOrg?: string, versionId?: number }) {
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
})
