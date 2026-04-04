import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cloudlogErrMock,
  cloudlogMock,
  isGoodPlanOrgMock,
  isOnboardedOrgMock,
  isOnboardingNeededMock,
  isTrialOrgMock,
  sendEventToTrackingMock,
  sendNotifToOrgMembersMock,
  sendNotifToOrgMembersOnceMock,
  supabaseAdminMock,
} = vi.hoisted(() => ({
  cloudlogErrMock: vi.fn(),
  cloudlogMock: vi.fn(),
  isGoodPlanOrgMock: vi.fn(),
  isOnboardedOrgMock: vi.fn(),
  isOnboardingNeededMock: vi.fn(),
  isTrialOrgMock: vi.fn(),
  sendEventToTrackingMock: vi.fn(),
  sendNotifToOrgMembersMock: vi.fn(),
  sendNotifToOrgMembersOnceMock: vi.fn(),
  supabaseAdminMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  quickError: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: cloudlogErrMock,
}))

vi.mock('../supabase/functions/_backend/utils/org_email_notifications.ts', () => ({
  sendNotifToOrgMembers: sendNotifToOrgMembersMock,
  sendNotifToOrgMembersOnce: sendNotifToOrgMembersOnceMock,
}))

vi.mock('../supabase/functions/_backend/utils/stripe.ts', () => ({
  syncSubscriptionData: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  getCurrentPlanNameOrg: vi.fn(),
  getPlanUsageAndFit: vi.fn(),
  getPlanUsageAndFitUncached: vi.fn(),
  getPlanUsagePercent: vi.fn(),
  getTotalStats: vi.fn(),
  isGoodPlanOrg: isGoodPlanOrgMock,
  isOnboardedOrg: isOnboardedOrgMock,
  isOnboardingNeeded: isOnboardingNeededMock,
  isTrialOrg: isTrialOrgMock,
  set_bandwidth_exceeded: vi.fn(),
  set_build_time_exceeded: vi.fn(),
  set_mau_exceeded: vi.fn(),
  set_storage_exceeded: vi.fn(),
  supabaseAdmin: supabaseAdminMock,
}))

vi.mock('../supabase/functions/_backend/utils/tracking.ts', () => ({
  sendEventToTracking: sendEventToTrackingMock,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  isStripeConfigured: vi.fn(),
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

describe('handleOrgNotificationsAndEvents onboarding reminder', () => {
  beforeEach(() => {
    isOnboardedOrgMock.mockResolvedValue(false)
    isOnboardingNeededMock.mockResolvedValue(true)
    isTrialOrgMock.mockResolvedValue(0)
    isGoodPlanOrgMock.mockResolvedValue(false)
    sendNotifToOrgMembersMock.mockReset()
    sendNotifToOrgMembersOnceMock.mockResolvedValue(true)
    sendEventToTrackingMock.mockResolvedValue(undefined)
    supabaseAdminMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.concurrent('sends the trial-expired onboarding reminder only through the one-time helper with org context', async () => {
    const { handleOrgNotificationsAndEvents } = await import('../supabase/functions/_backend/utils/plans.ts')

    const result = await handleOrgNotificationsAndEvents(
      createContext(),
      {
        customer_id: null,
        name: 'Acme Mobile',
        stripe_info: null,
        website: 'https://acme.example/',
      },
      'org-123',
      false,
      {
        total_percent: 0,
        mau_percent: 0,
        bandwidth_percent: 0,
        storage_percent: 0,
        build_time_percent: 0,
      },
      {} as any,
    )

    expect(result).toBe(false)
    expect(sendNotifToOrgMembersMock).not.toHaveBeenCalled()
    expect(sendNotifToOrgMembersOnceMock).toHaveBeenCalledWith(
      expect.anything(),
      'user:need_onboarding',
      'onboarding',
      {
        org_id: 'org-123',
        org_name: 'Acme Mobile',
        org_website: 'https://acme.example/',
      },
      'org-123',
      'org-123',
      expect.anything(),
    )
    expect(sendEventToTrackingMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        channel: 'usage',
        event: 'User need onboarding',
        user_id: 'org-123',
      }),
    )
  })
})
