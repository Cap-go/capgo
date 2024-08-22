import type { Context } from '@hono/hono'
import {
  getCurrentPlanNameOrg,
  getPlanUsagePercent,
  getTotalStats,
  isGoodPlanOrg,
  isOnboardedOrg,
  isOnboardingNeeded,
  isTrialOrg,
  supabaseAdmin,
} from './supabase.ts'
import { sendNotifOrg } from './notifications.ts'
import type { Database } from './supabase.types.ts'
import { recordUsage, setThreshold } from './stripe.ts'
import { logsnag } from './logsnag.ts'
import { trackBentoEvent } from './bento.ts'

function planToInt(plan: string) {
  switch (plan) {
    case 'Solo':
      return 1
    case 'Maker':
      return 2
    case 'Team':
      return 3
    case 'Pay as you go':
      return 4
    default:
      return 1
  }
}

export async function findBestPlan(c: Context, stats: Database['public']['Functions']['find_best_plan_v3']['Args']): Promise<string> {
  const { data, error } = await supabaseAdmin(c)
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

export async function getMeterdUsage(c: Context, orgId: string): Promise<Database['public']['CompositeTypes']['stats_table']> {
  const { data, error } = await supabaseAdmin(c)
    .rpc('get_metered_usage', { orgid: orgId })
    .single()

  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return {
    mau: data?.mau || 0,
    storage: data?.storage || 0,
    bandwidth: data?.bandwidth || 0,
  }
}
interface Prices {
  mau: string
  storage: string
  bandwidth: string
}

async function setMetered(c: Context, customer_id: string | null, orgId: string) {
  if (customer_id === null)
    return Promise.resolve()
  console.log('setMetered', customer_id, orgId)
  // return await Promise.resolve({} as Prices)
  const { data } = await supabaseAdmin(c)
    .from('stripe_info')
    .select()
    .eq('customer_id', customer_id)
    .single()
  if (data && data.subscription_metered) {
    try {
      await setThreshold(c, customer_id)
    }
    catch (error) {
      console.log('error setTreshold', error)
    }
    const prices = data.subscription_metered as any as Prices
    const get_metered_usage = await getMeterdUsage(c, orgId)
    if (get_metered_usage.mau && get_metered_usage.mau > 0 && prices.mau)
      await recordUsage(c, prices.mau, get_metered_usage.mau)
    if (get_metered_usage.storage && get_metered_usage.storage > 0)
      await recordUsage(c, prices.storage, get_metered_usage.storage)
    if (get_metered_usage.bandwidth && get_metered_usage.bandwidth > 0)
      await recordUsage(c, prices.bandwidth, get_metered_usage.bandwidth)
  }
}

export async function checkPlanOrg(c: Context, orgId: string): Promise<void> {
  // TODO: change the funciton to use the org instead of user id
  try {
    const { data: org, error: userError } = await supabaseAdmin(c)
      .from('orgs')
      .select()
      .eq('id', orgId)
      .single()
    if (userError)
      throw userError
    if (await isTrialOrg(c, orgId)) {
      const { error } = await supabaseAdmin(c)
        .from('stripe_info')
        .update({ is_good_plan: true })
        .eq('customer_id', org.customer_id!)
        .then()
      if (error)
        console.error('error.message', error.message)
      return Promise.resolve()
    }
    const is_good_plan = await isGoodPlanOrg(c, orgId)
    const is_onboarded = await isOnboardedOrg(c, orgId)
    const is_onboarding_needed = await isOnboardingNeeded(c, orgId)
    const percentUsage = await getPlanUsagePercent(c, orgId)
    if (!is_good_plan && is_onboarded) {
      console.log('is_good_plan_v5', orgId, is_good_plan)
      // create dateid var with yyyy-mm with dayjs
      const get_total_stats = await getTotalStats(c, orgId)
      const current_plan = await getCurrentPlanNameOrg(c, orgId)
      if (get_total_stats) {
        const best_plan = await findBestPlan(c, { mau: get_total_stats.mau, storage: get_total_stats.storage, bandwidth: get_total_stats.bandwidth })
        const bestPlanKey = best_plan.toLowerCase().replace(' ', '_')
        await setMetered(c, org.customer_id!, orgId)
        // if (best_plan === 'Free' && current_plan === 'Free') {
        // TODO: find a better trigger for this since there is no more free plan, maybe percent of useage ?
        //   await trackEvent(c, org.management_email, {}, 'user:need_more_time')
        //   console.log('best_plan is free', orgId)
        //   await logsnag(c).track({
        //     channel: 'usage',
        //     event: 'User need more time',
        //     icon: '⏰',
        //     user_id: orgId,
        //     notify: false,
        //   }).catch()
        // }
        // else
        if (planToInt(best_plan) > planToInt(current_plan)) {
          const sent = await sendNotifOrg(c, `user:upgrade_to_${bestPlanKey}`, { best_plan: bestPlanKey, plan_name: current_plan }, orgId, orgId, '0 0 * * 1')
          if (sent) {
          // await addEventPerson(user.email, {}, `user:upgrade_to_${bestPlanKey}`, 'red')
            console.log(`user:upgrade_to_${bestPlanKey}`, orgId)
            await logsnag(c).track({
              channel: 'usage',
              event: `User need upgrade to ${bestPlanKey}`,
              icon: '⚠️',
              user_id: orgId,
              notify: false,
            }).catch()
          }
        }
      }
    }
    else if (!is_onboarded && is_onboarding_needed) {
      await Promise.all([
        logsnag(c).track({
          channel: 'usage',
          event: 'User need onboarding',
          icon: '🥲',
          user_id: orgId,
          notify: false,
        }).catch(),
        trackBentoEvent(c, org.management_email, {}, 'user:need_onboarding'),
      ])
    }
    else if (is_good_plan && is_onboarded) {
      // check if user is at more than 90%, 50% or 70% of plan usage
      if (percentUsage.total_percent >= 90) {
        // cron every month * * * * 1
        const sent = await sendNotifOrg(c, 'user:usage_90_percent_of_plan', { percent: percentUsage }, orgId, orgId, '0 0 1 * *')
        if (sent) {
          // await addEventPerson(user.email, {}, 'user:90_percent_of_plan', 'red')
          await logsnag(c).track({
            channel: 'usage',
            event: 'User is at 90% of plan usage',
            icon: '⚠️',
            user_id: orgId,
            notify: false,
          }).catch()
        }
      }
      else if (percentUsage.total_percent >= 70) {
        // cron every month * * * * 1
        const sent = await sendNotifOrg(c, 'user:usage_70_percent_of_plan', { percent: percentUsage }, orgId, orgId, '0 0 1 * *')
        if (sent) {
          // await addEventPerson(user.email, {}, 'user:70_percent_of_plan', 'orange')
          await logsnag(c).track({
            channel: 'usage',
            event: 'User is at 70% of plan usage',
            icon: '⚠️',
            user_id: orgId,
            notify: false,
          }).catch()
        }
      }
      else if (percentUsage.total_percent >= 50) {
        const sent = await sendNotifOrg(c, 'user:usage_50_percent_of_plan', { percent: percentUsage }, orgId, orgId, '0 0 1 * *')
        if (sent) {
        // await addEventPerson(user.email, {}, 'user:70_percent_of_plan', 'orange')
          await logsnag(c).track({
            channel: 'usage',
            event: 'User is at 50% of plan usage',
            icon: '⚠️',
            user_id: orgId,
            notify: false,
          }).catch()
        }
      }

      // and send email notification
    }
    return supabaseAdmin(c)
      .from('stripe_info')
      .update({
        is_good_plan,
        plan_usage: Math.round(percentUsage.total_percent),
      })
      .eq('customer_id', org.customer_id!)
      .then()
  }
  catch (e) {
    console.log('Error checkPlan', e)
    return Promise.resolve()
  }
}
