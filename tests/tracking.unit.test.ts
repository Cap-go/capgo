import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  backgroundTaskMock,
  cloudlogErrMock,
  drizzleClientMock,
  pgClientEndMock,
  pgClientMock,
  notifToOrgMembersMock,
  notifToOrgMembersOnceMock,
  posthogMock,
  posthogDeliveryMock,
} = vi.hoisted(() => ({
  backgroundTaskMock: vi.fn(),
  cloudlogErrMock: vi.fn(),
  drizzleClientMock: { mocked: true },
  notifToOrgMembersMock: vi.fn(),
  notifToOrgMembersOnceMock: vi.fn(),
  pgClientEndMock: vi.fn().mockResolvedValue(undefined),
  pgClientMock: { mocked: true, end: vi.fn().mockResolvedValue(undefined) },
  posthogMock: vi.fn(),
  posthogDeliveryMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  backgroundTask: backgroundTaskMock,
}))

vi.mock('../supabase/functions/_backend/utils/posthog.ts', () => ({
  trackPosthogEvent: posthogMock,
  deliverPosthogEvent: posthogDeliveryMock,
}))

vi.mock('../supabase/functions/_backend/utils/org_email_notifications.ts', () => ({
  sendNotifToOrgMembers: notifToOrgMembersMock,
  sendNotifToOrgMembersOnce: notifToOrgMembersOnceMock,
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  getDrizzleClient: vi.fn(() => drizzleClientMock),
  getPgClient: vi.fn(() => ({ ...pgClientMock, end: pgClientEndMock })),
  closeClient: (_c: unknown, client: { end: () => Promise<void> }) => client.end(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlogErr: cloudlogErrMock,
  serializeError: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
    req: {
      header: (name: string) => name === 'x-forwarded-for' ? '1.2.3.4, 5.6.7.8' : undefined,
    },
  } as any
}

beforeEach(() => {
  backgroundTaskMock.mockImplementation((_c: unknown, promise: Promise<unknown>) => promise)
  notifToOrgMembersMock.mockResolvedValue(true)
  notifToOrgMembersOnceMock.mockResolvedValue(true)
  pgClientEndMock.mockResolvedValue(undefined)
  posthogMock.mockResolvedValue(true)
  posthogDeliveryMock.mockResolvedValue({ outcome: 'delivered', legacy_success: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  backgroundTaskMock.mockReset()
  notifToOrgMembersMock.mockReset()
  notifToOrgMembersOnceMock.mockReset()
  pgClientEndMock.mockReset()
  posthogMock.mockReset()
  posthogDeliveryMock.mockReset()
  cloudlogErrMock.mockReset()
})

describe('sendEventToTracking', () => {
  it.each(['quota_limited', 'permanent_failure', 'ambiguous', 'retryable'])('rejects %s despite a legacy successful HTTP response when delivery is required', async (outcome) => {
    posthogDeliveryMock.mockResolvedValue({ outcome, legacy_success: true })
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')
    await expect(sendEventToTracking(createContext(), {
      channel: 'org-created',
      event: 'Org Created',
    }, { background: false, requirePosthogDelivery: true })).rejects.toThrow()
  })

  it('awaits confirmed delivery with immutable event properties and a bounded timeout', async () => {
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')
    await sendEventToTracking(createContext(), {
      channel: 'org-created',
      event: 'Org Created',
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      occurred_at: '2026-10-01T12:00:00.000Z',
      nonPersonTags: { org_id: 'org-id', $insert_id: 'org-created:org-id' },
      timeoutMs: 1000,
    }, { background: false, requirePosthogDelivery: true })
    expect(posthogDeliveryMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2026-10-01T12:00:00.000Z',
      nonPersonTags: { org_id: 'org-id', $insert_id: 'org-created:org-id' },
      timeoutMs: 1000,
    }))
    expect(posthogMock).not.toHaveBeenCalled()
  })

  it('preserves Bento work when required PostHog delivery fails', async () => {
    posthogDeliveryMock.mockResolvedValue({ outcome: 'quota_limited', legacy_success: true })
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')
    await expect(sendEventToTracking(createContext(), {
      channel: 'org-created',
      event: 'Org Created',
      sentToBento: true,
      user_id: 'user-id',
      groups: { organization: 'org-id' },
      bento: { data: {}, event: 'org:created', preferenceKey: 'onboarding', uniqId: 'org:created:org-id', once: true },
    }, { background: false, strict: true, requirePosthogDelivery: true })).rejects.toThrow('posthog tracking returned false')
    expect(notifToOrgMembersOnceMock).toHaveBeenCalledOnce()
    expect(notifToOrgMembersMock).not.toHaveBeenCalled()
  })

  it('forwards the accepted canonical ID and frozen time to PostHog', async () => {
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')
    await sendEventToTracking(createContext(), {
      channel: 'usage',
      event: 'Frozen Event',
      event_id: '031c6527-7d90-842d-9abd-17f442067e20',
      occurred_at: '2026-10-06T10:00:00.000Z',
      accepted_at: '2026-10-06T10:00:01.000Z',
      timestamp: Date.parse('2026-10-06T10:10:00.000Z'),
    }, { background: false })
    expect(posthogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event_id: '031c6527-7d90-842d-9abd-17f442067e20',
      timestamp: '2026-10-06T10:00:00.000Z',
    }))
  })

  it('uses the authenticated API key ID instead of a caller-provided tag', async () => {
    const { addAuthenticatedApiKeyIdToTrackingPayload } = await import('../supabase/functions/_backend/utils/tracking.ts')

    const payload = addAuthenticatedApiKeyIdToTrackingPayload({
      channel: 'usage',
      event: 'Tracked Event',
      tags: { apikey_id: 'caller-supplied', app_id: 'app-id' },
    }, 87015)

    expect(payload.tags).toEqual({ app_id: 'app-id' })
    expect(payload.nonPersonTags).toEqual({ apikey_id: 87015 })
  })

  it('does not allow callers without an API key to report an API key ID', async () => {
    const { addAuthenticatedApiKeyIdToTrackingPayload } = await import('../supabase/functions/_backend/utils/tracking.ts')

    const payload = addAuthenticatedApiKeyIdToTrackingPayload({
      channel: 'usage',
      event: 'Tracked Event',
      tags: { apikey_id: 'caller-supplied', app_id: 'app-id' },
      nonPersonTags: { apikey_id: 'caller-supplied', cli_version: '8.31.3' },
    }, undefined)

    expect(payload.tags).toEqual({ app_id: 'app-id' })
    expect(payload.nonPersonTags).toEqual({ cli_version: '8.31.3' })
  })

  it('runs PostHog and Bento in the background by default', async () => {
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')

    await sendEventToTracking(createContext(), {
      bento: {
        cron: '* * * * *',
        data: { org_id: 'org-id' },
        event: 'org:tracked',
        preferenceKey: 'onboarding',
        uniqId: 'org:tracked',
      },
      channel: 'usage',
      event: 'Tracked Event',
      user_id: 'org-id',
      description: 'test description',
      sentToBento: true,
      tags: { app_id: 'app-id' },
      nonPersonTags: { apikey_id: 87015 },
    })

    expect(backgroundTaskMock).toHaveBeenCalledTimes(2)
    expect(posthogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: 'Tracked Event',
      ip: '1.2.3.4',
      nonPersonTags: { apikey_id: 87015 },
      user_id: 'org-id',
    }))
    expect(notifToOrgMembersMock).toHaveBeenCalledWith(
      expect.anything(),
      'org:tracked',
      'onboarding',
      { org_id: 'org-id' },
      'org-id',
      'org:tracked',
      '* * * * *',
      expect.anything(),
      undefined,
    )
  })

  it('can run inline and keeps Bento running when PostHog fails', async () => {
    posthogMock.mockRejectedValueOnce(new Error('posthog failed'))
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')

    await sendEventToTracking(createContext(), {
      bento: {
        data: { org_id: 'org-id' },
        event: 'org:inline',
        preferenceKey: 'onboarding',
        uniqId: 'org:inline',
      },
      channel: 'usage',
      event: 'Inline Event',
      user_id: 'org-id',
      sentToBento: true,
    }, {
      background: false,
    })

    expect(backgroundTaskMock).not.toHaveBeenCalled()
    expect(posthogMock).toHaveBeenCalledOnce()
    expect(notifToOrgMembersMock).toHaveBeenCalledOnce()
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      message: 'sendEventToTracking provider failed',
      provider: 'posthog',
    }))
  })

  it.each([
    ['a Date', new Date('2026-08-18T08:15:30.000Z')],
    ['a numeric timestamp', Date.parse('2026-08-18T09:45:00.000Z')],
  ])('preserves %s when forwarding events to PostHog', async (_label, timestamp) => {
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')

    await sendEventToTracking(createContext(), {
      channel: 'usage',
      event: 'Timestamped Event',
      timestamp,
    }, { background: false })

    expect(posthogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      timestamp: new Date(timestamp).toISOString(),
    }))
  })

  it.each([
    ['an invalid Date', new Date(Number.NaN)],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['an out-of-range timestamp', 8.64e15 + 1],
  ])('drops %s instead of failing strict tracking', async (_label, timestamp) => {
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')

    await expect(sendEventToTracking(createContext(), {
      channel: 'usage',
      event: 'Invalid Timestamp Event',
      timestamp,
    }, { background: false, strict: true })).resolves.toBeUndefined()

    expect(posthogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      timestamp: undefined,
    }))
  })

  it('ignores legacy presentation and notification fields instead of copying them into PostHog metadata', async () => {
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')

    await sendEventToTracking(createContext(), {
      channel: 'usage',
      event: 'Legacy Presentation Event',
      icon: '🧪',
      nonPersonTags: { cli_version: '8.31.3' },
      notify: true,
      parser: 'markdown',
    } as any, { background: false })

    expect(posthogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      nonPersonTags: {
        cli_version: '8.31.3',
      },
    }))
    const posthogPayload = posthogMock.mock.calls[0]?.[1]
    expect(posthogPayload).not.toHaveProperty('icon')
    expect(posthogPayload).not.toHaveProperty('notify')
    expect(posthogPayload).not.toHaveProperty('parser')
  })

  it('can skip PostHog while preserving Bento delivery', async () => {
    const { sendEventToTracking } = await import('../supabase/functions/_backend/utils/tracking.ts')

    await sendEventToTracking(createContext(), {
      bento: {
        data: { app_id: 'com.example.app' },
        event: 'app:ai_instructions_copied',
        preferenceKey: 'onboarding',
        uniqId: 'app:ai_instructions_copied:com.example.app:attempt-id',
      },
      channel: 'onboarding',
      event: 'onboarding_ai_instructions_copied',
      sentToBento: true,
      user_id: 'org-id',
    }, { background: false, posthog: false })

    expect(posthogMock).not.toHaveBeenCalled()
    expect(notifToOrgMembersMock).toHaveBeenCalledOnce()
  })
})
