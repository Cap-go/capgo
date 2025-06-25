import type { SupabaseClient } from '@supabase/supabase-js'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { Database } from '~/types/supabase.types'
import { format, parse } from '@std/semver'
import { createClient } from '@supabase/supabase-js'
import ky from 'ky'
import subset from 'semver/ranges/subset'

let supaClient: SupabaseClient<Database> = null as any

export const defaultApiHost = import.meta.env.VITE_API_HOST as string

export interface CapgoConfig {
  supaHost: string
  supaKey: string
  supbaseId: string
  host: string
  hostWeb: string
}

export function isLocal(supaHost: string) {
  return supaHost !== 'https://xvwzpoazmxkqosrdewyv.supabase.co'
}

export function getLocalConfig() {
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
  if (import.meta.env.MODE === 'development')
    return localConfig
  const data = await ky
    .get(`${defaultApiHost}/private/config`)
    .then(res => res.json<CapgoConfig>())
    .then(d => ({ ...localConfig, ...d } as CapgoConfig))
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
  }
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

export async function downloadUrl(provider: string, userId: string, appId: string, id: number): Promise<string> {
  const data = {
    user_id: userId,
    app_id: appId,
    storage_provider: provider,
    id,
  }
  const { data: currentSession } = await useSupabase().auth.getSession()!
  if (!currentSession.session)
    return ''

  const currentJwt = currentSession.session.access_token
  const res = await ky.post(`${defaultApiHost}/files/download_link`, {
    json: data,
    headers: {
      Authorization: `Bearer ${currentJwt}`,
    },
  }).json<{ url: string }>()
  return res.url
}

// do a function to get get_process_cron_stats_job_info for supabase

export async function getProcessCronStatsJobInfo() {
  const { data, error } = await useSupabase()
    .rpc('get_process_cron_stats_job_info')
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

export interface AppUsageByApp {
  app_id: string
  date: string
  mau: number
  storage: number
  bandwidth: number
  get: number
}

export interface AppUsageByVersion {
  date: string
  app_id: string
  version_id: number
  install: number | null
  uninstall: number | null
}

export interface AppUsageGlobal {
  date: string
  bandwidth: number
  mau: number
  storage: number
  get: number
}

export interface AppUsageGlobalByApp {
  global: AppUsageGlobal[]
  byApp: AppUsageByApp[]
}

export async function getAllDashboard(orgId: string, startDate?: string, endDate?: string): Promise<AppUsageGlobalByApp> {
  try {
    const supabase = useSupabase()
    const resAppIds = await useSupabase()
      .from('apps')
      .select('app_id')
      .eq('owner_org', orgId)
      .then(res => res.data?.map(app => app.app_id) ?? [])

    const dateRange = `?from=${new Date(startDate!).toISOString()}&to=${new Date(endDate!).toISOString()}`

    // Combine orgData and appStats into a single Promise.all
    const [orgStatistics, appStatistics] = await Promise.all([
      // Get org statistics
      supabase.functions.invoke(`statistics/org/${orgId}/${dateRange}`, {
        method: 'GET',
      }).then((res) => {
        if (res.error)
          throw new Error(res.error.message)
        return (res.data as { mau: number, storage: number, bandwidth: number, date: string, get: number }[])
      }),
      // Get app statistics for all apps
      Promise.all(resAppIds.map(appId =>
        supabase.functions.invoke(`statistics/app/${appId}/${dateRange}`, {
          method: 'GET',
        }).then((res) => {
          if (res.error)
            throw new Error(res.error.message)
          const typedData = res.data as { mau: number, storage: number, bandwidth: number, date: string, get: number }[]
          return typedData.map(stat => ({
            app_id: appId,
            date: stat.date,
            mau: stat.mau,
            storage: stat.storage,
            bandwidth: stat.bandwidth,
            get: stat.get,
          }))
        }),
      )).then(stats => stats.flat()),
    ])

    return {
      global: orgStatistics.sort((a, b) => a.date.localeCompare(b.date)),
      byApp: appStatistics.sort((a, b) => a.date.localeCompare(b.date)),
    }
  }
  catch (error) {
    console.error('Error in getAllDashboard:', error)
    throw error
  }
}
interface NativePackage {
  name: string
  version: string
}

export async function getCapgoVersion(appId: string, versionId: string | null | undefined): Promise<string> {
  if (!versionId)
    return ''
  const { data, error } = await useSupabase()
    .from('app_versions')
    .select('native_packages')
    .eq('app_id', appId)
    .eq('name', versionId)
    .single()

  if (error)
    return ''

  const nativePackages: NativePackage[] = (data?.native_packages ?? []) as any as NativePackage[]
  for (const pkg of nativePackages) {
    if (pkg && pkg.name === '@capgo/capacitor-updater') {
      return format(parse(pkg.version.replace('^', '').replace('~', '')))
    }
  }
  return ''
}

export interface VersionName {
  id: number
  name: string
  created_at: string
}

export async function getVersionNames(appId: string, versionIds: number[]): Promise<VersionName[]> {
  const { data, error: vError } = await useSupabase()
    .from('app_versions')
    .select('id, name, created_at')
    .eq('app_id', appId)
    .in('id', versionIds)

  if (vError)
    return []

  return data as VersionName[]
}

export async function getDailyVersion(appId: string, startDate?: string, endDate?: string): Promise<AppUsageByVersion[]> {
  const { data, error } = await useSupabase()
    .from('daily_version')
    .select('date, app_id, version_id, install, uninstall')
    .eq('app_id', appId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error || !data) {
    console.error('Error fetching data from daily_version:', error)
    return []
  }
  return data
}

export async function getTotalAppStorage(orgId?: string, appid?: string): Promise<number> {
  if (!orgId)
    return 0
  if (!appid)
    return getTotalStorage(orgId)

  const { data, error } = await useSupabase()
    .rpc('get_total_app_storage_size_orgs', { org_id: orgId, app_id: appid })
    .single()
  if (error)
    throw new Error(error.message)

  return data ?? 0
}

export async function getTotalStorage(orgId?: string): Promise<number> {
  if (!orgId)
    return 0
  const { data, error } = await useSupabase()
    .rpc('get_total_storage_size_org', { org_id: orgId })
    .single()
  if (error)
    throw new Error(error.message)

  return data ?? 0
}

export async function isGoodPlanOrg(orgId?: string): Promise<boolean> {
  if (!orgId)
    return false
  const { data, error } = await useSupabase()
    .rpc('is_good_plan_v5_org', { orgid: orgId })
    .single()
  if (error)
    throw new Error(error.message)

  return data ?? false
}

export async function isTrialOrg(orgId: string): Promise<number> {
  const { data, error } = await useSupabase()
    .rpc('is_trial_org', { orgid: orgId })
    .single()
  if (error)
    throw new Error(error.message)

  return data ?? 0
}
export async function isAdmin(userid?: string): Promise<boolean> {
  if (!userid)
    return false
  const { data, error } = await useSupabase()
    .rpc('is_admin', { userid })
    .single()
  if (error)
    throw new Error(error.message)

  return data ?? false
}

export async function isCanceled(orgId?: string): Promise<boolean> {
  if (!orgId)
    return false
  const { data, error } = await useSupabase()
    .rpc('is_canceled_org', { orgid: orgId })
    .single()
  if (error)
    throw new Error(error.message)

  return data ?? false
}

export async function isPayingOrg(orgId: string): Promise<boolean> {
  const { data, error } = await useSupabase()
    .rpc('is_paying_org', { orgid: orgId })
    .single()
  if (error)
    console.error('isPayingOrg error', orgId, error)

  return data ?? false
}

export async function getPlans(): Promise<Database['public']['Tables']['plans']['Row'][]> {
  const data = await ky
    .get(`${defaultApiHost}/private/plans`)
    .then(res => res.json<Database['public']['Tables']['plans']['Row'][]>())
    .catch(() => [])
  return data
}

interface PlanUsage {
  total_percent: number
  mau_percent: number
  bandwidth_percent: number
  storage_percent: number
}

export async function getPlanUsagePercent(orgId?: string): Promise<PlanUsage> {
  if (!orgId) {
    return {
      total_percent: 0,
      mau_percent: 0,
      bandwidth_percent: 0,
      storage_percent: 0,
    }
  }
  const { data, error } = await useSupabase()
    .rpc('get_plan_usage_percent_detailed', { orgid: orgId })
    .single()
  if (error)
    throw new Error(error.message)
  return data
}

const DEFAUL_PLAN_NAME = 'Solo'

export async function getCurrentPlanNameOrg(orgId?: string): Promise<string> {
  if (!orgId)
    return DEFAUL_PLAN_NAME
  const { data, error } = await useSupabase()
    .rpc('get_current_plan_name_org', { orgid: orgId })
    .single()
  if (error)
    throw new Error(error.message)

  return data  ?? DEFAUL_PLAN_NAME
}

export async function findBestPlan(stats: Database['public']['Functions']['find_best_plan_v3']['Args']): Promise<string> {
  // console.log('findBestPlan', stats)
  // const storage = bytesToGb(stats.storage)
  // const bandwidth = bytesToGb(stats.bandwidth)
  const { data, error } = await useSupabase()
    .rpc('find_best_plan_v3', {
      mau: stats.mau ?? 0,
      bandwidth: stats.bandwidth,
      storage: stats.storage,
    })
    .single()
  if (error)
    throw new Error(error.message)

  return data
}

export async function getAppMetrics(orgId: string, startDate?: string, endDate?: string): Promise<AppUsageByApp[]> {
  const { data, error } = await useSupabase()
    .rpc('get_app_metrics', { org_id: orgId, start_date: startDate, end_date: endDate })
  if (error)
    throw new Error(error.message)

  return data
}

export function convertNativePackages(nativePackages: { name: string, version: string }[]) {
  if (!nativePackages) {
    throw new Error(`Error parsing native packages, perhaps the metadata does not exist in Capgo?`)
  }

  // Check types
  nativePackages.forEach((data: any) => {
    if (typeof data !== 'object') {
      throw new TypeError(`Invalid remote native package data: ${data}, expected object, got ${typeof data}`)
    }

    const { name, version } = data
    if (!name || typeof name !== 'string') {
      throw new Error(`Invalid remote native package name: ${name}, expected string, got ${typeof name}`)
    }

    if (!version || typeof version !== 'string') {
      throw new TypeError(`Invalid remote native package version: ${version}, expected string, got ${typeof version}`)
    }
  })

  const mappedRemoteNativePackages = new Map((nativePackages)
    .map(a => [a.name, a]))

  return mappedRemoteNativePackages
}

export async function getRemoteDepenencies(appId: string, channel: string) {
  const { data: remoteNativePackages, error } = await useSupabase()
    .from('channels')
    .select(`version ( 
            native_packages 
        )`)
    .eq('name', channel)
    .eq('app_id', appId)
    .single()

  if (error) {
    throw new Error(error.message)
  }
  return convertNativePackages((remoteNativePackages.version.native_packages as any) ?? [])
}

export async function getVersionRemoteDepenencies(appId: string, bundleId: string) {
  const { data, error } = await useSupabase()
    .from('app_versions')
    .select()
    .eq('name', bundleId)
    .eq('app_id', appId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return convertNativePackages((data.native_packages as any) ?? [])
}

interface Compatibility {
  name: string
  localVersion: string | undefined
  remoteVersion: string | undefined
}

export function isCompatible(pkg: Compatibility): boolean {
  // Only check compatibility if there's a local version
  // If there's a local version but no remote version, or versions don't match, it's incompatible
  if (!pkg.localVersion)
    return true // If no local version, it's compatible (remote-only package)
  if (!pkg.remoteVersion)
    return false // If local version but no remote version, it's incompatible
  try {
    return subset(pkg.localVersion, pkg.remoteVersion)
  }
  catch {
    return false // If version comparison fails, consider it incompatible
  }
}

export async function checkCompatibilityNativePackages(appId: string, channel: string, nativePackages: { name: string, version: string }[]) {
  const mappedRemoteNativePackages = await getRemoteDepenencies(appId, channel)

  const finalDepenencies: Compatibility[] = nativePackages
    .map((local) => {
      const remotePackage = mappedRemoteNativePackages.get(local.name)
      if (remotePackage) {
        return {
          name: local.name,
          localVersion: local.version,
          remoteVersion: remotePackage.version,
        }
      }

      return {
        name: local.name,
        localVersion: local.version,
        remoteVersion: undefined,
      }
    })

  // Only include remote packages that are not in local for informational purposes
  // These won't affect compatibility
  const removeNotInLocal = [...mappedRemoteNativePackages]
    .filter(([remoteName]) => nativePackages.find(a => a.name === remoteName) === undefined)
    .map(([name, version]) => ({ name, localVersion: undefined, remoteVersion: version.version }))

  finalDepenencies.push(...removeNotInLocal)

  return {
    finalCompatibility: finalDepenencies,
    localDependencies: nativePackages,
  }
}
