// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const dialogMocks = vi.hoisted(() => ({
  lastButtonRole: '',
  onDialogDismiss: vi.fn(async () => false),
  openDialog: vi.fn(),
}))

const mainMocks = vi.hoisted(() => ({
  auth: { id: 'user-1' } as { id: string } | undefined,
  user: undefined as { id: string } | undefined,
}))

vi.mock('~/stores/dialogv2', () => ({
  useDialogV2Store: () => dialogMocks,
}))

vi.mock('~/stores/main', () => ({
  useMainStore: () => mainMocks,
}))

const organizationMocks = vi.hoisted(() => ({
  appsByOrgId: [] as { app_id: string }[],
  awaitInitialLoad: vi.fn(async () => true),
}))

vi.mock('~/stores/organization', () => ({
  useOrganizationStore: () => ({
    currentOrganization: { gid: 'org-1' },
    getAppsByOrgId: () => organizationMocks.appsByOrgId,
    awaitInitialLoad: organizationMocks.awaitInitialLoad,
  }),
}))

async function createRouterWithHardGate() {
  const component = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/new', component },
      { path: '/apps', component },
      { path: '/apikeys', component },
      { path: '/dashboard', component },
    ],
  })
  const committed: string[] = []
  router.afterEach(to => committed.push(to.path))
  const { install } = await import('../src/modules/onboarding-hard-gate')
  install({ router } as any)
  return { router, committed }
}

describe('onboarding hard-gate direct entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dialogMocks.lastButtonRole = ''
    dialogMocks.onDialogDismiss.mockResolvedValue(false)
    mainMocks.auth = { id: 'user-1' }
    mainMocks.user = undefined
    organizationMocks.appsByOrgId = []
    organizationMocks.awaitInitialLoad.mockResolvedValue(true)
    window.sessionStorage.clear()
    window.localStorage.clear()
    vi.resetModules()
  })

  it('blocks /apps navigation from pre-create onboarding until explore is granted', async () => {
    const { router, committed } = await createRouterWithHardGate()
    await router.push('/app/new')
    dialogMocks.onDialogDismiss.mockImplementation(async () => {
      dialogMocks.lastButtonRole = 'secondary'
      return false
    })

    await router.push('/apps')

    expect(dialogMocks.openDialog).toHaveBeenCalledOnce()
    expect(committed).toEqual(['/app/new', '/apps'])
    expect(router.currentRoute.value.path).toBe('/apps')
  })

  it('returns to setup when direct /apikeys entry is canceled during pre-create onboarding', async () => {
    const { router } = await createRouterWithHardGate()
    await router.push('/app/new')
    dialogMocks.onDialogDismiss.mockResolvedValue(true)

    await router.push('/apikeys')

    expect(dialogMocks.openDialog).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/app/new')
  })

  it('does not hard-gate /app/new when the org already has apps after initial load', async () => {
    organizationMocks.appsByOrgId = [{ app_id: 'com.existing.app' }]
    const { router, committed } = await createRouterWithHardGate()
    await router.push('/app/new')
    await router.push('/apps')

    expect(organizationMocks.awaitInitialLoad).toHaveBeenCalled()
    expect(dialogMocks.openDialog).not.toHaveBeenCalled()
    expect(committed).toEqual(['/app/new', '/apps'])
    expect(router.currentRoute.value.path).toBe('/apps')
  })

  it('allows /apps after explore-anyway was granted from the shared dialog flow', async () => {
    const onboardingRedirect = await import('../src/utils/onboardingRedirect.ts')
    onboardingRedirect.allowOnboardingDashboardExploration('user-1', null)

    const { router, committed } = await createRouterWithHardGate()
    await router.push('/app/new')
    await router.push('/apps')

    expect(dialogMocks.openDialog).not.toHaveBeenCalled()
    expect(committed).toEqual(['/app/new', '/apps'])
    expect(router.currentRoute.value.path).toBe('/apps')
  })
})
