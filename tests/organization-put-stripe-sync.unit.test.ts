import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  checkPermissionMock,
  supabaseClientMock,
  supabaseApikeyMock,
  apikeyHasOrgRightWithPolicyMock,
  supabaseAdminMock,
  updateCustomerOrganizationNameMock,
  getStripeCustomerNameMock,
  isDeterministicStripeCustomerUpdateErrorMock,
} = vi.hoisted(() => ({
  checkPermissionMock: vi.fn(),
  supabaseClientMock: vi.fn(),
  supabaseApikeyMock: vi.fn(),
  apikeyHasOrgRightWithPolicyMock: vi.fn(),
  supabaseAdminMock: vi.fn(),
  updateCustomerOrganizationNameMock: vi.fn(),
  getStripeCustomerNameMock: vi.fn(),
  isDeterministicStripeCustomerUpdateErrorMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/stripe.ts', () => ({
  updateCustomerOrganizationName: (...args: unknown[]) => updateCustomerOrganizationNameMock(...args),
  getStripeCustomerName: (...args: unknown[]) => getStripeCustomerNameMock(...args),
  isDeterministicStripeCustomerUpdateError: (...args: unknown[]) => isDeterministicStripeCustomerUpdateErrorMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseClient: (...args: unknown[]) => supabaseClientMock(...args),
  supabaseApikey: (...args: unknown[]) => supabaseApikeyMock(...args),
  apikeyHasOrgRightWithPolicy: (...args: unknown[]) => apikeyHasOrgRightWithPolicyMock(...args),
  supabaseAdmin: (...args: unknown[]) => supabaseAdminMock(...args),
}))

const { put } = await import('../supabase/functions/_backend/public/organization/put.ts')
type OrgRow = Database['public']['Tables']['orgs']['Row']

function createContext() {
  return {
    get: (key: string) => {
      if (key === 'auth') {
        return {
          userId: 'user-123',
          authType: 'jwt',
          jwt: 'jwt-token',
        }
      }
      return undefined
    },
    json: (data: unknown, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  } as any
}

function createOrgRow(overrides: Partial<OrgRow> & Pick<OrgRow, 'id' | 'name' | 'customer_id'>): OrgRow {
  const baseOrgRow: OrgRow = {
    created_at: null,
    created_by: 'user-123',
    customer_id: 'cus_123',
    email_preferences: {},
    enforce_encrypted_bundles: false,
    enforce_hashed_api_keys: false,
    enforcing_2fa: false,
    has_usage_credits: false,
    id: 'org-123',
    last_stats_updated_at: null,
    logo: null,
    management_email: 'billing@capgo.app',
    max_apikey_expiration_days: null,
    name: 'Old Name',
    password_policy_config: null,
    require_apikey_expiration: false,
    required_encryption_key: null,
    sso_enabled: false,
    stats_updated_at: null,
    updated_at: null,
    use_new_rbac: false,
    website: 'https://old.example',
  }

  return {
    ...baseOrgRow,
    ...overrides,
  }
}

function createOrgSelectBuilder(data: OrgRow) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

function createOrgUpdateBuilder(data: any, error: { message: string } | null = null) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  }
}

function createSupabaseClientStub(
  from: ReturnType<typeof vi.fn>,
  sanitizedName = 'New Name',
) {
  return {
    from,
    rpc: vi.fn().mockResolvedValue({ data: sanitizedName, error: null }),
  }
}

describe('organization put Stripe sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPermissionMock.mockResolvedValue(true)
    updateCustomerOrganizationNameMock.mockResolvedValue(undefined)
    getStripeCustomerNameMock.mockResolvedValue(undefined)
    isDeterministicStripeCustomerUpdateErrorMock.mockReturnValue(false)
    apikeyHasOrgRightWithPolicyMock.mockResolvedValue({ valid: true })
  })

  it('updates the org row before syncing Stripe customer name', async () => {
    const selectBuilder = createOrgSelectBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    }))
    const updateBuilder = createOrgUpdateBuilder({
      id: 'org-123',
      name: 'New Name',
      customer_id: 'cus_123',
      logo: null,
    })

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder),
    ))

    const response = await put(createContext(), {
      orgId: 'org-123',
      name: '  <b>New Name</b>  ',
    }, undefined)

    expect(response.status).toBe(200)
    expect(updateCustomerOrganizationNameMock).toHaveBeenCalledTimes(1)
    expect(updateCustomerOrganizationNameMock).toHaveBeenCalledWith(expect.anything(), 'cus_123', 'New Name')
    expect(updateBuilder.update).toHaveBeenCalledWith({ name: 'New Name' })
    expect(updateBuilder.eq).toHaveBeenCalledWith('name', 'Old Name')
    expect(updateBuilder.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(updateCustomerOrganizationNameMock.mock.invocationCallOrder[0])
  })

  it('syncs Stripe using the committed customer id when it becomes available during the rename', async () => {
    const selectBuilder = createOrgSelectBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'pending_org-123',
    }))
    const updateBuilder = createOrgUpdateBuilder(createOrgRow({
      id: 'org-123',
      name: 'New Name',
      customer_id: 'cus_123',
    }))

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder),
    ))

    const response = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined)

    expect(response.status).toBe(200)
    expect(updateCustomerOrganizationNameMock).toHaveBeenCalledWith(expect.anything(), 'cus_123', 'New Name')
  })

  it('does not touch Stripe when a competing rename wins the database write', async () => {
    const selectBuilder = createOrgSelectBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    }))
    const updateBuilder = createOrgUpdateBuilder(null)

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder),
    ))

    const error = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined).catch(caught => caught)

    expect(error).toBeInstanceOf(HTTPException)
    expect(updateCustomerOrganizationNameMock).not.toHaveBeenCalled()
    expect(error.cause.moreInfo).toMatchObject({
      error: 'org_name_changed',
      orgId: 'org-123',
    })
  })

  it('does not touch Stripe when the database update fails before commit', async () => {
    const selectBuilder = createOrgSelectBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    }))
    const updateBuilder = createOrgUpdateBuilder(null, { message: 'db write failed' })

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder),
    ))

    const error = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined).catch(caught => caught)

    expect(error).toBeInstanceOf(HTTPException)
    expect(updateCustomerOrganizationNameMock).not.toHaveBeenCalled()
    expect(error.cause.moreInfo).toMatchObject({
      error: 'db write failed',
    })
  })

  it('rolls the org row back when syncing Stripe fails', async () => {
    const selectBuilder = createOrgSelectBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
      website: 'https://old.example',
    }))
    const updateBuilder = createOrgUpdateBuilder({
      ...createOrgRow({
        id: 'org-123',
        name: 'New Name',
        customer_id: 'cus_123',
        updated_at: '2026-04-15T13:00:00Z',
        website: 'https://new.example',
      }),
    })
    const rollbackBuilder = createOrgUpdateBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
      website: 'https://old.example',
    }))

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce(rollbackBuilder),
    ))

    updateCustomerOrganizationNameMock
      .mockRejectedValueOnce(new Error('Stripe update failed'))
    getStripeCustomerNameMock.mockResolvedValueOnce('Old Name')

    const error = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
      website: 'https://new.example',
    }, undefined).catch(caught => caught)

    expect(error).toBeInstanceOf(HTTPException)
    expect(updateCustomerOrganizationNameMock).toHaveBeenCalledWith(expect.anything(), 'cus_123', 'New Name')
    expect(rollbackBuilder.update).toHaveBeenCalledWith({
      name: 'Old Name',
      website: 'https://old.example',
    })
    expect(rollbackBuilder.eq).toHaveBeenCalledWith('name', 'New Name')
    expect(rollbackBuilder.eq).toHaveBeenCalledWith('website', 'https://new.example')
    expect(error.cause.moreInfo).toMatchObject({
      error: 'Stripe update failed',
    })
  })

  it('keeps the org row when Stripe already persisted the renamed customer name', async () => {
    const selectBuilder = createOrgSelectBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    }))
    const updateBuilder = createOrgUpdateBuilder(createOrgRow({
      id: 'org-123',
      name: 'New Name',
      customer_id: 'cus_123',
      updated_at: '2026-04-15T13:00:00Z',
    }))

    const from = vi.fn()
      .mockReturnValueOnce(selectBuilder)
      .mockReturnValueOnce(updateBuilder)

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(from))

    updateCustomerOrganizationNameMock
      .mockRejectedValueOnce(new Error('connection reset'))
    getStripeCustomerNameMock.mockResolvedValueOnce('New Name')

    const response = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined)

    expect(response.status).toBe(200)
    expect(getStripeCustomerNameMock).toHaveBeenCalledWith(expect.anything(), 'cus_123')
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('includes both errors when the database rollback fails after Stripe sync error', async () => {
    const selectBuilder = createOrgSelectBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    }))
    const updateBuilder = createOrgUpdateBuilder({
      ...createOrgRow({
        id: 'org-123',
        name: 'New Name',
        customer_id: 'cus_123',
        updated_at: '2026-04-15T13:00:00Z',
      }),
    })
    const rollbackBuilder = createOrgUpdateBuilder(null, { message: 'rollback failed' })

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce(rollbackBuilder),
    ))

    updateCustomerOrganizationNameMock
      .mockRejectedValueOnce(new Error('Stripe update failed'))
    getStripeCustomerNameMock.mockResolvedValueOnce('Old Name')

    const error = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined).catch(caught => caught)

    expect(error).toBeInstanceOf(HTTPException)
    expect(error.cause.moreInfo).toMatchObject({
      error: 'Stripe update failed',
      rollbackError: 'rollback failed',
    })
  })

  it('does not roll back the org row when Stripe state is unknown after a transport failure', async () => {
    const selectBuilder = createOrgSelectBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    }))
    const updateBuilder = createOrgUpdateBuilder(createOrgRow({
      id: 'org-123',
      name: 'New Name',
      customer_id: 'cus_123',
      updated_at: '2026-04-15T13:00:00Z',
    }))

    const from = vi.fn()
      .mockReturnValueOnce(selectBuilder)
      .mockReturnValueOnce(updateBuilder)

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(from))

    updateCustomerOrganizationNameMock
      .mockRejectedValueOnce(new Error('connection reset'))
    getStripeCustomerNameMock.mockResolvedValueOnce(undefined)
    isDeterministicStripeCustomerUpdateErrorMock.mockReturnValueOnce(false)

    const error = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined).catch(caught => caught)

    expect(error).toBeInstanceOf(HTTPException)
    expect(error.cause.moreInfo).toMatchObject({
      error: 'connection reset',
      stripeSyncState: 'unknown',
    })
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('rejects blank names after HTML stripping', async () => {
    const from = vi.fn()
    const rpc = vi.fn().mockResolvedValue({ data: '   ', error: null })

    supabaseClientMock.mockReturnValue({ from, rpc })

    const error = await put(createContext(), {
      orgId: 'org-123',
      name: '<b></b>',
    }, undefined).catch(caught => caught)

    expect(error).toBeInstanceOf(HTTPException)
    expect(error.cause.moreInfo).toMatchObject({
      error: 'sanitized_name_empty',
    })
    expect(from).not.toHaveBeenCalled()
    expect(updateCustomerOrganizationNameMock).not.toHaveBeenCalled()
  })

  it('skips Stripe sync for pending customer ids', async () => {
    const selectBuilder = createOrgSelectBuilder(createOrgRow({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'pending_org-123',
    }))
    const updateBuilder = createOrgUpdateBuilder({
      ...createOrgRow({
        id: 'org-123',
        name: 'New Name',
        customer_id: 'pending_org-123',
      }),
      id: 'org-123',
      logo: null,
    })

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder),
    ))

    const response = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined)

    expect(response.status).toBe(200)
    expect(updateCustomerOrganizationNameMock).not.toHaveBeenCalled()
    expect(updateBuilder.update).toHaveBeenCalledWith({ name: 'New Name' })
  })
})
