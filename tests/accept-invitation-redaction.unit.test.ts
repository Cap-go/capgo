import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app as acceptInvitationApp } from '../supabase/functions/_backend/private/accept_invitation.ts'

const {
  cloudlogMock,
  createUserMock,
  invitationState,
} = vi.hoisted(() => ({
  cloudlogMock: vi.fn(),
  createUserMock: vi.fn(),
  invitationState: {
    invitation: null as any,
  },
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: vi.fn(),
  serializeError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error',
    stack: error instanceof Error ? error.stack ?? 'N/A' : 'N/A',
  }),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  emptySupabase: vi.fn(),
  supabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: createUserMock,
      },
    },
    from: (table: string) => {
      if (table === 'tmp_users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: invitationState.invitation,
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'orgs') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  password_policy_config: null,
                  use_new_rbac: false,
                },
                error: null,
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

function acceptInvitationRequest() {
  return acceptInvitationApp.request('http://local/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      captchaToken: 'captcha-secret-token',
      magic_invite_string: 'invite-bearer-token-secret',
      opt_for_newsletters: false,
      password: 'ValidPassword123!',
    }),
  })
}

function expectLoggedInviteBodyIsRedacted() {
  const serializedLogs = JSON.stringify(cloudlogMock.mock.calls)
  expect(serializedLogs).not.toContain('invite-bearer-token-secret')
  expect(serializedLogs).not.toContain('ValidPassword123!')
  expect(serializedLogs).not.toContain('captcha-secret-token')
  expect(serializedLogs).toContain('has_magic_invite_string')
}

beforeEach(() => {
  cloudlogMock.mockReset()
  createUserMock.mockReset()
  createUserMock.mockResolvedValue({
    data: null,
    error: new Error('create user stopped by test'),
  })
  invitationState.invitation = {
    cancelled_at: null,
    email: 'invitee@example.com',
    future_uuid: '00f6d303-9514-4c56-83d5-7fbcfb0f4dd0',
    org_id: 'org-id',
    right: 'read',
  }
})

describe('accept invitation log redaction', () => {
  it('does not log the invite token before invitation lookup failures', async () => {
    invitationState.invitation = null

    await acceptInvitationRequest()

    expectLoggedInviteBodyIsRedacted()
  })

  it('does not log the invite token after validation succeeds', async () => {
    await acceptInvitationRequest()

    expectLoggedInviteBodyIsRedacted()
  })
})
