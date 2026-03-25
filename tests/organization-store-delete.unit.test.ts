import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockEq = vi.fn()
const mockDelete = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ delete: mockDelete }))
const mockRpc = vi.fn()

vi.mock('~/services/supabase', () => ({
  stripeEnabled: ref(true),
  useSupabase: () => ({
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
    },
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

vi.mock('~/services/storage', () => ({
  createSignedImageUrl: vi.fn(),
}))

vi.mock('../src/stores/main.ts', () => ({
  useMainStore: () => ({
    user: { id: 'user-123' },
    updateDashboard: vi.fn(),
  }),
}))

vi.mock('../src/stores/display.ts', () => ({
  useDisplayStore: () => ({
    clearCachesForOrg: vi.fn(),
  }),
}))

vi.mock('../src/stores/dashboardApps.ts', () => ({
  useDashboardAppsStore: () => ({
    reset: vi.fn(),
    fetchApps: vi.fn(),
  }),
}))

describe('organization store deleteOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockEq.mockResolvedValue({ data: null, error: null })
  })

  it('allows org deletion for org_super_admin roles', async () => {
    const { useOrganizationStore } = await import('../src/stores/organization.ts')
    const store = useOrganizationStore()
    const orgId = 'org-rbac-super-admin'

    store.getAllOrgs().set(orgId, {
      gid: orgId,
      role: 'org_super_admin',
      use_new_rbac: true,
    } as any)

    const result = await store.deleteOrganization(orgId)

    expect(result.error).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('orgs')
    expect(mockEq).toHaveBeenCalledWith('id', orgId)
  })

  it('rejects org deletion for lower org roles', async () => {
    const { useOrganizationStore } = await import('../src/stores/organization.ts')
    const store = useOrganizationStore()
    const orgId = 'org-admin-only'

    store.getAllOrgs().set(orgId, {
      gid: orgId,
      role: 'org_admin',
      use_new_rbac: true,
    } as any)

    const result = await store.deleteOrganization(orgId)

    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('Insufficient permissions')
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('organization role helpers', () => {
  it('treats RBAC org roles as their legacy equivalents', async () => {
    const { isAdminRole, isSuperAdminRole, roleHasLegacyMinRight } = await import('../src/stores/organization.ts')

    expect(isAdminRole('admin')).toBe(true)
    expect(isAdminRole('org_admin')).toBe(true)
    expect(isAdminRole('org_super_admin')).toBe(true)
    expect(isAdminRole('org_member')).toBe(false)

    expect(isSuperAdminRole('super_admin')).toBe(true)
    expect(isSuperAdminRole('org_super_admin')).toBe(true)
    expect(isSuperAdminRole('owner')).toBe(true)
    expect(isSuperAdminRole('org_admin')).toBe(false)

    expect(roleHasLegacyMinRight('invite_org_super_admin', 'super_admin')).toBe(true)
    expect(roleHasLegacyMinRight('invite_org_admin', 'admin')).toBe(true)
    expect(roleHasLegacyMinRight('org_billing_admin', 'admin')).toBe(false)
  })
})
