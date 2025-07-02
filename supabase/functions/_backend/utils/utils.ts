import type { Context } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase.types.ts'
import { env, getRuntimeKey } from 'hono/adapter'
import { cloudlog } from './loggin.ts'

declare const EdgeRuntime: { waitUntil?: (promise: Promise<any>) => void } | undefined

export const fetchLimit = 50

// Regex for Zod validation of an app id
export const reverseDomainRegex = /^[a-z0-9]+(\.[\w-]+)+$/i

// Regex for Zod validation of a device id. Examples:
//    44f128a5-ac7a-4c9a-be4c-224b6bf81b20 (android)
//    0F673663-459A-44C0-A7F5-613F2A4AF3AB (ios)
export const deviceIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Zod validation messages
export const MISSING_STRING_APP_ID = 'App ID is required'
export const NON_STRING_APP_ID = 'App ID must be a string'
export const INVALID_STRING_APP_ID = 'App ID must be a reverse domain string'

export const MISSING_STRING_DEVICE_ID = 'Device ID is required'
export const NON_STRING_DEVICE_ID = 'Device ID must be a string'
export const INVALID_STRING_DEVICE_ID = 'Device ID must be a valid UUID string'

export const MISSING_STRING_VERSION_NAME = 'Version name is required'
export const NON_STRING_VERSION_NAME = 'Version name must be a string'

export const MISSING_STRING_VERSION_BUILD = 'Version build is required'
export const NON_STRING_VERSION_BUILD = 'Version build must be a string'

export const MISSING_STRING_VERSION_OS = 'Version OS is required'
export const NON_STRING_VERSION_OS = 'Version OS must be a string'

export const MISSING_STRING_PLATFORM = 'Platform is required'
export const NON_STRING_PLATFORM = 'Platform must be a string'

export const INVALID_STRING_PLUGIN_VERSION = 'Plugin version is invalid'
export const MISSING_STRING_PLUGIN_VERSION = 'plugin_version is required'

// Constants for validation messages
export const INVALID_STRING_PLATFORM = 'Platform is not supported or invalid'

// function to fix semver 1.0 to 1.0.0 any verssion missing . should add .0 also should work for 1
export function fixSemver(version: string) {
  const nbPoint = (version?.match(/\./g) ?? []).length
  if (nbPoint === 0)
    return `${version}.0.0`
  if (nbPoint === 1)
    return `${version}.0`
  return version
}

export async function checkKey(c: Context, authorization: string | undefined, supabase: SupabaseClient<Database>, allowed: Database['public']['Enums']['key_mode'][]): Promise<Database['public']['Tables']['apikeys']['Row'] | null> {
  if (!authorization)
    return null
  try {
    const { data, error } = await supabase
      .from('apikeys')
      .select()
      .eq('key', authorization)
      .in('mode', allowed)
      .single()
    if (!data || error) {
      cloudlog({ requestId: c.get('requestId'), message: 'Invalid apikey', authorization, allowed, error })
      return null
    }
    return data
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'checkKey error', error })
    return null
  }
}

export async function checkKeyById(c: Context, id: number, supabase: SupabaseClient<Database>, allowed: Database['public']['Enums']['key_mode'][]): Promise<Database['public']['Tables']['apikeys']['Row'] | null> {
  if (!id)
    return null
  try {
    const { data, error } = await supabase
      .from('apikeys')
      .select('*')
      .eq('id', id)
      .in('mode', allowed)
      .single()
    if (!data || error)
      return null
    return data
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'checkKeyById error', error })
    return null
  }
}

interface LimitedApp {
  id: string
  ignore: number
}

export interface Segments {
  capgo: boolean
  onboarded: boolean
  trial: boolean
  trial7: boolean
  trial1: boolean
  trial0: boolean
  paying: boolean
  plan: string
  payingMonthly: boolean
  overuse: boolean
  canceled: boolean
  issueSegment: boolean
}

export function isLimited(c: Context, id: string) {
  const limits = getEnv(c, 'LIMITED_APPS')
  if (!limits)
    return false
  const apps = JSON.parse(limits) as LimitedApp[]
  const app = apps.find(a => a.id === id)
  if (!app || app.ignore === 0)
    return false
  if (app.ignore === 1)
    return true
  // check is Math.random() < ignore
  return Math.random() < app.ignore
}

export function backgroundTask(c: Context, p: any) {
  if (getEnv(c, 'CAPGO_PREVENT_BACKGROUND_FUNCTIONS') === 'true') {
    return p
  }
  if (getRuntimeKey() === 'workerd') {
    c.executionCtx.waitUntil(p)
    return Promise.resolve(null)
  }
  if (EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(p)
    return Promise.resolve(null)
  }
  return p
}

export function existInEnv(c: Context, key: string): boolean {
  return key in env(c)
}

export function getEnv(c: Context, key: string): string {
  if (key in env(c))
    return env(c)[key] ?? ''
  return ''
}
