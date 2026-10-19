import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { allowOnboardingDashboardExploration } from '../src/utils/onboardingRedirect'

interface MockFetchResponse {
  ok: boolean
  json: () => Promise<Record<string, unknown>>
}

function createUsersQuery(userRecord: Record<string, unknown>) {
  const query = {
    limit: vi.fn(async () => ({
      data: [],
      error: null,
    })),
    maybeSingle: vi.fn(async () => ({
      data: userRecord,
      error: null,
    })),
  }

  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => query),
    })),
  }
}

function createTestContext() {
  const userRecord = {
    id: 'user-123',
    email: 'user@managed.test',
    first_name: 'Managed',
    last_name: 'User',
    image_url: null,
  }

  const mainStore = {
    auth: undefined as any,
    user: undefined as any,
    isAdmin: false,
    plans: [] as any[],
    resolvePlatformAdminStatus: vi.fn<() => Promise<boolean>>(),
  }

  const organizationStore = {
    organizations: [] as Array<{ gid: string, role: string }>,
    hasOrganizations: false,
    fetchOrganizations: vi.fn(async () => {
      organizationStore.organizations = [{ gid: 'org-123', role: 'read' }]
      organizationStore.hasOrganizations = true
    }),
    dedupFetchOrganizations: vi.fn(async () => {}),
    awaitInitialLoad: vi.fn(async () => {}),
    setCurrentOrganization: vi.fn(),
  }

  const mockGetClaims = vi.fn().mockResolvedValue({
    data: {
      claims: {
        sub: 'user-123',
      },
    },
  })

  const mockGetSession = vi.fn().mockResolvedValue({
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

  const mockGetAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
    data: {
      currentLevel: 'aal1',
      nextLevel: 'aal1',
    },
    error: null,
  })

  const mockRpc = vi.fn().mockResolvedValue({
    data: false,
    error: null,
  })

  const mockSignOut = vi.fn().mockResolvedValue({ error: null })
  const mockSetUser = vi.fn()
  const mockSendEvent = vi.fn().mockResolvedValue(undefined)
  const mockHideLoader = vi.fn()
  const mockCreateSignedImageUrl = vi.fn(async (value: string) => value)
  const mockGetPlans = vi.fn<() => Promise<any[]>>(async () => [])
  const mockIsPlatformAdmin = vi.fn(async () => false)
  const mockSetWebsitePaidUserCookie = vi.fn()
  mainStore.resolvePlatformAdminStatus.mockImplementation(async () => {
    const status = await mockIsPlatformAdmin()
    mainStore.isAdmin = status
    if (status)
      mockSetWebsitePaidUserCookie(true)
    return status
  })
  const mockFetch = vi.fn<(...args: unknown[]) => Promise<MockFetchResponse>>(async () => ({
    ok: true,
    json: async () => ({ success: true }),
  }))
  const mockApps: Array<{ app_id: string, need_onboarding: boolean, owner_org?: string }> = []
  const mockFrom = vi.fn((table: string) => {
    if (table === 'apps') {
      const filters = new Map<string, unknown>()
      const rows = () => mockApps.filter(app => [...filters].every(([key, value]) => app[key as keyof typeof app] === undefined || app[key as keyof typeof app] === value))
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((key: string, value: unknown) => {
          filters.set(key, value)
          return query
        }),
        limit: vi.fn(async () => ({ data: rows(), error: null })),
        maybeSingle: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
      }
      return query
    }

    return createUsersQuery(userRecord)
  })

  return {
    mainStore,
    mockCreateSignedImageUrl,
    mockApps,
    mockFetch,
    mockFrom,
    mockGetAuthenticatorAssuranceLevel,
    mockGetClaims,
    mockGetPlans,
    mockHideLoader,
    mockIsPlatformAdmin,
    mockRpc,
    mockSendEvent,
    mockSetUser,
    mockSetWebsitePaidUserCookie,
    mockGetSession,
    mockSignOut,
    organizationStore,
  }
}

type AuthGuardTestContext = ReturnType<typeof createTestContext>

const contextStorage = new AsyncLocalStorage<AuthGuardTestContext>()

function getContext() {
  const context = contextStorage.getStore()
  if (!context)
    throw new Error('Missing auth guard test context')

  return context
}

async function withTestContext(run: (context: AuthGuardTestContext) => Promise<void>) {
  const context = createTestContext()

  await contextStorage.run(context, async () => {
    await run(context)
  })
}

vi.mock('~/services/loader', () => ({
  hideLoader: () => getContext().mockHideLoader(),
}))

vi.mock('~/services/posthog', () => ({
  setUser: (...args: unknown[]) => getContext().mockSetUser(...args),
}))

vi.mock('~/services/storage', () => ({
  createSignedImageUrl: (value: string) => getContext().mockCreateSignedImageUrl(value),
  getImmediateImageUrl: (value?: string | null) => value ?? '',
}))

vi.mock('~/services/tracking', () => ({
  sendEvent: (...args: unknown[]) => getContext().mockSendEvent(...args),
}))

vi.mock('~/services/websiteAuthCookie', () => ({
  clearWebsitePaidUserCookie: vi.fn(),
  setWebsitePaidUserCookie: (isPaidUser: boolean) => getContext().mockSetWebsitePaidUserCookie(isPaidUser),
}))

vi.mock('~/services/supabase', () => ({
  getLocalConfig: () => ({ supaHost: 'https://supabase.capgo.test' }),
  getPlans: () => getContext().mockGetPlans(),
  isPlatformAdmin: () => getContext().mockIsPlatformAdmin(),
  useSupabase: () => {
    const context = getContext()

    return {
      auth: {
        getClaims: context.mockGetClaims,
        getSession: context.mockGetSession,
        getAuthenticatorAssuranceLevel: context.mockGetAuthenticatorAssuranceLevel,
        mfa: {
          getAuthenticatorAssuranceLevel: context.mockGetAuthenticatorAssuranceLevel,
        },
        signOut: context.mockSignOut,
      },
      rpc: context.mockRpc,
      from: context.mockFrom,
    }
  },
  defaultApiHost: 'https://api.capgo.test',
}))

vi.mock('~/stores/main', () => ({
  useMainStore: () => getContext().mainStore,
}))

vi.mock('~/stores/organization', () => ({
  isPendingOrganizationInvite: (org: { is_invite?: boolean | null, role: string }) => org.is_invite ?? org.role.startsWith('invite'),
  useOrganizationStore: () => getContext().organizationStore,
}))

vi.stubGlobal('fetch', vi.fn((...args: unknown[]) => getContext().mockFetch(...args)))

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
  it.concurrent('provisions an SSO session before redirecting to app onboarding and keeps the user on the target route', async () => {
    await withTestContext(async (context) => {
      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(context.mockFetch).toHaveBeenCalledWith('https://api.capgo.test/private/sso/provision-user', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }))
      expect(context.organizationStore.fetchOrganizations).toHaveBeenCalled()
      expect(next).toHaveBeenCalledWith()
      expect(next).not.toHaveBeenCalledWith('/onboarding/app')
    })
  })

  it.concurrent('redirects an eligible user to resume their pending app onboarding', async () => {
    await withTestContext(async (context) => {
      context.mockApps.push({ app_id: 'com.test.pending-onboarding', need_onboarding: true })
      context.mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token-123',
            user: {
              id: 'user-789',
              email: 'user@managed.test',
              created_at: '2026-08-04T14:01:00.000Z',
              email_confirmed_at: '2026-04-15T10:00:00.000Z',
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          },
        },
      })
      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(next).toHaveBeenCalledWith({
        path: '/app/com.test.pending-onboarding/getting-started',
      })
    })
  })

  it.concurrent('loads plans before redirecting a newly authenticated user into onboarding', async () => {
    await withTestContext(async (context) => {
      const loadedPlans = [{ name: 'Solo' }]
      context.mockApps.push({ app_id: 'com.test.pending-onboarding', need_onboarding: true })
      context.mockGetPlans.mockResolvedValue(loadedPlans)
      context.mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token-123',
            user: {
              id: 'user-plans-onboarding',
              email: 'user@managed.test',
              created_at: '2026-08-04T14:01:00.000Z',
              email_confirmed_at: '2026-04-15T10:00:00.000Z',
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          },
        },
      })
      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(next).toHaveBeenCalledWith({
        path: '/app/com.test.pending-onboarding/getting-started',
      })
      expect(context.mockGetPlans).toHaveBeenCalledOnce()
      expect(context.mainStore.plans).toEqual(loadedPlans)
    })
  })

  it.concurrent('tracks a successful login before redirecting the user into onboarding', async () => {
    await withTestContext(async (context) => {
      context.mockApps.push({ app_id: 'com.test.pending-onboarding', need_onboarding: true })
      context.mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token-123',
            user: {
              id: 'user-login-tracking',
              email: 'user@managed.test',
              created_at: '2026-08-04T14:01:00.000Z',
              email_confirmed_at: '2026-04-15T10:00:00.000Z',
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          },
        },
      })
      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(next).toHaveBeenCalledWith({
        path: '/app/com.test.pending-onboarding/getting-started',
      })
      expect(context.mockSendEvent).toHaveBeenCalledOnce()
      expect(context.mockSendEvent).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'user-login',
        event: 'User Login',
        user_id: 'user-login-tracking',
      }))
    })
  })

  it.concurrent('retries loading plans on a later authenticated navigation when the store is empty', async () => {
    await withTestContext(async (context) => {
      const loadedPlans = [{ name: 'Solo' }]
      context.mainStore.auth = {
        id: 'user-123',
        email: 'user@managed.test',
        email_confirmed_at: '2026-04-15T10:00:00.000Z',
      }
      context.mockGetPlans.mockResolvedValue(loadedPlans)
      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/settings/organization/plans', fullPath: '/settings/organization/plans', meta: { middleware: 'auth' }, query: {} },
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        next,
      )

      expect(next).toHaveBeenCalledWith()
      expect(context.mockGetPlans).toHaveBeenCalledOnce()
      expect(context.mainStore.plans).toEqual(loadedPlans)
    })
  })

  it.concurrent('allows an eligible user to explore the dashboard until refresh', async () => {
    await withTestContext(async (context) => {
      context.mockApps.push({ app_id: 'com.test.pending-onboarding', need_onboarding: true })
      context.mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'token-123',
            user: {
              id: 'user-456',
              email: 'user@managed.test',
              created_at: '2026-08-04T14:01:00.000Z',
              email_confirmed_at: '2026-04-15T10:00:00.000Z',
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          },
        },
      })
      allowOnboardingDashboardExploration('user-456')
      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(next).toHaveBeenCalledWith()
    })
  })

  it.concurrent('keeps redirecting non-SSO users without organizations to app onboarding', async () => {
    await withTestContext(async (context) => {
      context.mockGetSession.mockResolvedValue({
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

      context.organizationStore.fetchOrganizations = vi.fn(async () => {
        context.organizationStore.organizations = []
        context.organizationStore.hasOrganizations = false
      })

      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(context.mockFetch).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledWith({
        path: '/onboarding/app',
        query: {
          to: '/dashboard',
        },
      })
    })
  })

  it.concurrent.each([
    { cachedAuth: false, result: 'admin' },
    { cachedAuth: true, result: 'admin' },
    { cachedAuth: false, result: 'member' },
    { cachedAuth: true, result: 'member' },
    { cachedAuth: false, result: 'error' },
    { cachedAuth: true, result: 'error' },
  ])('resolves $result access without organizations (cached auth: $cachedAuth)', async ({ cachedAuth, result }) => {
    await withTestContext(async (context) => {
      const user = {
        id: 'user-123',
        email: 'user@managed.test',
        email_confirmed_at: '2026-04-15T10:00:00.000Z',
        app_metadata: { provider: 'email', providers: ['email'] },
      }
      context.mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'token-123', user } },
      })
      if (cachedAuth)
        context.mainStore.auth = user
      context.mainStore.isAdmin = true
      context.organizationStore.fetchOrganizations = vi.fn(async () => {
        context.organizationStore.organizations = []
        context.organizationStore.hasOrganizations = false
      })
      if (result === 'error')
        context.mockIsPlatformAdmin.mockRejectedValue(new Error('Admin lookup failed'))
      else
        context.mockIsPlatformAdmin.mockResolvedValue(result === 'admin')

      const guard = await getGuard()
      const next = vi.fn()
      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(context.mockIsPlatformAdmin).toHaveBeenCalledOnce()
      expect(context.mainStore.isAdmin).toBe(result === 'admin')
      if (result === 'admin') {
        expect(next).toHaveBeenCalledWith()
        expect(context.mockSetWebsitePaidUserCookie).toHaveBeenCalledWith(true)
      }
      else {
        expect(next).toHaveBeenCalledWith({ path: '/onboarding/app', query: { to: '/dashboard' } })
        expect(context.mockSetWebsitePaidUserCookie).not.toHaveBeenCalled()
      }
    })
  })

  it.concurrent('resolves platform-admin access for users with organizations', async () => {
    await withTestContext(async (context) => {
      const user = {
        id: 'user-123',
        email: 'user@managed.test',
        email_confirmed_at: '2026-04-15T10:00:00.000Z',
        app_metadata: { provider: 'email', providers: ['email'] },
      }
      context.mainStore.auth = user
      context.organizationStore.organizations = [{ gid: 'org-123', role: 'read' }]
      context.organizationStore.hasOrganizations = true
      context.mockIsPlatformAdmin.mockResolvedValue(true)

      const guard = await getGuard()
      const next = vi.fn()
      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        next,
      )

      expect(context.mockIsPlatformAdmin).toHaveBeenCalledOnce()
      expect(context.mainStore.isAdmin).toBe(true)
      expect(next).toHaveBeenCalledWith()
    })
  })

  it.concurrent('redirects accounts pending deletion to the recovery page instead of app onboarding', async () => {
    await withTestContext(async (context) => {
      context.mockRpc.mockResolvedValueOnce({
        data: true,
        error: null,
      })

      context.organizationStore.fetchOrganizations = vi.fn(async () => {
        context.organizationStore.organizations = []
        context.organizationStore.hasOrganizations = false
      })

      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(context.organizationStore.fetchOrganizations).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledWith({
        path: '/accountDisabled',
        query: {
          to: '/dashboard',
        },
      })
    })
  })

  it.concurrent('keeps disabled users on the recovery page when it is reloaded with a saved destination', async () => {
    await withTestContext(async (context) => {
      context.mockRpc.mockResolvedValueOnce({
        data: true,
        error: null,
      })

      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        {
          path: '/accountDisabled',
          fullPath: '/accountDisabled?to=/apps/app-123',
          meta: { middleware: 'auth' },
          query: { to: '/apps/app-123' },
        },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith()
    })
  })

  it.concurrent('continues navigation when the disabled-account RPC errors', async () => {
    await withTestContext(async (context) => {
      context.mockRpc.mockResolvedValueOnce({
        data: null,
        error: new Error('rpc failed'),
      })

      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(context.organizationStore.fetchOrganizations).toHaveBeenCalled()
      expect(next).toHaveBeenCalledWith()
      expect(next).not.toHaveBeenCalledWith(expect.objectContaining({
        path: '/accountDisabled',
      }))
    })
  })

  it.concurrent('sets the website paid user cookie for platform admins after login', async () => {
    await withTestContext(async (context) => {
      context.mockIsPlatformAdmin.mockResolvedValue(true)

      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(context.mockSetWebsitePaidUserCookie).toHaveBeenCalledWith(true)
      expect(context.mainStore.isAdmin).toBe(true)
      expect(next).toHaveBeenCalledWith()
    })
  })

  it.concurrent('redirects active users away from the recovery page when the disabled-account check errors', async () => {
    await withTestContext(async (context) => {
      context.mainStore.auth = {
        id: 'user-123',
        email: 'user@managed.test',
        email_confirmed_at: '2026-04-15T10:00:00.000Z',
      }
      context.mockRpc.mockResolvedValueOnce({
        data: null,
        error: new Error('rpc failed'),
      })

      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        {
          path: '/accountDisabled',
          fullPath: '/accountDisabled?to=/apps/app-123',
          meta: { middleware: 'auth' },
          query: { to: '/apps/app-123' },
        },
        { path: '/apps/app-123', fullPath: '/apps/app-123', meta: { middleware: 'auth' }, query: {} },
        next,
      )

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith('/apps/app-123')
    })
  })

  it.concurrent('aborts navigation for managed SSO users when provisioning fails instead of redirecting to app onboarding', async () => {
    await withTestContext(async (context) => {
      context.mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'provider_lookup_failed' }),
      })

      context.organizationStore.fetchOrganizations = vi.fn(async () => {
        context.organizationStore.organizations = []
        context.organizationStore.hasOrganizations = false
      })

      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(context.mockFetch).toHaveBeenCalled()
      expect(next).toHaveBeenCalledWith(false)
      expect(next).not.toHaveBeenCalledWith({
        path: '/onboarding/app',
        query: {
          to: '/dashboard',
        },
      })
    })
  })

  it.concurrent('aborts navigation when merged-session sign out fails instead of redirecting with a stale SSO session', async () => {
    await withTestContext(async (context) => {
      context.mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, merged: true }),
      })
      context.mockSignOut.mockResolvedValueOnce({
        error: new Error('sign out failed'),
      })

      const guard = await getGuard()
      const next = vi.fn()

      await guard(
        { path: '/dashboard', fullPath: '/dashboard', meta: { middleware: 'auth' }, query: {} },
        { path: '/login', fullPath: '/login', meta: {}, query: {} },
        next,
      )

      expect(next).toHaveBeenCalledWith(false)
      expect(next).not.toHaveBeenCalledWith('/login?message=sso_account_linked')
    })
  })
})

describe('authorized lifecycle selection through real auth routing', () => {
  const orgId = '22222222-2222-4222-8222-222222222222'
  const otherApp = 'com.example.remaining'
  const emailedApp = 'com.example.removed'

  async function selectionRouter(context: AuthGuardTestContext, hadAuth: boolean) {
    const user = { id: 'user-123', email: 'user@managed.test', email_confirmed_at: '2026-10-19T00:00:00Z', created_at: '2026-10-19T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] } }
    context.mockGetSession.mockResolvedValue({ data: { session: { access_token: 'fake-token', user } } })
    context.mainStore.auth = hadAuth ? user : undefined
    const load = async () => {
      context.organizationStore.organizations = [{ gid: orgId, role: 'admin' }]
      context.organizationStore.hasOrganizations = true
    }
    context.organizationStore.fetchOrganizations.mockImplementation(load)
    context.organizationStore.dedupFetchOrganizations.mockImplementation(load)
    context.mockApps.push({ app_id: otherApp, need_onboarding: true, owner_org: orgId })
    const component = { render: () => null }
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/apps', component, meta: { middleware: 'auth' } },
      { path: '/app/new', component, meta: { middleware: 'auth' } },
      { path: '/onboarding/invitation', component, meta: { middleware: 'auth' } },
      { path: '/login', component },
      { path: '/app/:app/getting-started', name: '/app/[app].getting-started', component, meta: { middleware: 'auth' } },
    ] })
    const auth = await import('../src/modules/auth.ts')
    const setup = await import('../src/modules/onboarding-setup.ts')
    auth.install({ router } as any)
    setup.install({ router } as any)
    return router
  }

  it.concurrent.each([false, true])('keeps a deleted email target on selection with one other pending app (hadAuth=%s)', async (hadAuth) => {
    await withTestContext(async (context) => {
      const router = await selectionRouter(context, hadAuth)
      await router.push(`/app/${emailedApp}/getting-started?oid=${orgId}&source=capgo_lifecycle&lifecycleSetup=1`)
      expect(router.currentRoute.value.path).toBe('/apps')
      expect(router.currentRoute.value.query.oid).toBe(orgId)
      expect(router.currentRoute.value.query.source).toBe('capgo_lifecycle')
    })
  })

  it.concurrent('does not silently choose the remaining app when the emailed app belongs to another org', async () => {
    await withTestContext(async (context) => {
      const router = await selectionRouter(context, true)
      context.mockApps.push({ app_id: emailedApp, need_onboarding: true, owner_org: '44444444-4444-4444-8444-444444444444' })
      await router.push(`/app/${emailedApp}/getting-started?oid=${orgId}&source=capgo_lifecycle&lifecycleSetup=1`)
      expect(router.currentRoute.value.path).toBe('/apps')
      expect(router.currentRoute.value.query.oid).toBe(orgId)
    })
  })

  it.concurrent.each([false, true])('keeps a chooser after lost email-org membership without preserving the unauthorized oid (hadAuth=%s)', async (hadAuth) => {
    await withTestContext(async (context) => {
      const router = await selectionRouter(context, hadAuth)
      const inaccessibleOrg = '44444444-4444-4444-8444-444444444444'
      await router.push(`/app/${emailedApp}/getting-started?oid=${inaccessibleOrg}&source=capgo_lifecycle&lifecycleSetup=1`)
      expect(router.currentRoute.value.path).toBe('/apps')
      expect(router.currentRoute.value.query.oid).toBeUndefined()
      expect(router.currentRoute.value.query.source).toBe('capgo_lifecycle')
      expect(router.currentRoute.value.query.lifecycleSelect).toBe('1')
      expect(router.currentRoute.value.fullPath).not.toContain(inaccessibleOrg)
      expect(context.organizationStore.setCurrentOrganization).not.toHaveBeenCalledWith(inaccessibleOrg)
    })
  })

  it.concurrent.each(['/apps', '/app/new'])('preserves explicit authorized lifecycle selection at %s', async (path) => {
    await withTestContext(async (context) => {
      const router = await selectionRouter(context, true)
      await router.push(`${path}?oid=${orgId}&source=capgo_lifecycle`)
      expect(router.currentRoute.value.path).toBe(path)
    })
  })

  it.concurrent.each(['/apps', '/apps?lifecycleSelect=1', '/apps?source=other&lifecycleSelect=1'])('retains the ordinary onboarding redirect for %s', async (path) => {
    await withTestContext(async (context) => {
      const router = await selectionRouter(context, true)
      await router.push(path)
      expect(router.currentRoute.value.path).toBe(`/app/${otherApp}/getting-started`)
    })
  })

  it.concurrent('keeps the invitation gate ahead of the unscoped lifecycle chooser', async () => {
    await withTestContext(async (context) => {
      const router = await selectionRouter(context, true)
      const load = async () => {
        context.organizationStore.organizations = [{ gid: orgId, role: 'invite_admin' }]
        context.organizationStore.hasOrganizations = true
      }
      context.organizationStore.fetchOrganizations.mockImplementation(load)
      context.organizationStore.dedupFetchOrganizations.mockImplementation(load)
      await router.push('/apps?source=capgo_lifecycle&lifecycleSelect=1')
      expect(router.currentRoute.value.path).toBe('/onboarding/invitation')
    })
  })

  it.concurrent('keeps the MFA gate ahead of the unscoped lifecycle chooser', async () => {
    await withTestContext(async (context) => {
      const router = await selectionRouter(context, true)
      context.mockGetAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
      await router.push('/apps?source=capgo_lifecycle&lifecycleSelect=1')
      expect(router.currentRoute.value.path).toBe('/login')
    })
  })
})
