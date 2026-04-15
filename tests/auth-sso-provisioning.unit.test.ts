import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetClaims = vi.fn()
const mockGetSession = vi.fn()
const mockGetAuthenticatorAssuranceLevel = vi.fn()
const mockRpc = vi.fn()
const mockSignOut = vi.fn()
const mockSetUser = vi.fn()
const mockSendEvent = vi.fn().mockResolvedValue(undefined)
const mockHideLoader = vi.fn()
const mockCreateSignedImageUrl = vi.fn(async (value: string) => value)
const mockGetPlans = vi.fn(async () => [])
const mockIsPlatformAdmin = vi.fn(async () => false)

const mainStore = {
  auth: undefined as any,
  user: undefined as any,
  isAdmin: false,
  plans: [] as any[],
}

const organizationStore = {
  organizations: [] as Array<{ gid: string, role: string }>,
  hasOrganizations: false,
  fetchOrganizations: vi.fn(async () => {}),
  dedupFetchOrganizations: vi.fn(async () => {}),
}

function createUsersQuery(userRecord: Record<string, unknown>) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: userRecord,
          error: null,
        })),
      })),
    })),
  }
}

vi.mock('~/services/loader', () => ({
  hideLoader: mockHideLoader,
}))

vi.mock('~/services/posthog', () => ({
  setUser: mockSetUser,
}))

vi.mock('~/services/storage', () => ({
  createSignedImageUrl: mockCreateSignedImageUrl,
}))

vi.mock('~/services/tracking', () => ({
  sendEvent: mockSendEvent,
}))

vi.mock('~/services/supabase', () => ({
  getLocalConfig: () => ({ supaHost: 'https://supabase.capgo.test' }),
  getPlans: mockGetPlans,
  isPlatformAdmin: mockIsPlatformAdmin,
  useSupabase: () => ({
    auth: {
      getClaims: mockGetClaims,
      getSession: mockGetSession,
      getAuthenticatorAssuranceLevel: mockGetAuthenticatorAssuranceLevel,
      mfa: {
        getAuthenticatorAssuranceLevel: mockGetAuthenticatorAssuranceLevel,
      },
      signOut: mockSignOut,
    },
    rpc: mockRpc,
    from: vi.fn(() => createUsersQuery({
      id: 'user-123',
      email: 'user@managed.test',
      first_name: 'Managed',
      last_name: 'User',
      image_url: null,
    })),
  }),
  defaultApiHost: 'https://api.capgo.test',
}))

vi.mock('~/stores/main', () => ({
  useMainStore: () => mainStore,
}))

vi.mock('~/stores/organization', () => ({
  useOrganizationStore: () => organizationStore,
}))

async function getGuard() {
  const router = {
    beforeEach: vi.fn(),
  }

  const { install } = await import('../src/modules/auth.ts')
  install({ router } as any)

  const guard = router.beforeEach.mock.calls[0]?.[0]
  if (!guard)
    throw new Error('Auth guard was not registered')

  return guard
}

describe('auth guard SSO provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()

    mainStore.auth = undefined
    mainStore.user = undefined
    mainStore.isAdmin = false
    mainStore.plans = []

    organizationStore.organizations = []
    organizationStore.hasOrganizations = false
    organizationStore.fetchOrganizations = vi.fn(async () => {
      organizationStore.organizations = [{ gid: 'org-123', role: 'read' }]
      organizationStore.hasOrganizations = true
    })
    organizationStore.dedupFetchOrganizations = vi.fn(async () => {})

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    })))

    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'user-123',
        },
      },
    })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
          user: {
            id: 'user-123',
            email: 'user@managed.test',
            email_confirmed_at: '2026-04-15T10:00:00.000Z',
            app_metadata: {
              provider: 'sso:provider-123',
              providers: ['sso:provider-123'],
            },
          },
        },
      },
    })
    mockGetAuthenticatorAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: 'aal1',
        nextLevel: 'aal1',
      },
      error: null,
    })
    mockRpc.mockResolvedValue({
      data: false,
      error: null,
    })
    mockSignOut.mockResolvedValue({ error: null })
  })

  it('provisions an SSO session before redirecting to org onboarding and keeps the user on the target route', async () => {
    const guard = await getGuard()
    const next = vi.fn()

    await guard(
      { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
      { path: '/login', fullPath: '/login', meta: {}, query: {} },
      next,
    )

    expect(fetch).toHaveBeenCalledWith('https://api.capgo.test/private/sso/provision-user', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123',
      }),
    }))
    expect(organizationStore.fetchOrganizations).toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
    expect(next).not.toHaveBeenCalledWith('/onboarding/organization')
  })

  it('keeps redirecting non-SSO users without organizations to org onboarding', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
          user: {
            id: 'user-123',
            email: 'user@managed.test',
            email_confirmed_at: '2026-04-15T10:00:00.000Z',
            app_metadata: {
              provider: 'email',
              providers: ['email'],
            },
          },
        },
      },
    })

    organizationStore.fetchOrganizations = vi.fn(async () => {
      organizationStore.organizations = []
      organizationStore.hasOrganizations = false
    })

    const guard = await getGuard()
    const next = vi.fn()

    await guard(
      { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
      { path: '/login', fullPath: '/login', meta: {}, query: {} },
      next,
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith({
      path: '/onboarding/organization',
      query: {
        to: '/dashboard',
      },
    })
  })

  it('aborts navigation for managed SSO users when provisioning fails instead of redirecting to org onboarding', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'provider_lookup_failed' }),
    })))

    organizationStore.fetchOrganizations = vi.fn(async () => {
      organizationStore.organizations = []
      organizationStore.hasOrganizations = false
    })

    const guard = await getGuard()
    const next = vi.fn()

    await guard(
      { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
      { path: '/login', fullPath: '/login', meta: {}, query: {} },
      next,
    )

    expect(fetch).toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(false)
    expect(next).not.toHaveBeenCalledWith({
      path: '/onboarding/organization',
      query: {
        to: '/dashboard',
      },
    })
  })
})
