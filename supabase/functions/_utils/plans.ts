import { addEventPerson } from "./crisp.ts";
import { supabaseAdmin } from './supabase.ts'
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
export const getPlans = async (): Promise<definitions['plans'][]> => {
  const { data: plans } = await supabaseAdmin
    .from<definitions['plans']>('plans')
    .select()
    .order('price_m')
    .neq('stripe_id', 'free')
  return plans || []
}

export const isGoodPlan = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .rpc<boolean>('is_good_plan_v2', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}

export const isPaying = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .rpc<boolean>('is_paying', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}

export const findBestPlan = async (stats: StatsV2): Promise<string> => {
  const storage = Math.round((stats.storage || 0)  / 1024 / 1024 / 1024)
  const bandwidth = Math.round((stats.bandwidth || 0)  / 1024 / 1024 / 1024)
  const { data, error } = await supabaseAdmin
    .rpc<string>('find_best_plan_v2', {
      mau: stats.mau || 0,
      storage: storage,
      bandwidth: bandwidth,
    })
    .single()
  if (error)
    throw error

  return data || 'Team'
}

export const isTrial = async (userId: string): Promise<number> => {
  const { data, error } = await supabaseAdmin
    .rpc<number>('is_trial', { userid: userId })
    .single()
  if (error)
    throw error

  return data || 0
}

export const getCurrentPlanName = async (userId: string): Promise<string> => {
  const { data, error } = await supabaseAdmin
    .rpc<string>('get_current_plan_name', { userid: userId })
    .single()
  if (error)
    throw error

  return data || 'Free'
}

export const getMaxstats = async (userId: string, dateId: string): Promise<StatsV2> => {
  const { data, error } = await supabaseAdmin
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

export const checkPlan = async (user: definitions['users']): Promise<void> => {
  // console.log('checkPlan', user.id)
  try {
      const isTrial = await supabaseAdmin
          .rpc<boolean>('is_trial', { userid: user.id })
          .single()

      if (isTrial.data) {
        await supabaseAdmin
          .from<definitions['stripe_info']>('stripe_info')
          .update({ is_good_plan: true })
          .eq('customer_id', user.customer_id)
          .then()
        return Promise.resolve()
      }
      const { data: is_good_plan, error } = await supabaseAdmin
        .rpc<boolean>('is_good_plan_v2', { userid: user.id })
        .single()
      if (error) {
        console.log('is_good_plan error', user.id, error)
        return Promise.reject(error)
      }
      if (!is_good_plan) {
        console.log('is_good_plan_v2', user.id, is_good_plan)
        // create dateid var with yyyy-mm with dayjs
        const dateid = new Date().toISOString().slice(0, 7)
        const { data: get_max_stats } = await supabaseAdmin
          .rpc<StatsV2>('get_total_stats', { userid: user.id, dateid })
          .single()
          const current_plan = await getCurrentPlanName(user.id)
          if (get_max_stats) {
            const best_plan = await findBestPlan(get_max_stats)
            const bestPlanKey = best_plan.toLowerCase().replace(' ', '_')
            if (best_plan === 'Free' && current_plan === 'Free') {
              await addEventPerson(user.email, {}, 'user:need_more_time', 'blue')
              console.log('best_plan is free', user.id)
            }
            else if (best_plan !== current_plan && planToInt(best_plan) > planToInt(current_plan))  {
              await addEventPerson(user.email, {}, `user:upgrade_to_${bestPlanKey}`, 'red')
              console.log(`user:upgrade_to_${bestPlanKey}`, user.id)
            }
          } 
      }
      return supabaseAdmin
            .from<definitions['stripe_info']>('stripe_info')
            .update({ is_good_plan: !!is_good_plan })
            .eq('customer_id', user.customer_id)
            .then()
  }
  catch (e) {
    console.log('Error', e)
    return Promise.reject(e)
  }
}