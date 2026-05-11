import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  apikeyHasOrgRightWithPolicyMock,
  checkPermissionMock,
  cloudlogMock,
  createSignedImageUrlMock,
  supabaseAdminMock,
  supabaseApikeyMock,
} = vi.hoisted(() => ({
  apikeyHasOrgRightWithPolicyMock: vi.fn(),
  checkPermissionMock: vi.fn(),
  cloudlogMock: vi.fn(),
  createSignedImageUrlMock: vi.fn(),
  supabaseAdminMock: vi.fn(),
  supabaseApikeyMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  BRES: { status: 'ok' },
  quickError: (status: number, error: string, message: string, details: Record<string, unknown> = {}) => {
    const issue = new Error(message) as Error & { details?: Record<string, unknown>, status?: number }
    issue.status = status
    issue.details = { error, ...details }
    throw issue
  },
  simpleError: (error: string, message: string, details: Record<string, unknown> = {}) => {
    const issue = new Error(message) as Error & { details?: Record<string, unknown>, status?: number }
    issue.status = 400
    issue.details = { error, ...details }
    throw issue
  },
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/storage.ts', () => ({
  createSignedImageUrl: (...args: unknown[]) => createSignedImageUrlMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  apikeyHasOrgRightWithPolicy: (...args: unknown[]) => apikeyHasOrgRightWithPolicyMock(...args),
  supabaseAdmin: (...args: unknown[]) => supabaseAdminMock(...args),
  supabaseApikey: (...args: unknown[]) => supabaseApikeyMock(...args),
}))

const ORG_ID = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'
const USER_ID = '86a84313-9b9f-46d0-9cbb-09d67f18c8f6'
const MEMBER_ID = '73ad0d23-ce1f-40ca-a9e8-d3a73eaa1ff2'
const INVITE_ID = 'b814fd2d-7f5c-4526-a2e4-a52534616b52'
const MEMBER_EMAIL = 'member@example.com'
const INVITE_EMAIL = 'invitee@example.com'
const SIGNED_IMAGE_URL = 'https://storage.example.com/image.png?token=secret-token'

function createContext() {
  return {
    get: vi.fn((key: string) => {
      if (key === 'requestId')
        return 'request-test'
      if (key === 'capgkey')
        return 'capgkey-secret'
      if (key === 'auth')
        return undefined
      return undefined
    }),
    json: vi.fn((body: unknown) => Response.json(body)),
  }
}

function buildInviteSupabaseClient(useNewRbac = false) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'orgs')
        throw new Error(`Unexpected table: ${table}`)

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { use_new_rbac: useNewRbac }, error: null }),
      }
    }),
    rpc: vi.fn().mockResolvedValue({ data: 'OK', error: null }),
  }
}

function buildDeleteSupabaseClient() {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'org_users')
        throw new Error(`Unexpected table: ${table}`)

      return {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { org_id: ORG_ID, user_id: USER_ID }, error: null }),
        select: vi.fn().mockReturnThis(),
      }
    }),
  }
}

function buildAdminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: USER_ID }, error: null }),
        }
      }

      if (table === 'role_bindings') {
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          error: null,
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function buildGetMembersSupabaseClient() {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          email: MEMBER_EMAIL,
          image_url: 'org/member/avatar.png',
          is_tmp: false,
          role: 'admin',
          uid: MEMBER_ID,
        },
        {
          email: INVITE_EMAIL,
          image_url: null,
          is_tmp: true,
          role: 'invite_read',
          uid: INVITE_ID,
        },
      ],
      error: null,
    }),
  }
}

function expectLogsToExcludeSensitiveValues() {
  const logs = JSON.stringify(cloudlogMock.mock.calls)
  expect(logs).not.toContain(ORG_ID)
  expect(logs).not.toContain(USER_ID)
  expect(logs).not.toContain(MEMBER_ID)
  expect(logs).not.toContain(INVITE_ID)
  expect(logs).not.toContain(MEMBER_EMAIL)
  expect(logs).not.toContain(INVITE_EMAIL)
  expect(logs).not.toContain('capgkey-secret')
  expect(logs).not.toContain('secret-token')
}

describe('organization members logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apikeyHasOrgRightWithPolicyMock.mockResolvedValue({ valid: true })
    checkPermissionMock.mockResolvedValue(true)
    createSignedImageUrlMock.mockResolvedValue(SIGNED_IMAGE_URL)
    supabaseAdminMock.mockReturnValue(buildAdminClient())
  })

  it('does not log invited email or organization id when inviting a member', async () => {
    supabaseApikeyMock.mockReturnValue(buildInviteSupabaseClient())
    const { post } = await import('../supabase/functions/_backend/public/organization/members/post.ts')

    const response = await post(createContext() as any, {
      email: INVITE_EMAIL,
      invite_type: 'read',
      orgId: ORG_ID,
    }, { key: 'api-key' } as any)

    expect(response.status).toBe(200)
    expect(cloudlogMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        hasEmail: true,
        hasInviteType: true,
        hasOrgId: true,
      }),
      message: 'User invited to organization',
    }))
    expectLogsToExcludeSensitiveValues()
  })

  it('does not log deleted member email, user id, or organization id', async () => {
    supabaseApikeyMock.mockReturnValue(buildDeleteSupabaseClient())
    const { deleteMember } = await import('../supabase/functions/_backend/public/organization/members/delete.ts')

    const response = await deleteMember(createContext() as any, {
      email: MEMBER_EMAIL,
      orgId: ORG_ID,
    }, { key: 'api-key' } as any)

    expect(response.status).toBe(200)
    expect(cloudlogMock).toHaveBeenCalledTimes(1)
    expect(cloudlogMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        hasEmail: true,
        hasOrgId: true,
        hasUserId: true,
      }),
      message: 'User deleted from organization',
    }))
    expectLogsToExcludeSensitiveValues()
  })

  it('does not log member emails, ids, or signed image URLs when listing members', async () => {
    supabaseApikeyMock.mockReturnValue(buildGetMembersSupabaseClient())
    const { get } = await import('../supabase/functions/_backend/public/organization/members/get.ts')

    const response = await get(createContext() as any, { orgId: ORG_ID }, {
      key: 'api-key',
      user_id: USER_ID,
    } as any)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ email: MEMBER_EMAIL, image_url: SIGNED_IMAGE_URL, uid: MEMBER_ID }),
      expect.objectContaining({ email: INVITE_EMAIL, image_url: '', uid: INVITE_ID }),
    ])
    expect(cloudlogMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        hasData: true,
        hasError: false,
        memberCount: 2,
      }),
      message: 'Organization members query result',
    }))
    expect(cloudlogMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        hasSignedImages: true,
        memberCount: 2,
        temporaryMemberCount: 1,
      }),
      message: 'Organization members prepared',
    }))
    expectLogsToExcludeSensitiveValues()
  })
})
