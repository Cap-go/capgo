import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  checkPermissionMock,
  supabaseClientMock,
  supabaseApikeyMock,
  apikeyHasOrgRightWithPolicyMock,
  supabaseAdminMock,
  updateCustomerOrganizationNameMock,
} = vi.hoisted(() => ({
  checkPermissionMock: vi.fn(),
  supabaseClientMock: vi.fn(),
  supabaseApikeyMock: vi.fn(),
  apikeyHasOrgRightWithPolicyMock: vi.fn(),
  supabaseAdminMock: vi.fn(),
  updateCustomerOrganizationNameMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/stripe.ts', () => ({
  updateCustomerOrganizationName: (...args: unknown[]) => updateCustomerOrganizationNameMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseClient: (...args: unknown[]) => supabaseClientMock(...args),
  supabaseApikey: (...args: unknown[]) => supabaseApikeyMock(...args),
  apikeyHasOrgRightWithPolicy: (...args: unknown[]) => apikeyHasOrgRightWithPolicyMock(...args),
  supabaseAdmin: (...args: unknown[]) => supabaseAdminMock(...args),
}))

const { put } = await import('../supabase/functions/_backend/public/organization/put.ts')

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

function createOrgSelectBuilder(data: { id: string, name: string, customer_id: string | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

function createOrgUpdateBuilder(data: any, error: { message: string } | null = null) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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
    apikeyHasOrgRightWithPolicyMock.mockResolvedValue({ valid: true })
  })

  it('syncs Stripe customer name before updating the org row', async () => {
    const selectBuilder = createOrgSelectBuilder({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    })
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
  })

  it('rolls Stripe back when a competing rename wins the database write', async () => {
    const selectBuilder = createOrgSelectBuilder({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    })
    const rollbackSelectBuilder = createOrgSelectBuilder({
      id: 'org-123',
      name: 'Concurrent Name',
      customer_id: 'cus_123',
    })
    const updateBuilder = createOrgUpdateBuilder(null)

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce(rollbackSelectBuilder),
    ))

    const error = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined).catch(caught => caught)

    expect(error).toBeInstanceOf(HTTPException)
    expect(updateCustomerOrganizationNameMock).toHaveBeenNthCalledWith(1, expect.anything(), 'cus_123', 'New Name')
    expect(updateCustomerOrganizationNameMock).toHaveBeenNthCalledWith(2, expect.anything(), 'cus_123', 'Concurrent Name')
    expect(error.cause.moreInfo).toMatchObject({
      error: 'org_name_changed',
      orgId: 'org-123',
    })
  })

  it('rolls Stripe back when the database update fails', async () => {
    const selectBuilder = createOrgSelectBuilder({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    })
    const rollbackSelectBuilder = createOrgSelectBuilder({
      id: 'org-123',
      name: 'Concurrent Name',
      customer_id: 'cus_123',
    })
    const updateBuilder = createOrgUpdateBuilder(null, { message: 'db write failed' })

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce(rollbackSelectBuilder),
    ))

    const error = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined).catch(caught => caught)

    expect(error).toBeInstanceOf(HTTPException)
    expect(updateCustomerOrganizationNameMock).toHaveBeenNthCalledWith(1, expect.anything(), 'cus_123', 'New Name')
    expect(updateCustomerOrganizationNameMock).toHaveBeenNthCalledWith(2, expect.anything(), 'cus_123', 'Concurrent Name')
    expect(error.cause.moreInfo).toMatchObject({
      error: 'db write failed',
    })
  })

  it('includes both errors when Stripe rollback fails', async () => {
    const selectBuilder = createOrgSelectBuilder({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'cus_123',
    })
    const rollbackSelectBuilder = createOrgSelectBuilder({
      id: 'org-123',
      name: 'Concurrent Name',
      customer_id: 'cus_123',
    })
    const updateBuilder = createOrgUpdateBuilder(null, { message: 'db write failed' })

    supabaseClientMock.mockReturnValue(createSupabaseClientStub(
      vi.fn()
        .mockReturnValueOnce(selectBuilder)
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce(rollbackSelectBuilder),
    ))

    updateCustomerOrganizationNameMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Stripe rollback failed'))

    const error = await put(createContext(), {
      orgId: 'org-123',
      name: 'New Name',
    }, undefined).catch(caught => caught)

    expect(error).toBeInstanceOf(HTTPException)
    expect(error.cause.moreInfo).toMatchObject({
      error: 'db write failed',
      rollbackError: 'Stripe rollback failed',
    })
    expect(updateCustomerOrganizationNameMock).toHaveBeenNthCalledWith(1, expect.anything(), 'cus_123', 'New Name')
    expect(updateCustomerOrganizationNameMock).toHaveBeenNthCalledWith(2, expect.anything(), 'cus_123', 'Concurrent Name')
  })

  it('skips Stripe sync for pending customer ids', async () => {
    const selectBuilder = createOrgSelectBuilder({
      id: 'org-123',
      name: 'Old Name',
      customer_id: 'pending_org-123',
    })
    const updateBuilder = createOrgUpdateBuilder({
      id: 'org-123',
      name: 'New Name',
      customer_id: 'pending_org-123',
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
