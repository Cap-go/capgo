import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../supabase/functions/_backend/utils/postgres_schema.ts'

const {
  claimNotifOrgOnceMock,
  cloudlogMock,
  getDrizzleClientMock,
  getPgClientMock,
  hasNotifOrgClaimMock,
  isBentoConfiguredMock,
  logPgErrorMock,
  sendNotifOrgMock,
  sendNotifOrgOnceMock,
} = vi.hoisted(() => ({
  claimNotifOrgOnceMock: vi.fn(),
  cloudlogMock: vi.fn(),
  getDrizzleClientMock: vi.fn(),
  getPgClientMock: vi.fn(),
  hasNotifOrgClaimMock: vi.fn(),
  isBentoConfiguredMock: vi.fn(),
  logPgErrorMock: vi.fn(),
  sendNotifOrgMock: vi.fn(),
  sendNotifOrgOnceMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/bento.ts', () => ({
  isBentoConfigured: isBentoConfiguredMock,
  trackBentoEvent: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
}))

vi.mock('../supabase/functions/_backend/utils/notifications.ts', () => ({
  claimNotifOrgOnce: claimNotifOrgOnceMock,
  hasNotifOrgClaim: hasNotifOrgClaimMock,
  sendNotifOrg: sendNotifOrgMock,
  sendNotifOrgOnce: sendNotifOrgOnceMock,
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', async () => {
  const actual = await vi.importActual<typeof import('../supabase/functions/_backend/utils/pg.ts')>('../supabase/functions/_backend/utils/pg.ts')
  return {
    ...actual,
    getDrizzleClient: getDrizzleClientMock,
    getPgClient: getPgClientMock,
    logPgError: logPgErrorMock,
  }
})

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

function createDrizzleStub(options?: {
  adminUsers?: { id: string, email: string, email_preferences?: Record<string, boolean> }[]
  managementEmail?: string
}) {
  const adminUsers = options?.adminUsers ?? []
  const managementEmail = options?.managementEmail ?? 'billing@example.com'

  const getRowsForTable = (table: any): any[] => {
    if (table === schema.orgs) {
      return [{ management_email: managementEmail, email_preferences: { onboarding: true } }]
    }
    if (table === schema.org_users) {
      return adminUsers.map(user => ({ user_id: user.id }))
    }
    if (
      table === schema.role_bindings
      || table === schema.group_members
    ) {
      return []
    }
    if (table === schema.users) {
      return adminUsers.map(user => ({
        id: user.id,
        email: user.email,
        email_preferences: user.email_preferences ?? { onboarding: true },
      }))
    }

    return []
  }

  return {
    select() {
      const query = {
        currentTable: undefined as any,
        from(table: any) {
          this.currentTable = table
          return this
        },
        innerJoin() {
          return this
        },
        where() {
          return this
        },
        limit(limitCount: number) {
          const rows = getRowsForTable(this.currentTable)
          return Promise.resolve(rows.slice(0, limitCount))
        },
        then(resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
          const rows = getRowsForTable(this.currentTable)
          return Promise.resolve(rows).then(resolve, reject)
        },
      }

      return query
    },
  } as any
}

describe('sendNotifToOrgMembersOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isBentoConfiguredMock.mockReturnValue(true)
    hasNotifOrgClaimMock.mockResolvedValue(false)
    getPgClientMock.mockReturnValue({} as any)
    getDrizzleClientMock.mockReturnValue({ kind: 'write-client' } as any)
  })

  it('does not send recipient notifications when the org-level claim already exists', async () => {
    hasNotifOrgClaimMock.mockResolvedValue(true)

    const { sendNotifToOrgMembersOnce } = await import('../supabase/functions/_backend/utils/org_email_notifications.ts')

    const sent = await sendNotifToOrgMembersOnce(
      createContext(),
      'user:need_onboarding',
      'onboarding',
      { org_id: 'org-123' },
      'org-123',
      'org-123',
      {} as any,
    )

    expect(sent).toBe(false)
    expect(hasNotifOrgClaimMock).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'write-client' },
      'user:need_onboarding',
      'org-123',
      'org-123',
    )
    expect(sendNotifOrgOnceMock).not.toHaveBeenCalled()
    expect(claimNotifOrgOnceMock).not.toHaveBeenCalled()
  })

  it('fails closed when the org-level claim lookup errors', async () => {
    hasNotifOrgClaimMock.mockResolvedValue(null)

    const { sendNotifToOrgMembersOnce } = await import('../supabase/functions/_backend/utils/org_email_notifications.ts')

    const sent = await sendNotifToOrgMembersOnce(
      createContext(),
      'user:need_onboarding',
      'onboarding',
      { org_id: 'org-123' },
      'org-123',
      'org-123',
      {} as any,
    )

    expect(sent).toBe(false)
    expect(sendNotifOrgOnceMock).not.toHaveBeenCalled()
    expect(claimNotifOrgOnceMock).not.toHaveBeenCalled()
    expect(cloudlogMock).toHaveBeenCalledWith(expect.objectContaining({
      message: 'sendNotifToOrgMembersOnce: org claim lookup failed',
      orgId: 'org-123',
      uniqId: 'org-123',
    }))
  })

  it('backfills the org-level claim once all recipient claims already exist', async () => {
    hasNotifOrgClaimMock
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    claimNotifOrgOnceMock.mockResolvedValue(true)

    const { sendNotifToOrgMembersOnce } = await import('../supabase/functions/_backend/utils/org_email_notifications.ts')

    const sent = await sendNotifToOrgMembersOnce(
      createContext(),
      'user:need_onboarding',
      'onboarding',
      { org_id: 'org-123' },
      'org-123',
      'org-123',
      createDrizzleStub(),
    )

    expect(sent).toBe(true)
    expect(sendNotifOrgOnceMock).not.toHaveBeenCalled()
    expect(claimNotifOrgOnceMock).toHaveBeenCalledWith(
      expect.anything(),
      'user:need_onboarding',
      'org-123',
      'org-123',
      expect.anything(),
    )
    expect(hasNotifOrgClaimMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { kind: 'write-client' },
      'user:need_onboarding',
      'org-123',
      expect.any(String),
    )
  })

  it('returns false when recipient claims exist but the org-level backfill claim fails', async () => {
    hasNotifOrgClaimMock
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    claimNotifOrgOnceMock.mockResolvedValue(false)

    const { sendNotifToOrgMembersOnce } = await import('../supabase/functions/_backend/utils/org_email_notifications.ts')

    const sent = await sendNotifToOrgMembersOnce(
      createContext(),
      'user:need_onboarding',
      'onboarding',
      { org_id: 'org-123' },
      'org-123',
      'org-123',
      createDrizzleStub(),
    )

    expect(sent).toBe(false)
    expect(sendNotifOrgOnceMock).not.toHaveBeenCalled()
    expect(claimNotifOrgOnceMock).toHaveBeenCalledWith(
      expect.anything(),
      'user:need_onboarding',
      'org-123',
      'org-123',
      expect.anything(),
    )
  })

  it('does not write the org-level claim when any unsent recipient is not already claimed', async () => {
    sendNotifOrgOnceMock
      .mockResolvedValueOnce({ sent: true, cleanupFailed: false })
      .mockResolvedValueOnce({ sent: false, cleanupFailed: false })
    hasNotifOrgClaimMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)

    const { sendNotifToOrgMembersOnce } = await import('../supabase/functions/_backend/utils/org_email_notifications.ts')

    const sent = await sendNotifToOrgMembersOnce(
      createContext(),
      'user:need_onboarding',
      'onboarding',
      { org_id: 'org-123' },
      'org-123',
      'org-123',
      createDrizzleStub({
        adminUsers: [{ id: 'admin-1', email: 'admin@example.com' }],
      }),
    )

    expect(sent).toBe(false)
    expect(sendNotifOrgOnceMock).toHaveBeenCalledTimes(2)
    expect(claimNotifOrgOnceMock).not.toHaveBeenCalled()
  })

  it('does not write the org-level claim when recipient cleanup fails', async () => {
    sendNotifOrgOnceMock.mockResolvedValue({ sent: false, cleanupFailed: true })

    const { sendNotifToOrgMembersOnce } = await import('../supabase/functions/_backend/utils/org_email_notifications.ts')

    const sent = await sendNotifToOrgMembersOnce(
      createContext(),
      'user:need_onboarding',
      'onboarding',
      { org_id: 'org-123' },
      'org-123',
      'org-123',
      createDrizzleStub(),
    )

    expect(sent).toBe(false)
    expect(hasNotifOrgClaimMock).toHaveBeenCalledTimes(2)
    expect(claimNotifOrgOnceMock).not.toHaveBeenCalled()
    expect(cloudlogMock).toHaveBeenCalledWith(expect.objectContaining({
      message: 'sendNotifToOrgMembersOnce: recipient cleanup failed',
      cleanupFailedRecipients: ['billing@example.com'],
    }))
  })
})
