import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  checkPermissionMock,
  cloudlogMock,
  supabaseAdminMock,
  supabaseApikeyMock,
} = vi.hoisted(() => ({
  checkPermissionMock: vi.fn(),
  cloudlogMock: vi.fn(),
  supabaseAdminMock: vi.fn(),
  supabaseApikeyMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: (...args: unknown[]) => cloudlogMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: (...args: unknown[]) => supabaseAdminMock(...args),
  supabaseApikey: (...args: unknown[]) => supabaseApikeyMock(...args),
}))

const { deleteMember } = await import('../supabase/functions/_backend/public/organization/members/delete.ts')

function createContext() {
  return {
    get: (key: string) => {
      if (key === 'capgkey')
        return 'capgo-test-key'
      if (key === 'requestId')
        return 'delete-member-test'
      return undefined
    },
    json: (data: unknown, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  } as any
}

function createAdminUserLookup(result: { data: { id: string } | null, error: unknown }) {
  return {
    from: (table: string) => {
      expect(table).toBe('users')
      return {
        select: () => ({
          eq: () => ({
            single: async () => result,
          }),
        }),
      }
    },
  }
}

function createDeleteBuilder(result: { data: unknown, error: unknown }) {
  const builder = {
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn(() => builder),
  }
  return builder
}

function createApikeyDeleteClient(result: { data: unknown, error: unknown }) {
  const deleteBuilder = createDeleteBuilder(result)
  return {
    deleteBuilder,
    client: {
      from: (table: string) => {
        expect(table).toBe('org_users')
        return deleteBuilder
      },
    },
  }
}

async function captureDeleteError(email: string) {
  try {
    await deleteMember(createContext(), {
      email,
      orgId: 'org-123',
    }, {} as any)
  }
  catch (error) {
    expect(error).toBeInstanceOf(HTTPException)
    const exception = error as HTTPException
    return {
      cause: exception.cause,
      status: exception.status,
    }
  }

  throw new Error('deleteMember did not reject')
}

describe('organization member delete enumeration protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPermissionMock.mockResolvedValue(true)
  })

  it('returns the same sanitized response for missing users and existing nonmembers', async () => {
    supabaseAdminMock.mockReturnValue(createAdminUserLookup({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    }))
    const missingUser = await captureDeleteError('missing-user@example.com')

    const { client: apikeyClient } = createApikeyDeleteClient({ data: null, error: null })
    supabaseAdminMock.mockReturnValue(createAdminUserLookup({
      data: { id: 'user-123' },
      error: null,
    }))
    supabaseApikeyMock.mockReturnValue(apikeyClient)
    const existingNonmember = await captureDeleteError('existing-user@example.com')

    expect(existingNonmember).toEqual(missingUser)
    expect(missingUser.status).toBe(404)
    expect(missingUser.cause).toMatchObject({
      error: 'organization_member_not_found',
      message: 'User is not a member of this organization',
      moreInfo: { orgId: 'org-123' },
    })

    const serializedResponse = JSON.stringify([missingUser, existingNonmember])
    expect(serializedResponse).not.toContain('missing-user@example.com')
    expect(serializedResponse).not.toContain('existing-user@example.com')
    expect(serializedResponse).not.toContain('PGRST116')
    expect(serializedResponse).not.toContain('No rows found')
    expect(serializedResponse).not.toContain('user-123')
  })
})
