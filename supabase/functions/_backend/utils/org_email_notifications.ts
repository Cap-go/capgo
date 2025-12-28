import type { Context } from 'hono'
import { trackBentoEvent } from './bento.ts'
import { cloudlog } from './logging.ts'
import { supabaseAdmin } from './supabase.ts'

/**
 * Email preference keys that map to the JSONB email_preferences column in the users table.
 * These control which types of emails a user wants to receive.
 */
export type EmailPreferenceKey =
  | 'usage_limit'
  | 'credit_usage'
  | 'onboarding'
  | 'weekly_stats'
  | 'monthly_stats'
  | 'deploy_stats_24h'
  | 'bundle_created'
  | 'bundle_deployed'
  | 'device_error'

interface EmailPreferences {
  usage_limit?: boolean
  credit_usage?: boolean
  onboarding?: boolean
  weekly_stats?: boolean
  monthly_stats?: boolean
  deploy_stats_24h?: boolean
  bundle_created?: boolean
  bundle_deployed?: boolean
  device_error?: boolean
}


/**
 * Get all admin/super_admin members of an organization who have the specified email preference enabled.
 * Returns array of emails that should receive the notification.
 */
async function getEligibleOrgMemberEmails(
  c: Context,
  orgId: string,
  preferenceKey: EmailPreferenceKey,
): Promise<string[]> {
  // email_preferences is a JSONB column added in migration 20251228064121
  const { data: members, error } = await supabaseAdmin(c)
    .from('org_users')
    .select(`
      user_id,
      user_right,
      users!inner (
        email
      )
    `)
    .eq('org_id', orgId)
    .in('user_right', ['admin', 'super_admin'])
    .is('app_id', null) // org-level membership only, not app-specific

  if (error || !members) {
    cloudlog({ requestId: c.get('requestId'), message: 'getEligibleOrgMemberEmails error', orgId, error })
    return []
  }

  // Fetch user email_preferences separately since it might not be in generated types yet
  const userIds = members.map(m => m.user_id)
  const { data: users } = await supabaseAdmin(c)
    .from('users')
    .select('id, email')
    .in('id', userIds)

  const userPrefsMap = new Map<string, EmailPreferences>()
  if (users) {
    for (const user of users) {
      const prefs = ((user as any).email_preferences as EmailPreferences | null) ?? {}
      userPrefsMap.set(user.id, prefs)
    }
  }

  const eligibleEmails: string[] = []

  for (const member of members) {
    const userRow = (member as any).users
    if (!userRow?.email)
      continue

    // Default to true if email_preferences is null or the key doesn't exist
    const prefs = userPrefsMap.get(member.user_id) ?? {}
    const prefValue = prefs[preferenceKey]
    const isEnabled = prefValue === undefined ? true : prefValue

    if (isEnabled) {
      eligibleEmails.push(userRow.email)
    }
  }

  return eligibleEmails
}

/**
 * Send an email notification to all eligible org members (admin/super_admin with preference enabled).
 * This is the main function to use for sending operational emails to org members.
 *
 * @param c - Hono context
 * @param eventName - The Bento event name (e.g., 'user:weekly_stats')
 * @param preferenceKey - The key in email_preferences JSONB column
 * @param eventData - Metadata to include in the email event
 * @param orgId - The organization ID
 * @returns Number of emails successfully sent
 */
export async function sendEmailToOrgMembers(
  c: Context,
  eventName: string,
  preferenceKey: EmailPreferenceKey,
  eventData: Record<string, any>,
  orgId: string,
): Promise<number> {
  const emails = await getEligibleOrgMemberEmails(c, orgId, preferenceKey)

  if (emails.length === 0) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'sendEmailToOrgMembers: no eligible recipients',
      eventName,
      preferenceKey,
      orgId,
    })
    return 0
  }

  let successCount = 0

  for (const email of emails) {
    const result = await trackBentoEvent(c, email, eventData, eventName)
    if (result) {
      successCount++
    }
    else {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'sendEmailToOrgMembers: trackBentoEvent failed',
        eventName,
        email,
        orgId,
      })
    }
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'sendEmailToOrgMembers: completed',
    eventName,
    preferenceKey,
    orgId,
    totalRecipients: emails.length,
    successCount,
  })

  return successCount
}

/**
 * Send an email notification to org members with rate limiting via notifications table.
 * Uses the same cron-based throttling as sendNotifOrg but sends to all eligible members.
 *
 * @param c - Hono context
 * @param eventName - The Bento event name
 * @param preferenceKey - The key in email_preferences JSONB column
 * @param eventData - Metadata to include in the email event
 * @param orgId - The organization ID
 * @param uniqId - Unique identifier for this notification instance (for deduplication)
 * @param cron - Cron expression for rate limiting (e.g., '0 0 * * 1' for weekly)
 * @returns true if emails were sent, false if throttled or no recipients
 */
export async function sendNotifToOrgMembers(
  c: Context,
  eventName: string,
  preferenceKey: EmailPreferenceKey,
  eventData: Record<string, any>,
  orgId: string,
  uniqId: string,
  cron: string,
): Promise<boolean> {
  // Import dynamically to avoid circular dependency
  const { sendNotifOrg } = await import('./notifications.ts')

  // First check if we should send based on cron/throttling
  // We use sendNotifOrg's internal logic by passing a dummy check
  // But we need to intercept and handle multiple recipients

  // Get the org's management email for the notification table check
  const { data: org, error: orgError } = await supabaseAdmin(c)
    .from('orgs')
    .select('management_email')
    .eq('id', orgId)
    .single()

  if (!org || orgError) {
    cloudlog({ requestId: c.get('requestId'), message: 'sendNotifToOrgMembers: org not found', orgId })
    return false
  }

  // Use sendNotifOrg to handle the notification table logic (throttling/deduplication)
  // It will send to the org's management_email, but we also need to send to other eligible members
  const orgEmailSent = await sendNotifOrg(c, eventName, eventData, orgId, uniqId, cron)

  if (!orgEmailSent) {
    // Notification was throttled or already sent
    return false
  }

  // Now send to additional eligible members (excluding org management email since sendNotifOrg handled it)
  const emails = await getEligibleOrgMemberEmails(c, orgId, preferenceKey)
  const additionalEmails = emails.filter(email => email !== org.management_email)

  for (const email of additionalEmails) {
    await trackBentoEvent(c, email, eventData, eventName)
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'sendNotifToOrgMembers: completed',
    eventName,
    preferenceKey,
    orgId,
    orgEmail: org.management_email,
    additionalRecipients: additionalEmails.length,
  })

  return true
}
