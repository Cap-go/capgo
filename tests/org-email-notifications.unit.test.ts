import { describe, expect, it } from 'vitest'
import { orgEmailNotificationTestUtils } from '../supabase/functions/_backend/utils/org_email_notifications.ts'

describe('org email notification recipient selection', () => {
  it.concurrent('prefers the management email when it is eligible', () => {
    expect(
      orgEmailNotificationTestUtils.getEligibleEmailTargets(
        ['admin1@example.com', 'admin2@example.com'],
        'billing@example.com',
      ),
    ).toEqual({
      allEmails: ['admin1@example.com', 'admin2@example.com', 'billing@example.com'],
      primaryEmail: 'billing@example.com',
      additionalEmails: ['admin1@example.com', 'admin2@example.com'],
    })
  })

  it.concurrent('falls back to the first admin when the management email is not eligible', () => {
    expect(
      orgEmailNotificationTestUtils.getEligibleEmailTargets(
        ['admin1@example.com', 'admin2@example.com'],
        null,
      ),
    ).toEqual({
      allEmails: ['admin1@example.com', 'admin2@example.com'],
      primaryEmail: 'admin1@example.com',
      additionalEmails: ['admin2@example.com'],
    })
  })
})
