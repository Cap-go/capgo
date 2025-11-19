import type { Context } from 'hono'
import { parseCronExpression } from 'cron-schedule'
import dayjs from 'dayjs'
import { trackBentoEvent } from './bento.ts'
import { cloudlog } from './logging.ts'
import { supabaseAdmin } from './supabase.ts'

interface EventData {
  [key: string]: any
}

function isSendable(c: Context, last: string, cron: string) {
  const interval = parseCronExpression(cron)
  const last_send_at = new Date(last)
  const now = new Date()
  const nextDate = interval.getNextDate(last_send_at)
  const sendable = dayjs(now).isAfter(nextDate)
  cloudlog({ requestId: c.get('requestId'), message: 'isSendable', cron, last_send_at, nextDate, now, sendable })

  return sendable
  // return false
}

export async function sendNotifOrg(c: Context, eventName: string, eventData: EventData, orgId: string, uniqId: string, cron: string) {
  // Get org info
  const { data: org, error: orgError } = await supabaseAdmin(c)
    .from('orgs')
    .select()
    .eq('id', orgId)
    .single()

  if (!org || orgError) {
    cloudlog({ requestId: c.get('requestId'), message: 'org not found', orgId })
    return false
  }

  // Check if notification has already been sent
  const { data: notif } = await supabaseAdmin(c)
    .from('notifications')
    .select()
    .eq('owner_org', org.id)
    .eq('event', eventName)
    .eq('uniq_id', uniqId)
    .single()

  let shouldSend = false
  let isFirstSend = false

  if (!notif) {
    // First time: use upsert with ignoreDuplicates to avoid error logs
    isFirstSend = true

    const { data: inserted, error } = await supabaseAdmin(c)
      .from('notifications')
      .upsert({
        event: eventName,
        uniq_id: uniqId,
        owner_org: orgId,
        last_send_at: dayjs().toISOString(),
        total_send: 1,
      }, {
        onConflict: 'owner_org,event,uniq_id',
        ignoreDuplicates: true, // Don't return error on conflict, just ignore
      })
      .select()

    // Only send if we successfully inserted (won the race)
    // If conflict occurred, inserted will be null
    shouldSend = !error && !!inserted && inserted.length > 0
    if (!shouldSend) {
      cloudlog({ requestId: c.get('requestId'), message: 'notif insert race lost', event: eventName, orgId })
      return false
    }
  }
  else {
    // Notification exists, check if sendable
    if (!isSendable(c, notif.last_send_at, cron)) {
      cloudlog({ requestId: c.get('requestId'), message: 'notif already sent', event: eventName, orgId })
      return false
    }

    // Atomically update ONLY if timestamp hasn't changed (optimistic locking to prevent race)
    const { data: updated, error } = await supabaseAdmin(c)
      .from('notifications')
      .update({
        last_send_at: dayjs().toISOString(),
        total_send: notif.total_send + 1,
      })
      .eq('event', eventName)
      .eq('uniq_id', uniqId)
      .eq('owner_org', orgId)
      .eq('last_send_at', notif.last_send_at) // Optimistic lock: only update if timestamp unchanged
      .select()

    // Only send if we successfully claimed it (update succeeded)
    shouldSend = !error && updated && updated.length > 0
    if (!shouldSend) {
      cloudlog({ requestId: c.get('requestId'), message: 'notif update race lost', event: eventName, orgId })
      return false
    }
  }

  // Only send if we successfully claimed the notification
  if (shouldSend) {
    cloudlog({ requestId: c.get('requestId'), message: isFirstSend ? 'notif never sent' : 'notif ready to sent', event: eventName, uniqId })
    const res = await trackBentoEvent(c, org.management_email, eventData, eventName)
    if (!res) {
      cloudlog({ requestId: c.get('requestId'), message: 'trackEvent failed', eventName, email: org.management_email, eventData })
      // Note: We already claimed it in DB, but email failed. On next attempt, cron will determine if we retry.
      return false
    }

    cloudlog({ requestId: c.get('requestId'), message: 'send notif done', eventName, email: org.management_email })
    return true
  }

  return false
}

// dayjs subtract one week
// const last_send_at = dayjs().subtract(1, 'week').toISOString()
// cloudlog(c.get('requestId'), 'isSendable', isSendable(last_send_at, '0 0 1 * *'))
