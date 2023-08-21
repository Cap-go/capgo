import type { SupabaseClientOptions } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

// import { Http } from '@capacitor-community/http'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { Database } from '~/types/supabase.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supbaseId = supabaseUrl.split('//')[1].split('.')[0]
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export function useSupabase() {
  const options: SupabaseClientOptions<'public'> = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // fetch: (requestInfo, requestInit) => {
    //   const url = requestInfo.toString()
    //   if (requestInit?.method === 'POST' && (url.includes('/storage/') || url.includes('.functions.supabase.co')))
    //     return fetch(requestInfo, requestInit)
    //   return Http.request({
    //     url,
    //     method: requestInit?.method,
    //     headers: requestInit?.headers as any || {},
    //     data: requestInit?.body,
    //   })
    //     .then((data) => {
    //       const res = typeof data.data === 'string' ? data.data : JSON.stringify(data.data)
    //       const resp = new Response(res, {
    //         status: data.status,
    //         headers: data.headers,
    //       })
    //       return resp
    //     })
    // },
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey, options)
}

export function isSpoofed() {
  return !!localStorage.getItem('supabase.spoof_id')
}
export function saveSpoof(id: string) {
  return localStorage.setItem('supabase.spoof_id', id)
}

export function spoofUser() {
  const textData = localStorage.getItem(`sb-${supbaseId}-auth-token`)
  if (!textData)
    return false

  const data = JSON.parse(textData)
  data.user.id = localStorage.getItem('supabase.spoof_id')
  localStorage.setItem(`sb-${supbaseId}-auth-token`, JSON.stringify(data))
  return data.user.id
}
export async function deleteUser() {
  const { error } = await useSupabase()
  // @ts-ignore
    .rpc('delete_user')
    .single()
  if (error)
    throw new Error(error.message)
}
export function deleteSupabaseToken() {
  return localStorage.removeItem(`sb-${supbaseId}-auth-token`)
}
export function getSupabaseToken() {
  return localStorage.getItem(`sb-${supbaseId}-auth-token`)
}
export function unspoofUser() {
  const textData = localStorage.getItem(`sb-${supbaseId}-auth-token`)
  if (!textData || !isSpoofed())
    return false

  const data = JSON.parse(textData)
  const oldId = localStorage.getItem('supabase.spoof_id')
  if (!oldId)
    return false

  data.user.id = oldId
  localStorage.setItem(`sb-${supbaseId}-auth-token`, JSON.stringify(data))
  localStorage.removeItem('supabase.spoof_id')
  return true
}

export async function downloadUrl(provider: string, userId: string, appId: string, bucketId: string): Promise<string> {
  const data = {
    user_id: userId,
    app_id: appId,
    storage_provider: provider,
    bucket_id: bucketId,
  }
  const res = await useSupabase().functions.invoke('download_link', { body: JSON.stringify(data) })
  return res.data.url
}

export async function existUser(email: string): Promise<string> {
  const { data, error } = await useSupabase()
    .rpc('exist_user', { e_mail: email })
    .single()
  if (error)
    throw new Error(error.message)

  return data
}

export async function autoAuth(route: RouteLocationNormalizedLoaded) {
  const supabase = useSupabase()
  const { data: session } = await supabase.auth.getSession()!
  if (session.session || !route.hash)
    return null
  const queryString = route.hash.replace('#', '')
  const urlParams = new URLSearchParams(queryString)
  const refresh_token = urlParams.get('refresh_token')
  if (!refresh_token)
    return null
  const { data: logSession } = await supabase.auth.refreshSession({
    refresh_token,
  })
  return logSession
}

export async function isGoodPlan(userId: string): Promise<boolean> {
  const { data, error } = await useSupabase()
    .rpc('is_good_plan_v3', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data || false
}
export async function isTrial(userId: string): Promise<number> {
  const { data, error } = await useSupabase()
    .rpc('is_trial', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data || 0
}
export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await useSupabase()
    .rpc('is_admin', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data || false
}

export async function isCanceled(userId: string): Promise<boolean> {
  const { data, error } = await useSupabase()
    .rpc('is_canceled', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data || false
}

export async function isPaying(userId: string): Promise<boolean> {
  const { data, error } = await useSupabase()
    .rpc('is_paying', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data || false
}

export async function getPlans(): Promise<Database['public']['Tables']['plans']['Row'][]> {
  const { data: plans } = await useSupabase()
    .from('plans')
    .select()
    .order('price_m')
    // .neq('stripe_id', 'free')
  return plans || []
}

export async function isAllowedAction(userId: string): Promise<boolean> {
  const { data, error } = await useSupabase()
    .rpc('is_allowed_action_user', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data
}

export async function getPlanUsagePercent(userId: string, dateid: string): Promise<number> {
  const { data, error } = await useSupabase()
    .rpc('get_plan_usage_percent', { userid: userId, dateid })
    .single()
  if (error)
    throw new Error(error.message)
  return data || 0
}

export async function getTotalStats(userId: string, dateId: string): Promise<Database['public']['Functions']['get_total_stats_v2']['Returns'][0]> {
  const { data, error } = await useSupabase()
    .rpc('get_total_stats_v2', { userid: userId, dateid: dateId })
    .single()
  if (error)
    throw new Error(error.message)
  // console.log('getTotalStats', data, error)

  return data as any as Database['public']['Functions']['get_total_stats_v2']['Returns'][0] || {
    mau: 0,
    bandwidth: 0,
    storage: 0,
  }
}

export async function getCurrentPlanName(userId: string): Promise<string> {
  const { data, error } = await useSupabase()
    .rpc('get_current_plan_name', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data || 'Free'
}

export async function findBestPlan(stats: Database['public']['Functions']['find_best_plan_v3']['Args']): Promise<string> {
  // console.log('findBestPlan', stats)
  // const storage = bytesToGb(stats.storage)
  // const bandwidth = bytesToGb(stats.bandwidth)
  const { data, error } = await useSupabase()
    .rpc('find_best_plan_v3', {
      mau: stats.mau || 0,
      bandwidth: stats.bandwidth,
      storage: stats.storage,
    })
    .single()
  if (error)
    throw new Error(error.message)

  return data
}
