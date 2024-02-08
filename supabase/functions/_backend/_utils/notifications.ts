import { parseCronExpression } from 'cron-schedule'

import type { Context } from 'hono'
import dayjs from 'dayjs'
import { supabaseAdmin } from './supabase.ts'
import type { Database } from './supabase.types.ts'
import { trackEvent } from './plunk.ts'

interface EventData {
  [key: string]: any
}

async function sendNow(c: Context, eventName: string, eventData: EventData, email: string, userId: string, color: string, past: Database['public']['Tables']['notifications']['Row'] | null) {
  console.log('send notif', eventName, email, color)
  await trackEvent(c, email, eventData, eventName)
  if (past != null) {
    const { error } = await supabaseAdmin(c)
      .from('notifications')
      .update({
        user_id: userId,
        last_send_at: dayjs().toISOString(),
        total_send: past.total_send + 1,
      })
      .eq('id', `${eventName}__${userId}`)
      .eq('user_id', userId)
    if (error)
      console.log('update notif', error)
  }
  else {
    const { error } = await supabaseAdmin(c)
      .from('notifications')
      .insert({
        id: `${eventName}__${userId}`,
        user_id: userId,
        last_send_at: dayjs().toISOString(),
      })
    if (error)
      console.log('insert notif', error)
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

export async function sendNotif(c: Context, eventName: string, eventData: EventData, userId: string, cron: string, color: string) {
  const { data: user } = await supabaseAdmin(c)
    .from('users')
    .select()
    .eq('id', userId)
    .single()

  if (!user) {
    console.log('user not found', userId)
    return Promise.resolve(false)
  }
  // check if notif has already been send in notifications table
  const { data: notif } = await supabaseAdmin(c)
    .from('notifications')
    .select()
    .eq('user_id', userId)
    .eq('id', `${eventName}__${userId}`)
    .single()
  // set user data in crisp
  if (!notif) {
    console.log('notif never sent', eventName, userId)
    return sendNow(c, eventName, eventData, user.email, userId, color, null).then(() => true)
  }

  if (notif && !isSendable(notif.last_send_at, cron)) {
    console.log('notif already sent', eventName, userId)
    return Promise.resolve(false)
  }
  console.log('notif ready to sent', eventName, userId)
  return sendNow(c, eventName, eventData, user.email, userId, color, notif).then(() => true)
}
// dayjs substract one week
// const last_send_at = dayjs().subtract(1, 'week').toISOString()
// console.log(isSendable(last_send_at, '0 0 1 * *'))
