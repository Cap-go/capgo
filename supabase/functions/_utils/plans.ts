import { logsnag } from '../_utils/_logsnag.ts'
import { addEventPerson } from './crisp.ts'
import { sendNotif } from './notifications.ts'
import { getCurrentPlanName, isGoodPlan, isTrial, supabaseAdmin } from './supabase.ts'
import type { definitions } from './types_supabase.ts'

export interface StatsV2 {
  mau: number
  storage: number
  bandwidth: number
}

const planToInt = (plan: string) => {
  switch (plan) {
    case 'Free':
      return 0
    case 'Solo':
      return 1
    case 'Maker':
      return 2
    case 'Team':
      return 3
    case 'Pay as you go':
      return 4
    default:
      return 0
  }
}

export const findBestPlan = async (stats: StatsV2): Promise<string> => {
  const storage = Math.round((stats.storage || 0) / 1024 / 1024 / 1024)
  const bandwidth = Math.round((stats.bandwidth || 0) / 1024 / 1024 / 1024)
  const { data, error } = await supabaseAdmin()
    .rpc<string>('find_best_plan_v2', {
      mau: stats.mau || 0,
      storage,
      bandwidth,
    })
    .single()
  if (error)
    throw error

  return data || 'Team'
}

export const getMaxstats = async (userId: string, dateId: string): Promise<StatsV2> => {
  const { data, error } = await supabaseAdmin()
    .rpc<StatsV2>('get_total_stats', { userid: userId, dateid: dateId })
    .single()
  if (error)
    throw error

  return data || {
    mau: 0,
    storage: 0,
    bandwidth: 0,
  }
}

export const checkPlan = async (userId: string): Promise<void> => {
  try {
    const { data: user, error: userError } = await supabaseAdmin()
      .from('users')
      .select()
      .eq('id', userId)
      .single()
    if (userError)
      throw userError
    if (await isTrial(userId)) {
      await supabaseAdmin()
        .from('stripe_info')
        .update({ is_good_plan: true })
        .eq('customer_id', user.customer_id)
        .then()
      return Promise.resolve()
    }
    const is_good_plan = await isGoodPlan(userId)
    if (!is_good_plan) {
      console.log('is_good_plan_v2', userId, is_good_plan)
      // create dateid var with yyyy-mm with dayjs
      const dateid = new Date().toISOString().slice(0, 7)
      const get_max_stats = await getMaxstats(userId, dateid)
      const current_plan = await getCurrentPlanName(userId)
      if (get_max_stats) {
        const best_plan = await findBestPlan(get_max_stats)
        const bestPlanKey = best_plan.toLowerCase().replace(' ', '_')
        // TODO create a rpc method to calculate % of plan usage.
        // TODO send email for 50%, 70%, 90% of current plan usage.
        // TODO Allow upgrade email to be send again every 30 days
        // TODO send to logsnag maker opportunity by been in crisp

        if (best_plan === 'Free' && current_plan === 'Free') {
          await addEventPerson(user.email, {}, 'user:need_more_time', 'blue')
          console.log('best_plan is free', userId)
          await logsnag.publish({
            channel: 'usage',
            event: 'User need more time',
            icon: '⏰',
            tags: {
              'user-id': userId,
            },
            notify: false,
          }).catch()
        }
        else if (planToInt(best_plan) > planToInt(current_plan)) {
          await sendNotif(`user:upgrade_to_${bestPlanKey}`, userId, '* * * * *', 'red')
          // await addEventPerson(user.email, {}, `user:upgrade_to_${bestPlanKey}`, 'red')
          console.log(`user:upgrade_to_${bestPlanKey}`, userId)
          await logsnag.publish({
            channel: 'usage',
            event: `User need upgrade to ${bestPlanKey}`,
            icon: '⚠️',
            tags: {
              'user-id': userId,
            },
            notify: false,
          }).catch()
        }
      }
    }
    return supabaseAdmin()
      .from('stripe_info')
      .update({ is_good_plan: !!is_good_plan })
      .eq('customer_id', user.customer_id)
      .then()
  }
  catch (e) {
    console.log('Error checkPlan', e)
    return Promise.resolve()
  }
}
