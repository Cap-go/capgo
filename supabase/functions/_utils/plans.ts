import { logsnag } from './logsnag.ts'
import { sendNotif } from './notifications.ts'
import {
  getCurrentPlanName, getPlanUsagePercent,
  isFreeUsage, isGoodPlan, isOnboarded, isOnboardingNeeded, isTrial, supabaseAdmin,
} from './supabase.ts'
import type { Database } from './supabase.types.ts'
import { recordUsage, setTreshold } from './stripe.ts'
import { trackEvent } from './plunk.ts'

function planToInt(plan: string) {
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

export async function findBestPlan(stats: Database['public']['Functions']['find_best_plan_v3']['Args']): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .rpc('find_best_plan_v3', {
      mau: stats.mau || 0,
      bandwidth: stats.bandwidth,
      storage: stats.storage,
    })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || 'Team'
}

export async function getTotalStats(userId: string): Promise<Database['public']['Functions']['get_total_stats_v3']['Returns'][0]> {
  const { data, error } = await supabaseAdmin()
    .rpc('get_total_stats_v3', { userid: userId })
    .single()

  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || {
    mau: 0,
    storage: 0,
    bandwidth: 0,
  }
}

export async function getMeterdUsage(userId: string): Promise<Database['public']['Functions']['get_max_plan']['Returns'][0]> {
  const { data, error } = await supabaseAdmin()
    .rpc('get_metered_usage', { userid: userId })
    .single()

  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data as Database['public']['Functions']['get_max_plan']['Returns'][0] || {
    mau: 0,
    storage: 0,
    bandwidth: 0,
  }
}
interface Prices {
  mau: string
  storage: string
  bandwidth: string
}

async function setMetered(customer_id: string | null, userId: string) {
  if (customer_id === null)
    return Promise.resolve()
  console.log('setMetered', customer_id, userId)
  // return await Promise.resolve({} as Prices)
  const { data } = await supabaseAdmin()
    .from('stripe_info')
    .select()
    .eq('customer_id', customer_id)
    .single()
  if (data && data.subscription_metered) {
    try {
      await setTreshold(customer_id)
    }
    catch (error) {
      console.log('error setTreshold', error)
    }
    const prices = data.subscription_metered as any as Prices
    const get_metered_usage = await getMeterdUsage(userId)
    if (get_metered_usage.mau > 0 && prices.mau)
      await recordUsage(prices.mau, get_metered_usage.mau)
    if (get_metered_usage.storage > 0)
      await recordUsage(prices.storage, get_metered_usage.storage)
    if (get_metered_usage.bandwidth > 0)
      await recordUsage(prices.bandwidth, get_metered_usage.bandwidth)
  }
}

export async function checkPlan(userId: string): Promise<void> {
  try {
    const { data: user, error: userError } = await supabaseAdmin()
      .from('users')
      .select()
      .eq('id', userId)
      .single()
    if (userError)
      throw userError
    if (await isTrial(userId)) {
      const { error } = await supabaseAdmin()
        .from('stripe_info')
        .update({ is_good_plan: true })
        .eq('customer_id', user.customer_id)
        .then()
      if (error)
        console.error('error.message', error.message)
      return Promise.resolve()
    }
    const is_good_plan = await isGoodPlan(userId)
    const is_onboarded = await isOnboarded(userId)
    const is_onboarding_needed = await isOnboardingNeeded(userId)
    const is_free_usage = await isFreeUsage(userId)
    const percentUsage = await getPlanUsagePercent(userId)
    if (!is_good_plan && is_onboarded && !is_free_usage) {
      console.log('is_good_plan_v4', userId, is_good_plan)
      // create dateid var with yyyy-mm with dayjs
      const get_total_stats = await getTotalStats(userId)
      const current_plan = await getCurrentPlanName(userId)
      if (get_total_stats) {
        const best_plan = await findBestPlan(get_total_stats)
        const bestPlanKey = best_plan.toLowerCase().replace(' ', '_')
        await
        await setMetered(user.customer_id, userId)
        if (best_plan === 'Free' && current_plan === 'Free') {
          await trackEvent(user.email, {}, 'user:need_more_time')
          console.log('best_plan is free', userId)
          await logsnag.track({
            channel: 'usage',
            event: 'User need more time',
            icon: '⏰',
            user_id: userId,
            notify: false,
          }).catch()
        }
        else if (planToInt(best_plan) > planToInt(current_plan)) {
          const sent = await sendNotif(`user:upgrade_to_${bestPlanKey}`, { current_best_plan: bestPlanKey }, userId, '0 0 * * 1', 'red')
          if (sent) {
          // await addEventPerson(user.email, {}, `user:upgrade_to_${bestPlanKey}`, 'red')
            console.log(`user:upgrade_to_${bestPlanKey}`, userId)
            await logsnag.track({
              channel: 'usage',
              event: `User need upgrade to ${bestPlanKey}`,
              icon: '⚠️',
              user_id: userId,
              notify: false,
            }).catch()
          }
        }
      }
    }
    else if (!is_onboarded && is_onboarding_needed) {
      await trackEvent(user.email, {}, 'user:need_onboarding')
      await logsnag.track({
        channel: 'usage',
        event: 'User need onboarding',
        icon: '🥲',
        user_id: userId,
        notify: false,
      }).catch()
    }
    else if (is_good_plan && is_onboarded) {
      // check if user is at more than 90%, 50% or 70% of plan usage
      if (percentUsage >= 90) {
        // cron every month * * * * 1
        const sent = await sendNotif('user:90_percent_of_plan', { current_percent: percentUsage }, userId, '0 0 1 * *', 'red')
        if (sent) {
          // await addEventPerson(user.email, {}, 'user:90_percent_of_plan', 'red')
          await logsnag.track({
            channel: 'usage',
            event: 'User is at 90% of plan usage',
            icon: '⚠️',
            user_id: userId,
            notify: false,
          }).catch()
        }
      }
      else if (percentUsage >= 70) {
        // cron every month * * * * 1
        const sent = await sendNotif('user:70_percent_of_plan', { current_percent: percentUsage }, userId, '0 0 1 * *', 'orange')
        if (sent) {
          // await addEventPerson(user.email, {}, 'user:70_percent_of_plan', 'orange')
          await logsnag.track({
            channel: 'usage',
            event: 'User is at 70% of plan usage',
            icon: '⚠️',
            user_id: userId,
            notify: false,
          }).catch()
        }
      }
      else if (percentUsage >= 50) {
        const sent = await sendNotif('user:50_percent_of_plan', { current_percent: percentUsage }, userId, '0 0 1 * *', 'orange')
        if (sent) {
        // await addEventPerson(user.email, {}, 'user:70_percent_of_plan', 'orange')
          await logsnag.track({
            channel: 'usage',
            event: 'User is at 50% of plan usage',
            icon: '⚠️',
            user_id: userId,
            notify: false,
          }).catch()
        }
      }

      // and send email notification
    }
    return supabaseAdmin()
      .from('stripe_info')
      .update({
        is_good_plan: is_good_plan || is_free_usage,
        plan_usage: Math.round(percentUsage),
      })
      .eq('customer_id', user.customer_id)
      .then()
  }
  catch (e) {
    console.log('Error checkPlan', e)
    return Promise.resolve()
  }
}
