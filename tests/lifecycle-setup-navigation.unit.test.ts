import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { APP_ONBOARDING_OTA_V1_STEP_IDS } from '../supabase/functions/_backend/utils/appOnboarding.ts'

const ORG = '22222222-2222-4222-8222-222222222222'
const APP = 'com.example.current'
const path = `/app/${APP}/getting-started`
// The same delivered URL must work when completion changes before the click.
const emailLink = `${path}?oid=${ORG}&source=capgo_lifecycle&lifecycleSetup=1`
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), single: vi.fn(), eq: vi.fn(), select: vi.fn(), store: { organizations: [] as any[], awaitInitialLoad: vi.fn() } }))
vi.mock('../src/services/supabase', () => ({ useSupabase: () => ({ from: mocks.from, rpc: mocks.rpc }) }))
vi.mock('../src/stores/organization', () => ({ useOrganizationStore: () => mocks.store }))

function checklist(complete: boolean) {
  return { setup: { todo_list_version: 4, ota_todo_list_version: '1', paths: ['ota'], selected_path: 'ota', steps: { ota: Object.fromEntries(APP_ONBOARDING_OTA_V1_STEP_IDS.map(id => [id, { status: complete ? 'done' : 'pending' }])) } } }
}

async function navigation() {
  const component = { render: () => null }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/:app/getting-started', name: '/app/[app].getting-started', component }, { path: '/apps', component }, { path: '/app/new', component }] })
  const { install } = await import('../src/modules/onboarding-setup')
  install({ router } as any)
  return router
}

describe('lifecycle setup links at click time', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.single }
    mocks.from.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.eq.mockReturnValue(query)
    mocks.single.mockResolvedValue({ data: { app_id: APP, owner_org: ORG, onboarding: checklist(false) }, error: null })
    mocks.rpc.mockResolvedValue({ data: checklist(false), error: null })
    mocks.store.organizations = [{ gid: ORG, role: 'admin', is_invite: false }]
    mocks.store.awaitInitialLoad.mockResolvedValue(undefined)
  })

  it('uses normal unfinished setup even if the incoming email query forces view mode', async () => {
    const router = await navigation()
    await router.push(`${emailLink}&showChecklist=1`)
    expect(router.currentRoute.value.path).toBe(path)
    expect(router.currentRoute.value.query.showChecklist).toBeUndefined()
    expect(router.currentRoute.value.query.oid).toBe(ORG)
    expect(router.currentRoute.value.query.source).toBe('capgo_lifecycle')
    expect(mocks.eq).toHaveBeenCalledWith('app_id', APP)
    expect(mocks.eq).toHaveBeenCalledWith('owner_org', ORG)
  })

  it('reopens a completed checklist from the same URL that was generated while pending', async () => {
    const router = await navigation()
    mocks.rpc.mockResolvedValue({ data: checklist(true), error: null })
    await router.push(emailLink)
    expect(router.currentRoute.value.path).toBe(path)
    expect(router.currentRoute.value.query.showChecklist).toBe('1')
    expect(mocks.rpc).toHaveBeenCalledWith('verify_getting_started', { p_app_id: APP })
  })

  it('uses verified current state rather than a stale completed app snapshot', async () => {
    const router = await navigation()
    mocks.single.mockResolvedValue({ data: { app_id: APP, owner_org: ORG, onboarding: checklist(true) }, error: null })
    await router.push(`${emailLink}&showChecklist=1`)
    expect(router.currentRoute.value.query.showChecklist).toBeUndefined()
  })

  it.each(['missing app', 'wrong organization', 'read error'])('falls back to authorized app selection for %s without choosing another app', async (failure) => {
    const router = await navigation()
    mocks.single.mockResolvedValue({ data: failure === 'wrong organization' ? { app_id: APP, owner_org: '44444444-4444-4444-8444-444444444444' } : null, error: failure === 'read error' ? { message: 'unavailable' } : null })
    await router.push(emailLink)
    expect(router.currentRoute.value.path).toBe('/apps')
    expect(router.currentRoute.value.query.oid).toBe(ORG)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not query an inaccessible or pending-invite organization', async () => {
    const router = await navigation()
    mocks.store.organizations = [{ gid: ORG, role: 'invite_admin', is_invite: true }]
    await router.push(emailLink)
    expect(router.currentRoute.value.path).toBe('/apps')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each(['error response', 'network rejection'])('retains normal setup when verification has an %s instead of forcing read-only view mode', async (failure) => {
    const router = await navigation()
    if (failure === 'network rejection')
      mocks.rpc.mockRejectedValue(new Error('temporarily unavailable'))
    else
      mocks.rpc.mockResolvedValue({ data: null, error: { message: 'temporarily unavailable' } })
    await router.push(`${emailLink}&showChecklist=1`)
    expect(router.currentRoute.value.path).toBe(path)
    expect(router.currentRoute.value.query.showChecklist).toBeUndefined()
  })

  it('retains the verified org selection when the app read rejects', async () => {
    const router = await navigation()
    mocks.single.mockRejectedValue(new Error('temporarily unavailable'))
    await router.push(emailLink)
    expect(router.currentRoute.value.path).toBe('/apps')
    expect(router.currentRoute.value.query.oid).toBe(ORG)
    expect(router.currentRoute.value.query.source).toBe('capgo_lifecycle')
  })

  it.each(['', '&lifecycleSetup=0', '&lifecycleSetup=1&lifecycleSetup=0'])('preserves ordinary and non-opt-in links (%s)', async (flag) => {
    const router = await navigation()
    await router.push(`${path}?oid=${ORG}&source=capgo_lifecycle&showChecklist=1${flag}`)
    expect(router.currentRoute.value.query.showChecklist).toBe('1')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
