import { parseCronExpression } from 'cron-schedule'
import type { Context } from '@hono/hono'
import dayjs from 'dayjs'
import { supabaseAdmin } from './supabase.ts'

export async function sendNow(c: Context, eventName: string, email: string, orgId: string, uniqId: string) {
  console.log('send notif', eventName, email)

  const { error } = await supabaseAdmin(c)
    .rpc('upsert_notification', {
      p_event: eventName,
      p_uniq_id: uniqId,
      p_owner_org: orgId,
    })

  if (error) {
    console.error('Error upserting notification:', error)
  }
}

function isSendable(last: string, cron: string) {
  const interval = parseCronExpression(cron)
  const last_send_at = new Date(last)
  const now = new Date()
  const nextDate = interval.getNextDate(last_send_at)
  const sendable = dayjs(now).isAfter(nextDate)
  console.log(`
  cron ${cron}
  last_send_at ${last_send_at}
  nextDate ${nextDate}
  now ${now}
  sendable ${sendable}
`)

  return sendable
  // return false
}

export async function canSendNotifOrg(c: Context, eventName: string, orgId: string, uniqId: string, cron: string) {
  // check if notif has already been send in notifications table
  const { data: notif } = await supabaseAdmin(c)
    .from('notifications')
    .select()
    .eq('owner_org', orgId)
    .eq('event', eventName)
    .eq('uniq_id', uniqId)
    .single()
  // set user data in crisp
  if (!notif) {
    return true
  }

  if (notif && !isSendable(notif.last_send_at, cron)) {
    return false
  }
  return true
}

// dayjs substract one week
// const last_send_at = dayjs().subtract(1, 'week').toISOString()
// console.log(isSendable(last_send_at, '0 0 1 * *'))
