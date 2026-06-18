import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCloudlog,
  mockCreateUser,
  mockEmptySupabase,
  mockSupabaseAdmin,
} = vi.hoisted(() => ({
  mockCloudlog: vi.fn(),
  mockCreateUser: vi.fn(),
  mockEmptySupabase: vi.fn(),
  mockSupabaseAdmin: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: mockCloudlog,
  cloudlogErr: vi.fn(),
  serializeError: (error: unknown) => JSON.stringify(error),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  emptySupabase: mockEmptySupabase,
  supabaseAdmin: mockSupabaseAdmin,
}))

vi.mock('../supabase/functions/_backend/utils/user_preferences.ts', () => ({
  syncUserPreferenceTags: vi.fn(),
}))

const { app } = await import('../supabase/functions/_backend/private/accept_invitation.ts')

const invitation = {
  email: 'invitee@example.com',
  first_name: 'Invited',
  future_uuid: '550e8400-e29b-41d4-a716-446655440000',
  last_name: 'User',
  org_id: 'org-test',
  role: 'read',
}

function buildSupabaseAdmin() {
  return {
    auth: {
      admin: {
        createUser: mockCreateUser,
      },
    },
    from(table: string) {
      if (table === 'tmp_users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: invitation, error: null }),
            }),
          }),
        }
      }

      if (table === 'orgs') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { password_policy_config: null }, error: null }),
            }),
          }),
        }
      }

      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('accept invitation logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseAdmin.mockReturnValue(buildSupabaseAdmin())
    mockEmptySupabase.mockReturnValue({})
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { message: 'stop after validated log' },
    })
  })

  it('redacts invitation bearer token from raw and validated body logs', async () => {
    const inviteToken = 'secret-invite-token'
    const response = await app.request(new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: 'Password1!',
        magic_invite_string: inviteToken,
        opt_for_newsletters: false,
        captchaToken: 'captcha-secret',
      }),
    }))

    expect(response.status).toBe(500)

    const rawBodyLog = mockCloudlog.mock.calls.find(([entry]) => entry.context === 'accept_invitation raw body')?.[0]
    const validatedBodyLog = mockCloudlog.mock.calls.find(([entry]) => entry.context === 'accept_invitation validated body')?.[0]

    expect(rawBodyLog?.rawBody).toEqual({ opt_for_newsletters: false })
    expect(validatedBodyLog?.body).toEqual({ opt_for_newsletters: false })
    expect(JSON.stringify(mockCloudlog.mock.calls)).not.toContain(inviteToken)
    expect(JSON.stringify(mockCloudlog.mock.calls)).not.toContain('Password1!')
    expect(JSON.stringify(mockCloudlog.mock.calls)).not.toContain('captcha-secret')
  })
})
