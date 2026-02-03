import type { Context } from 'hono'
import type { EmailPreferenceKey, EmailPreferences } from './org_email_notifications.ts'
import type { Database } from './supabase.types.ts'
import { syncBentoSubscriberTags } from './bento.ts'
import { cloudlog } from './logging.ts'

// Legacy tags for general notifications and newsletters
const NOTIFICATION_TAG = 'notifications_opt_in'
const NEWSLETTER_TAG = 'newsletter_opt_in'

// Email preference disabled tags - when a user opts OUT, we add these tags
// Bento automations should exclude users with these tags
const EMAIL_PREF_DISABLED_TAGS: Record<EmailPreferenceKey, string> = {
  usage_limit: 'usage_limit_disabled',
  credit_usage: 'credit_usage_disabled',
  onboarding: 'onboarding_disabled',
  weekly_stats: 'weekly_stats_disabled',
  monthly_stats: 'monthly_stats_disabled',
  billing_period_stats: 'billing_period_stats_disabled',
  deploy_stats_24h: 'deploy_stats_24h_disabled',
  bundle_created: 'bundle_created_disabled',
  bundle_deployed: 'bundle_deployed_disabled',
  device_error: 'device_error_disabled',
  channel_self_rejected: 'channel_self_rejected_disabled',
  daily_fail_ratio: 'daily_fail_ratio_disabled',
  cli_realtime_feed: 'cli_realtime_feed_disabled',
}

const ALL_LEGACY_TAGS = [NOTIFICATION_TAG, NEWSLETTER_TAG]
const ALL_EMAIL_PREF_DISABLED_TAGS = Object.values(EMAIL_PREF_DISABLED_TAGS)
const ALL_TAGS = [...ALL_LEGACY_TAGS, ...ALL_EMAIL_PREF_DISABLED_TAGS]

type UserPreferenceRecord = Database['public']['Tables']['users']['Row'] & {
  email_preferences?: EmailPreferences | null
}

function buildDesiredTags(record: UserPreferenceRecord | null | undefined) {
  const tags = new Set<string>()

  if (record?.enable_notifications)
    tags.add(NOTIFICATION_TAG)

  if (record?.opt_for_newsletters)
    tags.add(NEWSLETTER_TAG)

  const emailPrefs = record?.email_preferences ?? {}
  for (const [key, disabledTag] of Object.entries(EMAIL_PREF_DISABLED_TAGS)) {
    const prefKey = key as EmailPreferenceKey
    const isEnabled = emailPrefs[prefKey] ?? true
    if (!isEnabled)
      tags.add(disabledTag)
  }

  return tags
}

function buildTagDelta(currentTags: Set<string>, previousTags?: Set<string>) {
  if (!previousTags) {
    return {
      segments: [...currentTags],
      deleteSegments: ALL_TAGS.filter(tag => !currentTags.has(tag)),
    }
  }

  return {
    segments: [...currentTags].filter(tag => !previousTags.has(tag)),
    deleteSegments: [...previousTags].filter(tag => !currentTags.has(tag)),
  }
}

export async function syncUserPreferenceTags(
  c: Context,
  email: string | null | undefined,
  record: UserPreferenceRecord | null | undefined,
  previousRecord?: UserPreferenceRecord | null,
  previousEmail?: string | null,
) {
  try {
    if (previousEmail && previousEmail !== email) {
      await syncBentoSubscriberTags(c, { email: previousEmail, segments: [], deleteSegments: ALL_TAGS })
    }

    if (!email)
      return

    const currentTags = buildDesiredTags(record)
    const previousTags = previousEmail === email && previousRecord ? buildDesiredTags(previousRecord) : undefined
    const segments = buildTagDelta(currentTags, previousTags)
    if (segments.segments.length === 0 && segments.deleteSegments.length === 0)
      return
    await syncBentoSubscriberTags(c, { email, ...segments })
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'syncUserPreferenceTags error', error })
  }
}

export const preferenceTags = {
  notification: NOTIFICATION_TAG,
  newsletter: NEWSLETTER_TAG,
}

export const emailPreferenceDisabledTags = EMAIL_PREF_DISABLED_TAGS
