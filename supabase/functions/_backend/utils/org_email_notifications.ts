import type { Context } from 'hono'
import { trackBentoEvent } from './bento.ts'
import { cloudlog } from './logging.ts'
import { sendNotifOrg } from './notifications.ts'
import { supabaseAdmin } from './supabase.ts'
import { backgroundTask } from './utils.ts'

/**
 * Email preference keys that map to the JSONB email_preferences column in both users and orgs tables.
 * These control which types of emails a user/org wants to receive.
 */
export type EmailPreferenceKey
  = | 'usage_limit'
    | 'credit_usage'
    | 'onboarding'
    | 'weekly_stats'
    | 'monthly_stats'
    | 'billing_period_stats'
    | 'deploy_stats_24h'
    | 'bundle_created'
    | 'bundle_deployed'
    | 'device_error'
    | 'channel_self_rejected'
    | 'daily_fail_ratio'

export interface EmailPreferences {
  usage_limit?: boolean
  credit_usage?: boolean
  onboarding?: boolean
  weekly_stats?: boolean
  monthly_stats?: boolean
  billing_period_stats?: boolean
  deploy_stats_24h?: boolean
  bundle_created?: boolean
  bundle_deployed?: boolean
  device_error?: boolean
  channel_self_rejected?: boolean
  daily_fail_ratio?: boolean
}

interface OrgWithPreferences {
  management_email: string
  email_preferences?: EmailPreferences | null
}

/**
 * Get org info including management_email and email_preferences
 */
async function getOrgInfo(c: Context, orgId: string): Promise<OrgWithPreferences | null> {
  const { data: org, error } = await supabaseAdmin(c)
    .from('orgs')
    .select('management_email, email_preferences')
    .eq('id', orgId)
    .single()

  if (error || !org) {
    cloudlog({ requestId: c.get('requestId'), message: 'getOrgInfo error', orgId, error })
    return null
  }

  // email_preferences may not be in generated types yet
  const orgWithPrefs = org as OrgWithPreferences
  orgWithPrefs.email_preferences = ((org as any).email_preferences as EmailPreferences | null) ?? {}

  return orgWithPrefs
}

/**
 * Check if org has the specified email preference enabled
 */
function isOrgPreferenceEnabled(org: OrgWithPreferences, preferenceKey: EmailPreferenceKey): boolean {
  const prefs = org.email_preferences ?? {}
  const prefValue = prefs[preferenceKey]
  return prefValue === undefined ? true : prefValue
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
    .select('id, email, email_preferences')
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
 * Get all eligible emails for org notifications, including management_email if:
 * 1. It's different from any admin user's email
 * 2. The org's email preference for this notification type is enabled
 */
async function getAllEligibleEmails(
  c: Context,
  orgId: string,
  preferenceKey: EmailPreferenceKey,
): Promise<{ adminEmails: string[], managementEmail: string | null }> {
  // Get org info
  const org = await getOrgInfo(c, orgId)
  if (!org) {
    return { adminEmails: [], managementEmail: null }
  }

  // Get eligible admin emails
  const adminEmails = await getEligibleOrgMemberEmails(c, orgId, preferenceKey)

  // Check if management_email should receive the notification:
  // 1. Must be different from all admin emails
  // 2. Org must have the preference enabled
  let managementEmail: string | null = null

  if (org.management_email) {
    const isDifferentFromAdmins = !adminEmails.includes(org.management_email)
    const isOrgPrefEnabled = isOrgPreferenceEnabled(org, preferenceKey)

    if (isDifferentFromAdmins && isOrgPrefEnabled) {
      managementEmail = org.management_email
    }
  }

  return { adminEmails, managementEmail }
}

/**
 * Send an email notification to all eligible org members (admin/super_admin with preference enabled).
 * Also sends to management_email if it's different from admin emails and org preference is enabled.
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
  const { adminEmails, managementEmail } = await getAllEligibleEmails(c, orgId, preferenceKey)

  // Combine all emails (admin emails + management email if applicable)
  const allEmails = [...adminEmails]
  if (managementEmail) {
    allEmails.push(managementEmail)
  }

  if (allEmails.length === 0) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'sendEmailToOrgMembers: no eligible recipients',
      eventName,
      preferenceKey,
      orgId,
    })
    return 0
  }

  // Send emails in background - don't await
  for (const email of allEmails) {
    backgroundTask(c, trackBentoEvent(c, email, eventData, eventName))
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'sendEmailToOrgMembers: queued',
    eventName,
    preferenceKey,
    orgId,
    totalRecipients: allEmails.length,
    adminRecipients: adminEmails.length,
    managementEmailIncluded: !!managementEmail,
  })

  return allEmails.length
}

/**
 * Send an email notification to org members with rate limiting via notifications table.
 * Uses the same cron-based throttling as sendNotifOrg but sends to all eligible members.
 * Also sends to management_email if it's different from admin emails and org preference is enabled.
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
  // Get the org's info including management email
  const org = await getOrgInfo(c, orgId)
  if (!org) {
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

  // Get all eligible emails
  const { adminEmails, managementEmail } = await getAllEligibleEmails(c, orgId, preferenceKey)

  // sendNotifOrg already sent to management_email, so filter it out from admin emails
  // to avoid duplicate sends
  const additionalEmails = adminEmails.filter(email => email !== org.management_email)

  // If management_email is eligible (different from admins and org pref enabled)
  // and wasn't in the admin list, it was already sent by sendNotifOrg, so we're good
  // We just need to send to the additional admin emails in background

  for (const email of additionalEmails) {
    backgroundTask(c, trackBentoEvent(c, email, eventData, eventName))
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'sendNotifToOrgMembers: queued',
    eventName,
    preferenceKey,
    orgId,
    orgEmail: org.management_email,
    additionalRecipients: additionalEmails.length,
    managementEmailIncluded: !!managementEmail,
  })

  return true
}
