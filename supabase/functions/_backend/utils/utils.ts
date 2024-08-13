import { env, getRuntimeKey } from 'hono/adapter'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Context } from '@hono/hono'
import type { Database } from './supabase.types.ts'

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

export function shallowCleanObject(obj: Record<string, unknown>) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value ?? false)
      acc[key] = value

    return acc
  }, {} as Record<string, unknown>)
}

export async function checkKey(authorization: string | undefined, supabase: SupabaseClient<Database>, allowed: Database['public']['Enums']['key_mode'][]): Promise<Database['public']['Tables']['apikeys']['Row'] | null> {
  if (!authorization)
    return null
  try {
    const { data, error } = await supabase
      .from('apikeys')
      .select()
      .eq('key', authorization)
      .in('mode', allowed)
      .single()
    if (!data || error)
      return null
    return data
  }
  catch (error) {
    console.log(error)
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
  if (getRuntimeKey() === 'workerd') {
    c.executionCtx.waitUntil(p)
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
