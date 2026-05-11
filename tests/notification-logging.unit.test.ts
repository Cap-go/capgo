import { beforeEach, describe, expect, it, vi } from 'vitest'

const { cloudlogMock, logPgErrorMock, trackBentoEventMock } = vi.hoisted(() => ({
  cloudlogMock: vi.fn(),
  logPgErrorMock: vi.fn(),
  trackBentoEventMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
}))

vi.mock('../supabase/functions/_backend/utils/bento.ts', () => ({
  trackBentoEvent: trackBentoEventMock,
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  getDrizzleClient: vi.fn(),
  getPgClient: vi.fn(),
  logPgError: logPgErrorMock,
}))

describe('notification log metadata', () => {
  beforeEach(() => {
    cloudlogMock.mockReset()
    logPgErrorMock.mockReset()
    trackBentoEventMock.mockReset()
  })

  it('summarizes recipient email presence without retaining the address', async () => {
    const { getRecipientEmailLogMetadata } = await import('../supabase/functions/_backend/utils/notification_logging.ts')

    const metadata = getRecipientEmailLogMetadata('admin@example.com')

    expect(metadata).toEqual({ hasRecipientEmail: true })
    expect(JSON.stringify(metadata)).not.toContain('admin@example.com')
  })

  it('summarizes event data shape without retaining values', async () => {
    const { getEventDataLogMetadata } = await import('../supabase/functions/_backend/utils/notification_logging.ts')

    const metadata = getEventDataLogMetadata({
      email: 'invitee@example.com',
      token: 'secret-token',
    })

    expect(metadata).toEqual({
      hasEventData: true,
      eventDataFieldCount: 2,
    })
    expect(JSON.stringify(metadata)).not.toContain('invitee@example.com')
    expect(JSON.stringify(metadata)).not.toContain('secret-token')
  })

  it('logs one-time notification failures without retaining recipient or event data values', async () => {
    const { sendNotifOrgOnce } = await import('../supabase/functions/_backend/utils/notifications.ts')
    const returningMock = vi.fn().mockResolvedValue([{}])
    const writeClient = {
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: returningMock,
          })),
        })),
      })),
    }
    trackBentoEventMock.mockResolvedValue(false)

    const result = await sendNotifOrgOnce(
      { get: vi.fn().mockReturnValue('req-notif-log') } as any,
      'user:invite',
      { email: 'invitee@example.com', token: 'secret-token' },
      'org-id',
      'uniq-id',
      'recipient@example.com',
      {} as any,
      writeClient as any,
    )

    expect(result).toEqual({ sent: false, cleanupFailed: false })
    expect(cloudlogMock).toHaveBeenLastCalledWith({
      requestId: 'req-notif-log',
      message: 'trackEvent failed for one-time notif',
      eventName: 'user:invite',
      hasRecipientEmail: true,
      hasEventData: true,
      eventDataFieldCount: 2,
    })
    expect(JSON.stringify(cloudlogMock.mock.calls)).not.toContain('recipient@example.com')
    expect(JSON.stringify(cloudlogMock.mock.calls)).not.toContain('invitee@example.com')
    expect(JSON.stringify(cloudlogMock.mock.calls)).not.toContain('secret-token')
  })
})
