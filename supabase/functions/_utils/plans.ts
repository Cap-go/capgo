import { supabaseAdmin } from './supabase.ts'
import type { definitions } from './types_supabase.ts'
export interface StatsV2 {
  mau: number
  storage: number
  bandwidth: number
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