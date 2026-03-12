import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetSession = vi.fn()
const mockSignOut = vi.fn()

vi.mock('~/services/supabase', () => ({
  defaultApiHost: 'https://api.capgo.test',
  useSupabase: () => ({
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  }),
}))

function createSessionStorageMock() {
  const store = new Map<string, string>()

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
  }
}

async function getGuard() {
  const router = {
    beforeEach: vi.fn(),
  }

  const { install } = await import('../src/modules/sso-enforcement.ts')
  install({ router } as any)

  const guard = router.beforeEach.mock.calls[0]?.[0]
  if (!guard)
    throw new Error('SSO enforcement guard was not registered')

  return guard
}

describe('sso enforcement redirect handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()

    vi.stubGlobal('sessionStorage', createSessionStorageMock())
    vi.stubGlobal('fetch', vi.fn())

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
          user: {
            id: 'user-123',
            email: 'user@capgo.app',
            app_metadata: {
              provider: 'email',
            },
          },
        },
      },
    })
    mockSignOut.mockResolvedValue({ error: null })
  })

  it('redirects to a technical error when the enforcement endpoint returns a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)

    const guard = await getGuard()
    const next = vi.fn()

    await guard({ path: '/dashboard' }, { path: '/login' }, next)

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith('/login?sso_error=enforcement_check_failed')
  })

  it('keeps the explicit SSO-required redirect when enforcement denies password auth', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ allowed: false }),
    } as unknown as Response)

    const guard = await getGuard()
    const next = vi.fn()

    await guard({ path: '/dashboard' }, { path: '/login' }, next)

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith('/login?sso_required=true')
  })
})
