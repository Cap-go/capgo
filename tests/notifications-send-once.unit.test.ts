import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cloudlogMock,
  logPgErrorMock,
  trackBentoEventMock,
} = vi.hoisted(() => ({
  cloudlogMock: vi.fn(),
  logPgErrorMock: vi.fn(),
  trackBentoEventMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/bento.ts', () => ({
  trackBentoEvent: trackBentoEventMock,
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', async () => {
  const actual = await vi.importActual<typeof import('../supabase/functions/_backend/utils/pg.ts')>('../supabase/functions/_backend/utils/pg.ts')
  return {
    ...actual,
    logPgError: logPgErrorMock,
  }
})

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

function createWriteClient() {
  const returningMock = vi.fn().mockResolvedValue([{}])
  const onConflictDoNothingMock = vi.fn(() => ({ returning: returningMock }))
  const valuesMock = vi.fn(() => ({ onConflictDoNothing: onConflictDoNothingMock }))
  const insertMock = vi.fn(() => ({ values: valuesMock }))
  const whereMock = vi.fn().mockResolvedValue(undefined)
  const deleteMock = vi.fn(() => ({ where: whereMock }))

  return {
    client: {
      insert: insertMock,
      delete: deleteMock,
    } as any,
    deleteMock,
    whereMock,
  }
}

describe('sendNotifOrgOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.concurrent('deletes the recipient claim when Bento throws', async () => {
    trackBentoEventMock.mockRejectedValue(new Error('bento exploded'))
    const { client, deleteMock, whereMock } = createWriteClient()

    const { sendNotifOrgOnce } = await import('../supabase/functions/_backend/utils/notifications.ts')

    const sent = await sendNotifOrgOnce(
      createContext(),
      'user:need_onboarding',
      { org_id: 'org-123' },
      'org-123',
      'org-123:recipient',
      'billing@example.com',
      {} as any,
      client,
    )

    expect(sent).toBe(false)
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(whereMock).toHaveBeenCalledTimes(1)
    expect(logPgErrorMock).toHaveBeenCalledWith(
      expect.anything(),
      'sendNotifOrgOnce',
      expect.any(Error),
    )
  })
})
