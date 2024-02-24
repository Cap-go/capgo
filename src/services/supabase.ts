import ky from 'ky'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

// import { Http } from '@capacitor-community/http'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { Database } from '~/types/supabase.types'

let supaClient: SupabaseClient<Database> = null as any

export const defaultApiHost = import.meta.env.VITE_API_HOST as string

interface CapgoConfig {
  supaHost: string
  supaKey: string
  supbaseId: string
  host: string
  hostWeb: string
}

function getLocalConfig() {
  return {
    supaHost: import.meta.env.VITE_SUPABASE_URL as string,
    supaKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    supbaseId: import.meta.env.VITE_SUPABASE_URL?.split('//')[1].split('.')[0].split(':')[0] as string,
    host: import.meta.env.VITE_APP_URL as string,
    hostWeb: import.meta.env.LANDING_URL as string,
  } as CapgoConfig
}

let config: CapgoConfig = getLocalConfig()

export async function getRemoteConfig() {
  // call host + /api/private/config and parse the result as json using ky
  const localConfig = await getLocalConfig()
  const data = await ky
    .get(`${defaultApiHost}/private/config`)
    .then(res => res.json<CapgoConfig>())
    .then(data => ({ ...data, ...localConfig } as CapgoConfig))
    .catch(() => {
      console.log('Local config', localConfig)
      return localConfig as CapgoConfig
    })
  config = data
}

export function useSupabase() {
  const options = {
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
  // return createClient<Database>(supabaseUrl, supabaseAnonKey, options)
  if (supaClient)
    return supaClient

  supaClient = createClient<Database>(config.supaHost, config.supaKey, options)
  return supaClient
}

export function isSpoofed() {
  return !!localStorage.getItem(`supabase-${config.supbaseId}.spoof_admin_jwt`)
}
export function saveSpoof(jwt: string, refreshToken: string) {
  return localStorage.setItem(`supabase-${config.supbaseId}.spoof_admin_jwt`, JSON.stringify({ jwt, refreshToken }))
}

export async function hashEmail(email: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(email)

  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('')
  return hashHex
}

export async function deleteUser() {
  const { error } = await useSupabase()
    .rpc('delete_user')
    .single()
  if (error)
    throw new Error(error.message)
}
export function deleteSupabaseToken() {
  return localStorage.removeItem(`sb-${config.supbaseId}-auth-token`)
}
export function getSupabaseToken() {
  return localStorage.getItem(`sb-${config.supbaseId}-auth-token`)
}
export function unspoofUser() {
  const textData: string | null = localStorage.getItem(`supabase-${config.supbaseId}.spoof_admin_jwt`)
  if (!textData || !isSpoofed())
    return false

  const { jwt, refreshToken } = JSON.parse(textData)
  if (!jwt || !refreshToken)
    return false

  const supabase = useSupabase()
  supabase.auth.setSession({ access_token: jwt, refresh_token: refreshToken })
  localStorage.removeItem(`supabase-${config.supbaseId}.spoof_admin_jwt`)
  return true
}

export async function downloadUrl(provider: string, userId: string, appId: string, bucketId: string): Promise<string> {
  const data = {
    user_id: userId,
    app_id: appId,
    storage_provider: provider,
    bucket_id: bucketId,
  }
  const res = await useSupabase().functions.invoke('private/download_link', { body: JSON.stringify(data) })
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

export interface appUsage {
  app_id: string
  bandwidth: number
  date: string
  fail: number
  get: number
  install: number
  mau: number
  storage_added: number
  storage_deleted: number
  uninstall: number
}
export async function getAllDashboard(userId: string, startDate?: string, endDate?: string): Promise<appUsage[]> {
  const token = (await useSupabase().auth.getSession()).data.session?.access_token
  const data = await ky
    .post(`${defaultApiHost}/private/dashboard`, {
      json: {
        userId,
        startDate,
        endDate,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    .then(res => res.json<appUsage[]>())
    .catch(() => {
      return []
    })
  return data
}

export async function getTotaAppStorage(userid?: string, appid?: string): Promise<number> {
  if (!userid)
    return 0
  if (!appid)
    return getTotalStorage(userid)
  const { data, error } = await useSupabase()
    .rpc('get_total_app_storage_size', { userid, appid })
    .single()
  if (error)
    throw new Error(error.message)

  return data || 0
}

export async function getTotalStorage(userid?: string): Promise<number> {
  if (!userid)
    return 0
  const { data, error } = await useSupabase()
    .rpc('get_total_storage_size', { userid })
    .single()
  if (error)
    throw new Error(error.message)

  return data || 0
}

export async function isGoodPlan(userid?: string): Promise<boolean> {
  if (!userid)
    return false
  const { data, error } = await useSupabase()
    .rpc('is_good_plan_v4', { userid })
    .single()
  if (error)
    throw new Error(error.message)

  return data || false
}

export async function getOrgs(): Promise<Database['public']['Tables']['orgs']['Row'][]> {
  const { data, error } = await useSupabase()
    .from('orgs')
    .select('*')

  if (error) {
    console.error('getOrgs error', error.message)
    throw error
  }

  return data || []
}

export async function isTrial(userid?: string): Promise<number> {
  if (!userid)
    return 0
  const { data, error } = await useSupabase()
    .rpc('is_trial', { userid })
    .single()
  if (error)
    throw new Error(error.message)

  return data || 0
}
export async function isAdmin(userid?: string): Promise<boolean> {
  if (!userid)
    return false
  const { data, error } = await useSupabase()
    .rpc('is_admin', { userid })
    .single()
  if (error)
    throw new Error(error.message)

  return data || false
}

export async function isCanceled(userid?: string): Promise<boolean> {
  if (!userid)
    return false
  const { data, error } = await useSupabase()
    .rpc('is_canceled', { userid })
    .single()
  if (error)
    throw new Error(error.message)

  return data || false
}

export async function isPaying(userid?: string): Promise<boolean> {
  if (!userid)
    return false
  const { data, error } = await useSupabase()
    .rpc('is_paying', { userid })
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

export async function isAllowedAction(userid?: string): Promise<boolean> {
  if (!userid)
    return false
  const { data, error } = await useSupabase()
    .rpc('is_allowed_action_user', { userid })
    .single()
  if (error)
    throw new Error(error.message)

  return data
}

export async function getPlanUsagePercent(userid?: string): Promise<number> {
  if (!userid)
    return 0
  const { data, error } = await useSupabase()
    .rpc('get_plan_usage_percent', { userid })
    .single()
  if (error)
    throw new Error(error.message)
  return data || 0
}

export async function getTotalStats(userid?: string): Promise<Database['public']['Functions']['get_total_stats_v4']['Returns'][0]> {
  if (!userid) {
    return {
      mau: 0,
      bandwidth: 0,
      storage: 0,
    }
  }
  const { data, error } = await useSupabase()
    .rpc('get_total_stats_v4', { userid })
    .single()
  if (error)
    throw new Error(error.message)
  // console.log('getTotalStats', data, error)

  return data as any as Database['public']['Functions']['get_total_stats_v4']['Returns'][0] || {
    mau: 0,
    bandwidth: 0,
    storage: 0,
  }
}

export async function getCurrentPlanName(userid?: string): Promise<string> {
  if (!userid)
    return 'Free'
  const { data, error } = await useSupabase()
    .rpc('get_current_plan_name', { userid })
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
