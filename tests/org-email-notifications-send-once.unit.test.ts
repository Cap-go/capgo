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

function createDrizzleStub() {
  const getRowsForTable = (table: any): any[] => {
    if (table === schema.orgs) {
      return [{ management_email: 'billing@example.com', email_preferences: { onboarding: true } }]
    }
    if (
      table === schema.org_users
      || table === schema.role_bindings
      || table === schema.group_members
      || table === schema.users
    ) {
      return []
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

  it.concurrent('does not send recipient notifications when the org-level claim already exists', async () => {
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
      expect.anything(),
      'user:need_onboarding',
      'org-123',
      'org-123',
    )
    expect(sendNotifOrgOnceMock).not.toHaveBeenCalled()
    expect(claimNotifOrgOnceMock).not.toHaveBeenCalled()
  })

  it.concurrent('backfills the org-level claim once all recipient claims already exist', async () => {
    hasNotifOrgClaimMock
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    sendNotifOrgOnceMock.mockResolvedValue(false)
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
    expect(sendNotifOrgOnceMock).toHaveBeenCalledTimes(1)
    expect(claimNotifOrgOnceMock).toHaveBeenCalledWith(
      expect.anything(),
      'user:need_onboarding',
      'org-123',
      'org-123',
      expect.anything(),
    )
  })

  it.concurrent('returns false when recipient claims exist but the org-level backfill claim fails', async () => {
    hasNotifOrgClaimMock
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    sendNotifOrgOnceMock.mockResolvedValue(false)
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
    expect(sendNotifOrgOnceMock).toHaveBeenCalledTimes(1)
    expect(claimNotifOrgOnceMock).toHaveBeenCalledWith(
      expect.anything(),
      'user:need_onboarding',
      'org-123',
      'org-123',
      expect.anything(),
    )
  })
})
