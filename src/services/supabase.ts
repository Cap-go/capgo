import type { SupabaseClientOptions } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { Http } from '@capacitor-community/http'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { StatsV2 } from './plans'
import type { definitions } from '~/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const useSupabase = () => {
  const options: SupabaseClientOptions = {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: (requestInfo, requestInit) => {
      const url = requestInfo.toString()
      if (requestInit?.method === 'POST' && (url.includes('/storage/') || url.includes('.functions.supabase.co')))
        return fetch(requestInfo, requestInit)
      return Http.request({
        url,
        method: requestInit?.method,
        headers: requestInit?.headers as any || {},
        data: requestInit?.body,
      })
        .then((data) => {
          const res = typeof data.data === 'string' ? data.data : JSON.stringify(data.data)
          const resp = new Response(res, {
            status: data.status,
            headers: data.headers,
          })
          return resp
        })
    },
  }
  return createClient(supabaseUrl, supabaseAnonKey, options)
}

export const autoAuth = async (route: RouteLocationNormalizedLoaded) => {
  const supabase = useSupabase()
  const session = supabase.auth.session()!
  if (session || !route.hash)
    return null
  const queryString = route.hash.replace('#', '')
  const urlParams = new URLSearchParams(queryString)
  const refresh_token = urlParams.get('refresh_token')
  if (!refresh_token)
    return null
  const logSession = await supabase.auth.signIn({
    refreshToken: refresh_token || '',
  })
  return logSession
}

export const isGoodPlan = async (userId: string): Promise<boolean> => {
  const { data, error } = await useSupabase()
    .rpc<boolean>('is_good_plan_v2', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}
export const isTrial = async (userId: string): Promise<number> => {
  const { data, error } = await useSupabase()
    .rpc<number>('is_trial', { userid: userId })
    .single()
  if (error)
    throw error

  return data || 0
}
export const isAdmin = async (userId: string): Promise<boolean> => {
  const { data, error } = await useSupabase()
    .rpc<boolean>('is_admin', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}
export const isCanceled = async (userId: string): Promise<boolean> => {
  const { data, error } = await useSupabase()
    .rpc<boolean>('is_canceled', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}

export const isPaying = async (userId: string): Promise<boolean> => {
  const { data, error } = await useSupabase()
    .rpc<boolean>('is_paying', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}

export const getPlans = async (): Promise<definitions['plans'][]> => {
  const { data: plans } = await useSupabase()
    .from<definitions['plans']>('plans')
    .select()
    .order('price_m')
    // .neq('stripe_id', 'free')
  return plans || []
}

export const isAllowedAction = async (userId: string): Promise<boolean> => {
  const { data, error } = await useSupabase()
    .rpc<boolean>('is_allowed_action_user', { userid: userId })
    .single()
  if (error)
    throw error

  return data
}

export const getCurrentPlanName = async (userId: string): Promise<string> => {
  const { data, error } = await useSupabase()
    .rpc<string>('get_current_plan_name', { userid: userId })
    .single()
  if (error)
    throw error

  return data || 'Free'
}

export const findBestPlan = async (stats: StatsV2): Promise<string> => {
  // console.log('findBestPlan', stats)
  const storage = Math.round((stats.storage || 0) / 1024 / 1024 / 1024)
  const bandwidth = Math.round((stats.bandwidth || 0) / 1024 / 1024 / 1024)
  const { data, error } = await useSupabase()
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
