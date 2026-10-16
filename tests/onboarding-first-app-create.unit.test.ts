// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const organizationMocks = vi.hoisted(() => ({
  appsByOrgId: [] as { app_id: string }[],
  awaitInitialLoad: vi.fn(async () => true),
  currentOrganization: { gid: 'org-1' } as { gid: string } | undefined,
}))

vi.mock('~/stores/organization', () => ({
  useOrganizationStore: () => ({
    currentOrganization: organizationMocks.currentOrganization,
    getAppsByOrgId: () => organizationMocks.appsByOrgId,
    awaitInitialLoad: organizationMocks.awaitInitialLoad,
  }),
}))

describe('resolveFirstAppCreateOnAppNew', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    organizationMocks.appsByOrgId = []
    organizationMocks.currentOrganization = { gid: 'org-1' }
    organizationMocks.awaitInitialLoad.mockResolvedValue(true)
    vi.resetModules()
  })

  it('awaits organization load before classifying first-app create', async () => {
    const { resolveFirstAppCreateOnAppNew } = await import('../src/services/onboardingDashboardExplorationConfirm.ts')
    organizationMocks.appsByOrgId = [{ app_id: 'com.existing.app' }]

    await expect(resolveFirstAppCreateOnAppNew('/app/new')).resolves.toBe(false)
    expect(organizationMocks.awaitInitialLoad).toHaveBeenCalledOnce()
  })

  it('returns undefined for non /app/new paths', async () => {
    const { resolveFirstAppCreateOnAppNew } = await import('../src/services/onboardingDashboardExplorationConfirm.ts')

    await expect(resolveFirstAppCreateOnAppNew('/apps')).resolves.toBeUndefined()
    expect(organizationMocks.awaitInitialLoad).not.toHaveBeenCalled()
  })
})
