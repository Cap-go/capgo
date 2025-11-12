import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import { addTagBento } from './bento.ts'
import { cloudlog } from './logging.ts'

const NOTIFICATION_TAG = 'notifications_opt_in'
const NEWSLETTER_TAG = 'newsletter_opt_in'
const ALL_TAGS = [NOTIFICATION_TAG, NEWSLETTER_TAG]

type UserPreferenceRecord = Database['public']['Tables']['users']['Row']

function buildPreferenceSegments(record: UserPreferenceRecord | null | undefined) {
  const segments: string[] = []
  const deleteSegments: string[] = []

  if (record?.enable_notifications) {
    segments.push(NOTIFICATION_TAG)
  }
  else {
    deleteSegments.push(NOTIFICATION_TAG)
  }

  if (record?.opt_for_newsletters) {
    segments.push(NEWSLETTER_TAG)
  }
  else {
    deleteSegments.push(NEWSLETTER_TAG)
  }

  return { segments, deleteSegments }
}

export async function syncUserPreferenceTags(
  c: Context,
  email: string | null | undefined,
  record: UserPreferenceRecord | null | undefined,
  previousEmail?: string | null,
) {
  try {
    if (previousEmail && previousEmail !== email) {
      await addTagBento(c, previousEmail, { segments: [], deleteSegments: ALL_TAGS })
    }

    if (!email)
      return

    const segments = buildPreferenceSegments(record)
    await addTagBento(c, email, segments)
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'syncUserPreferenceTags error', error })
  }
}

export const preferenceTags = {
  notification: NOTIFICATION_TAG,
  newsletter: NEWSLETTER_TAG,
}
