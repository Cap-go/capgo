import type { Context } from 'hono'
import { parseCronExpression } from 'cron-schedule'
import dayjs from 'dayjs'
import { trackBentoEvent } from './bento.ts'
import { CacheHelper } from './cache.ts'
import { cloudlog } from './logging.ts'
import { supabaseAdmin } from './supabase.ts'
import { backgroundTask } from './utils.ts'

interface EventData {
  [key: string]: any
}

const NOTIF_CACHE_PATH = '/.notif-sendable'

interface NotifCachePayload {
  sendable: boolean
}

function buildNotifCacheRequest(c: Context, orgId: string, eventName: string, uniqId: string) {
  const helper = new CacheHelper(c)
  if (!helper.available)
    return null
  return {
    helper,
    request: helper.buildRequest(NOTIF_CACHE_PATH, { org_id: orgId, event: eventName, uniq_id: uniqId }),
  }
}

async function getNotifCacheStatus(c: Context, orgId: string, eventName: string, uniqId: string): Promise<boolean | null> {
  const cacheEntry = buildNotifCacheRequest(c, orgId, eventName, uniqId)
  if (!cacheEntry)
    return null
  const payload = await cacheEntry.helper.matchJson<NotifCachePayload>(cacheEntry.request)
  if (!payload)
    return null
  return payload.sendable
}

function setNotifCacheStatus(c: Context, orgId: string, eventName: string, uniqId: string, sendable: boolean, ttlSeconds: number) {
  return backgroundTask(c, async () => {
    const cacheEntry = buildNotifCacheRequest(c, orgId, eventName, uniqId)
    if (!cacheEntry)
      return
    await cacheEntry.helper.putJson(cacheEntry.request, { sendable }, ttlSeconds)
  })
}

/**
 * Calculate seconds until the next cron window opens based on last send time.
 */
function getSecondsUntilNextCronWindow(lastSendAt: string, cron: string): number {
  const interval = parseCronExpression(cron)
  const lastSendDate = new Date(lastSendAt)
  const now = new Date()
  const nextDate = interval.getNextDate(lastSendDate)
  const diffMs = nextDate.getTime() - now.getTime()
  // Return at least 1 second, and cap at reasonable max (1 week)
  return Math.max(1, Math.min(Math.ceil(diffMs / 1000), 604800))
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

export async function sendNotifOrg(c: Context, eventName: string, eventData: EventData, orgId: string, uniqId: string, cron: string, managementEmail: string) {
  // Check if notification has already been sent
  const { data: notif } = await supabaseAdmin(c)
    .from('notifications')
    .select()
    .eq('owner_org', orgId)
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
      return { sent: false, lastSendAt: notif.last_send_at }
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
    const res = await trackBentoEvent(c, managementEmail, eventData, eventName)
    if (!res) {
      cloudlog({ requestId: c.get('requestId'), message: 'trackEvent failed', eventName, email: managementEmail, eventData })
      // Note: We already claimed it in DB, but email failed. On next attempt, cron will determine if we retry.
      return false
    }

    cloudlog({ requestId: c.get('requestId'), message: 'send notif done', eventName, email: managementEmail })
    return true
  }

  return false
}

// dayjs subtract one week
// const last_send_at = dayjs().subtract(1, 'week').toISOString()
// cloudlog(c.get('requestId'), 'isSendable', isSendable(last_send_at, '0 0 1 * *'))

/**
 * Cached version of sendNotifOrg that checks cache before querying the database.
 * If a notification was recently checked and found to be "not sendable", the cached
 * result is returned immediately without hitting the database.
 *
 * The cache TTL is calculated based on the cron schedule and last send time,
 * so the cache expires exactly when the notification becomes sendable again.
 */
export async function sendNotifOrgCached(c: Context, eventName: string, eventData: EventData, orgId: string, uniqId: string, cron: string, managementEmail: string): Promise<boolean> {
  // Check cache first - if we recently checked and it wasn't sendable, skip DB query
  const cachedSendable = await getNotifCacheStatus(c, orgId, eventName, uniqId)
  if (cachedSendable === false) {
    cloudlog({ requestId: c.get('requestId'), message: 'notif cache hit - not sendable', event: eventName, orgId, uniqId })
    return false
  }

  // Cache miss, call the actual function
  const result = await sendNotifOrg(c, eventName, eventData, orgId, uniqId, cron, managementEmail)

  // Handle the "not sendable" case with lastSendAt for proper TTL calculation
  if (typeof result === 'object' && result.sent === false && result.lastSendAt) {
    const ttlSeconds = getSecondsUntilNextCronWindow(result.lastSendAt, cron)
    cloudlog({ requestId: c.get('requestId'), message: 'notif caching not sendable', event: eventName, orgId, ttlSeconds })
    setNotifCacheStatus(c, orgId, eventName, uniqId, false, ttlSeconds)
    return false
  }

  // For other cases (true/false), just return the boolean result
  // No need to cache "sent=true" as next check should query DB anyway
  return result === true
}
