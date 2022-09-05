import { supabaseAdmin } from './supabase.ts'
import type { definitions } from './types_supabase.ts'

export interface PlanData {
  plan: string
  planSuggest: string
  payment?: definitions['stripe_info'] | null
  canUseMore: boolean
  paying: boolean
}
export interface PlanRes extends PlanData {
  trialDaysLeft: number
  stats: Stats
  AllPlans: definitions['plans'][]
}

export interface Stats {
  max_app: number
  max_channel: number
  max_version: number
  max_shared: number
  max_update: number
  max_device: number
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
    .rpc<boolean>('is_good_plan', { userid: userId })
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

export const findBestPlan = async (stats: Stats): Promise<string> => {
  const { data, error } = await supabaseAdmin
    .rpc<string>('find_best_plan', {
      apps_n: stats.max_app || 0,
      channels_n: stats.max_channel || 0,
      updates_n: stats.max_update || 0,
      versions_n: stats.max_version || 0,
      shared_n: stats.max_shared || 0,
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

export const getMaxstats = async (userId: string, dateId: string): Promise<Stats> => {
  const { data, error } = await supabaseAdmin
    .rpc<Stats>('get_max_stats', { userid: userId, dateid: dateId })
    .single()
  if (error)
    throw error

  return data || {
    max_app: 0,
    max_channel: 0,
    max_version: 0,
    max_shared: 0,
    max_update: 0,
    max_device: 0,
  }
}

export const getMyPlan = async (user: definitions['users'], stats: Stats): Promise<PlanData> => {
  const { data: payment } = await supabaseAdmin
    .from<definitions['stripe_info']>('stripe_info')
    .select()
    .eq('customer_id', user.customer_id)
    .single()
  const current = await getCurrentPlanName(user.id)
  if (current) {
    const planSuggest = await findBestPlan(stats)
    const paying = await isPaying(user.id)
    const canUseMore = paying ? await isGoodPlan(user.id) : false
    return { plan: current, payment, canUseMore, planSuggest, paying }
  }
  return Promise.reject(Error('no data'))
}

export const currentPaymentstatus = async (user: definitions['users']): Promise<PlanRes> => {
  try {
    // dateId yyyy-mm
    const dateId = new Date().toISOString().slice(0, 7)
    const stats = await getMaxstats(user.id, dateId)
    const myPlan = await getMyPlan(user, stats)
    const res: PlanRes = {
      stats,
      payment: myPlan.payment,
      paying: myPlan.paying,
      plan: myPlan.plan,
      planSuggest: myPlan.planSuggest,
      canUseMore: myPlan.canUseMore,
      trialDaysLeft: await isTrial(user.id),
      AllPlans: await getPlans(),
    }
    if (res.trialDaysLeft > 0)
      res.canUseMore = true
    return res
  }
  catch (error) {
    console.log('currentPaymentstatus error', error)
    return {
      stats: {
        max_app: 0,
        max_channel: 0,
        max_version: 0,
        max_shared: 0,
        max_update: 0,
        max_device: 0,
      },
      paying: false,
      canUseMore: false,
      trialDaysLeft: 0,
      AllPlans: await getPlans(),
      plan: 'Free',
      planSuggest: 'Free',
    }
  }
}
