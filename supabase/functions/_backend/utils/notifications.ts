import { parseCronExpression } from 'cron-schedule'

import type { Context } from 'hono'
import dayjs from 'dayjs'
import { supabaseAdmin } from './supabase.ts'
import type { Database } from './supabase.types.ts'
import { trackEvent } from './plunk.ts'

interface EventData {
  [key: string]: any
}

async function sendNow(c: Context, eventName: string, eventData: EventData, email: string, orgId: string, color: string, past: Database['public']['Tables']['notifications']['Row'] | null) {
  console.log('send notif', eventName, email, color)
  const res = await trackEvent(c, email, eventData, eventName)
  if (!res) {
    console.log('trackEvent failed', eventName, email, eventData)
    return
  }
  if (past != null) {
    const { error } = await supabaseAdmin(c)
      .from('notifications')
      .update({
        orgId: orgId,
        last_send_at: dayjs().toISOString(),
        total_send: past.total_send + 1,
      })
      .eq('id', `${eventName}__${orgId}`)
      .eq('owner_org', orgId)
    if (error)
      console.log('update notif', error)
  }
  else {
    const { error } = await supabaseAdmin(c)
      .from('notifications')
      .insert({
        id: `${eventName}__${orgId}`,
        owner_org: orgId,
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

export async function sendNotifOrg(c: Context, eventName: string, eventData: EventData, orgId: string, cron: string, color: string) {
  const { data: org, error: orgError } = await supabaseAdmin(c)
    .from('orgs')
    .select()
    .eq('id', orgId)
    .single()

  if (!org || orgError) {
    console.log('org not found', orgId)
    return Promise.resolve(false)
  }
  // check if notif has already been send in notifications table
  const { data: notif } = await supabaseAdmin(c)
    .from('notifications')
    .select()
    .eq('owner_org', org.id)
    .eq('id', `${eventName}__${org.id}`)
    .single()
  // set user data in crisp
  if (!notif) {
    console.log('notif never sent', eventName, org.id)
    return sendNow(c, eventName, eventData, org.management_email, orgId, color, null).then(() => true)
  }

  if (notif && !isSendable(notif.last_send_at, cron)) {
    console.log('notif already sent', eventName, orgId)
    return Promise.resolve(false)
  }
  console.log('notif ready to sent', eventName, orgId)
  return sendNow(c, eventName, eventData, org.management_email, orgId, color, notif).then(() => true)
}

// dayjs substract one week
// const last_send_at = dayjs().subtract(1, 'week').toISOString()
// console.log(isSendable(last_send_at, '0 0 1 * *'))
