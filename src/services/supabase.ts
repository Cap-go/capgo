import type { SupabaseClient } from '@supabase/supabase-js'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { Database } from '~/types/supabase.types'
import { format, parse } from '@std/semver'
import { createClient } from '@supabase/supabase-js'
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
  return supaHost !== 'https://xvwzpoazmxkqosrdewyv-all.supabase.co' && supaHost !== 'https://xvwzpoazmxkqosrdewyv.supabase.co'
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
  const localConfig = getLocalConfig()
  if (import.meta.env.MODE === 'development')
    return localConfig

  try {
    const response = await fetch(`${defaultApiHost}/private/config`)
    if (!response.ok) {
      console.log('Local config', localConfig)
      return localConfig as CapgoConfig
    }
    const data = await response.json() as CapgoConfig
    const merged = { ...localConfig, ...data } as CapgoConfig
    config = merged
    return merged
  }
  catch {
    console.log('Local config', localConfig)
    return localConfig as CapgoConfig
  }
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

  try {
    const response = await fetch(`${defaultApiHost}/files/download_link`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`downloadUrl error: HTTP ${response.status}`)
    }

    const res = await response.json() as { url: string }
    return res.url
  }
  catch (e) {
    throw new Error(`downloadUrl error: ${e instanceof Error ? e.message : String(e)}`)
  }
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
  build_time_unit: number
  get: number
}

export interface AppUsageByVersion {
  date: string
  app_id: string
  version_name: string
  install: number | null
  uninstall: number | null
}

export interface AppUsageGlobal {
  date: string
  bandwidth: number
  mau: number
  storage: number
  build_time_unit: number
  get: number
}

export interface AppUsageGlobalByApp {
  global: AppUsageGlobal[]
  byApp: AppUsageByApp[]
}

export async function getAllDashboard(orgId: string, startDate?: string, endDate?: string): Promise<AppUsageGlobalByApp> {
  try {
    const supabase = useSupabase()
    const dateRange = `?from=${new Date(startDate!).toISOString()}&to=${new Date(endDate!).toISOString()}&breakdown=true&noAccumulate=true`

    // 🚀 SUPER OPTIMIZED: Single API call returns both aggregated AND per-app breakdown (with daily values, not accumulated)
    const response = await supabase.functions.invoke(`statistics/org/${orgId}/${dateRange}`, {
      method: 'GET',
    })

    if (response.error) {
      throw new Error(response.error.message)
    }

    const { global, byApp } = response.data as {
      global: { mau: number, storage: number, bandwidth: number, build_time_unit: number, date: string, get: number }[]
      byApp: { app_id: string, mau: number, storage: number, bandwidth: number, build_time_unit: number, date: string, get: number }[]
    }

    return {
      global: global.sort((a, b) => a.date.localeCompare(b.date)),
      byApp: byApp.sort((a, b) => a.date.localeCompare(b.date)),
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
  // Query uses version_name column - cast needed because auto-generated types are stale
  const { data, error } = await useSupabase()
    .from('daily_version')
    .select('date, app_id, version_name, install, uninstall')
    .eq('app_id', appId)
    .gte('date', startDate)
    .lte('date', endDate)
    .not('version_name', 'is', null)
    .order('date', { ascending: true })

  if (error || !data) {
    console.error('Error fetching data from daily_version:', error)
    return []
  }
  // Cast to our interface - the SQL table has version_name but auto-generated types are stale
  return data as unknown as AppUsageByVersion[]
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
  try {
    const response = await fetch(`${defaultApiHost}/private/plans`)

    if (!response.ok) {
      return []
    }

    return await response.json() as Database['public']['Tables']['plans']['Row'][]
  }
  catch {
    return []
  }
}

export type CreditUnitPricing = Partial<Record<Database['public']['Enums']['credit_metric_type'], number>>
export type UsageCreditLedgerRow = Database['public']['Views']['usage_credit_ledger']['Row']

export async function getCreditUnitPricing(orgId?: string): Promise<CreditUnitPricing> {
  try {
    const { data, error } = await useSupabase()
      .from('capgo_credits_steps')
      .select('type, price_per_unit, step_min, org_id')
      .eq('step_min', 0)
      .order('step_min', { ascending: true })

    if (error || !data)
      throw new Error(error?.message ?? 'Failed to fetch credit pricing')

    const sortedSteps = [...data].sort((a, b) => {
      const aOrgPriority = a.org_id && orgId && a.org_id === orgId ? 0 : 1
      const bOrgPriority = b.org_id && orgId && b.org_id === orgId ? 0 : 1

      if (aOrgPriority !== bOrgPriority)
        return aOrgPriority - bOrgPriority

      return (a.step_min ?? 0) - (b.step_min ?? 0)
    })

    return sortedSteps.reduce<CreditUnitPricing>((pricing, step) => {
      const metric = step.type as Database['public']['Enums']['credit_metric_type']

      if (pricing[metric] === undefined)
        pricing[metric] = step.price_per_unit

      return pricing
    }, {})
  }
  catch (err) {
    console.error('getCreditUnitPricing error', err)
    return {}
  }
}

export async function getUsageCreditDeductions(orgId: string): Promise<UsageCreditLedgerRow[]> {
  if (!orgId)
    return []

  try {
    const { data, error } = await useSupabase()
      .from('usage_credit_ledger')
      .select('*')
      .eq('org_id', orgId)
      .eq('transaction_type', 'deduction')
      .order('occurred_at', { ascending: false })

    if (error)
      throw new Error(error.message)

    return data ?? []
  }
  catch (err) {
    console.error('getUsageCreditDeductions error', err)
    return []
  }
}

interface PlanUsage {
  total_percent: number
  mau_percent: number
  bandwidth_percent: number
  storage_percent: number
  build_time_percent: number
}

export async function getPlanUsagePercent(orgId?: string): Promise<PlanUsage> {
  if (!orgId) {
    return {
      total_percent: 0,
      mau_percent: 0,
      bandwidth_percent: 0,
      storage_percent: 0,
      build_time_percent: 0,
    }
  }
  const { data, error } = await useSupabase()
    .rpc('get_plan_usage_percent_detailed', { orgid: orgId })
    .single()
  if (error)
    throw new Error(error.message)
  return data
}

const DEFAULT_PLAN_NAME = 'Solo'

export async function getCurrentPlanNameOrg(orgId?: string): Promise<string> {
  if (!orgId)
    return DEFAULT_PLAN_NAME
  const { data, error } = await useSupabase()
    .rpc('get_current_plan_name_org', { orgid: orgId })
    .single()
  if (error)
    throw new Error(error.message)

  return data ?? DEFAULT_PLAN_NAME
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

export async function getRemoteDependencies(appId: string, channel: string) {
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

export async function getVersionRemoteDependencies(appId: string, bundleId: string) {
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
  const mappedRemoteNativePackages = await getRemoteDependencies(appId, channel)

  const finalDependencies: Compatibility[] = nativePackages
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

  finalDependencies.push(...removeNotInLocal)

  return {
    finalCompatibility: finalDependencies,
    localDependencies: nativePackages,
  }
}
