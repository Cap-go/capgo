import type { Context } from 'hono'

import type { Database } from './supabase.types.ts'
import { parseCronExpression } from 'cron-schedule'
import dayjs from 'dayjs'
import { trackBentoEvent } from './bento.ts'
import { cloudlog, cloudlogErr } from './loggin.ts'
import { supabaseAdmin } from './supabase.ts'

interface EventData {
  [key: string]: any
}

async function sendNow(c: Context, eventName: string, eventData: EventData, email: string, orgId: string, uniqId: string, past: Database['public']['Tables']['notifications']['Row'] | null) {
  cloudlog({ requestId: c.get('requestId'), message: 'send notif', eventName, email })
  const res = await trackBentoEvent(c, email, eventData, eventName)
  if (!res) {
    cloudlog({ requestId: c.get('requestId'), message: 'trackEvent failed', eventName, email, eventData })
    return false
  }
  if (past != null) {
    const { error } = await supabaseAdmin(c)
      .from('notifications')
      .update({
        last_send_at: dayjs().toISOString(),
        total_send: past.total_send + 1,
      })
      .eq('event', eventName)
      .eq('uniq_id', uniqId)
      .eq('owner_org', orgId)
    if (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'update notif', error })
      return false
    }
  }
  else {
    const { error } = await supabaseAdmin(c)
      .from('notifications')
      .insert({
        event: eventName,
        uniq_id: uniqId,
        owner_org: orgId,
        last_send_at: dayjs().toISOString(),
      })
    if (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'insert notif', error })
      return false
    }
  }
  cloudlog({ requestId: c.get('requestId'), message: 'send notif done', eventName, email })
  return true
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
  const { data: org, error: orgError } = await supabaseAdmin(c)
    .from('orgs')
    .select()
    .eq('id', orgId)
    .single()

  if (!org || orgError) {
    cloudlog({ requestId: c.get('requestId'), message: 'org not found', orgId })
    return false
  }
  // check if notif has already been send in notifications table
  const { data: notif } = await supabaseAdmin(c)
    .from('notifications')
    .select()
    .eq('owner_org', org.id)
    .eq('event', eventName)
    .eq('uniq_id', uniqId)
    .single()
  // set user data in crisp
  if (!notif) {
    cloudlog({ requestId: c.get('requestId'), message: 'notif never sent', event: eventName, uniqId })
    return sendNow(c, eventName, eventData, org.management_email, orgId, uniqId, null).then(() => true)
  }

  if (notif && !isSendable(c, notif.last_send_at, cron)) {
    cloudlog({ requestId: c.get('requestId'), message: 'notif already sent', event: eventName, orgId })
    return false
  }
  cloudlog({ requestId: c.get('requestId'), message: 'notif ready to sent', event: eventName, orgId })
  return sendNow(c, eventName, eventData, org.management_email, orgId, uniqId, notif).then(() => true)
}

// dayjs substract one week
// const last_send_at = dayjs().subtract(1, 'week').toISOString()
// cloudlog(c.get('requestId'), 'isSendable', isSendable(last_send_at, '0 0 1 * *'))
