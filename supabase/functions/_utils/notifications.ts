import { parseCronExpression } from 'https://cdn.skypack.dev/cron-schedule@3.0.6?dts'
import dayjs from 'https://cdn.skypack.dev/dayjs@1.11.6?dts'
import { addEventPerson } from './crisp.ts'
import { supabaseAdmin } from './supabase.ts'

const sendNow = async (eventName: string, email: string, userId: string, color: string) => {
  console.log('send notif', eventName, email)
  await addEventPerson(email, {}, eventName, color)
  await supabaseAdmin()
    .from('notifications')
    .insert({
      id: eventName,
      user_id: userId,
      last_send_at: dayjs().toISOString(),
    })
}

const isSendable = (last: string, cron: string) => {
  const interval = parseCronExpression(cron)
  const last_send_at = new Date(last)
  const now = new Date()
  const nextDate = interval.getNextDate(last_send_at)
  console.log(`
  cron ${cron}
  last_send_at ${last_send_at}
  nextDate ${nextDate}
  now ${now}
`)

  return (dayjs(now).isAfter(nextDate))
}

export const sendNotif = async (eventName: string, userId: string, cron: string, color: string) => {
  const { data: user } = await supabaseAdmin()
    .from('users')
    .select()
    .eq('id', userId)
    .single()

  if (!user) {
    console.log('user not found', userId)
    return Promise.resolve()
  }
  if (!user.enableNotifications) {
    console.log('user disables notif', userId)
    return Promise.resolve()
  }
  // check if notif has already been send in notifications table
  const { data: notif } = await supabaseAdmin()
    .from('notifications')
    .select()
    .eq('user_id', userId)
    .eq('id', eventName)
    .single()
  if (!notif)
    return sendNow(eventName, user.email, userId, color)

  if (notif && !isSendable(notif.last_send_at, cron)) {
    console.log('notif already sent', eventName, userId)
    return Promise.resolve()
  }
  return sendNow(eventName, user.email, userId, color)
}
// dayjs substract one week
// const last_send_at = dayjs().subtract(1, 'week').toISOString()
// console.log(isSendable(last_send_at, '0 1 * * 0'))
