import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/supabase.types'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'

export const POSTGRES_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export const BASE_URL = `${env.SUPABASE_URL}/functions/v1`
export const API_SECRET = 'testsecret'
export const APIKEY_TEST_ALL = 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea' // all key
export const APIKEY_TEST_UPLOAD = 'c591b04e-cf29-4945-b9a0-776d0672061b' // upload key
export const ORG_ID = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'
export const NON_OWNER_ORG_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
export const USER_ID = '6aa76066-55ef-4238-ade6-0b32334a4097'
export const USER_ID_2 = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
export const USER_EMAIL = 'test@capgo.app'
export const TEST_EMAIL = 'test@test.com'
export const PRODUCT_ID = 'prod_LQIregjtNduh4q'
export const USER_ADMIN_EMAIL = 'admin@capgo.app'
export const APP_NAME = 'com.demo'
export const headers = {
  'Content-Type': 'application/json',
  'Authorization': APIKEY_TEST_ALL,
}
export const headersInternal = {
  'Content-Type': 'application/json',
  'apisecret': API_SECRET,
}

export function makeBaseData(appId: string) {
  return {
    channel: 'production',
    platform: 'android',
    device_id: '00009a6b-eefe-490a-9c60-8e965132ae51',
    app_id: appId,
    custom_id: '',
    version_build: '1.0.0',
    version_code: '1',
    version_os: '13',
    version_name: '1.0.0',
    plugin_version: '7.0.0',
    is_emulator: false,
    is_prod: true,
  }
}
export function getVersionFromAction(action: string): string {
  const sanitizedAction = action.replace(/[^0-9a-z-]/gi, '-')
  return `1.0.0-${sanitizedAction}.1`
}

export async function createAppVersions(version: string, appId: string) {
  const supabase = getSupabaseClient()
  const { error, data } = await supabase.from('app_versions').upsert({
    app_id: appId,
    name: version,
    owner_org: ORG_ID,
  }, {
    onConflict: 'app_id,name',
  }).select('id,name').single()
  if (error) {
    console.error(`Error creating app_version for ${version}:`, error)
  }
  if (!data) {
    throw new Error(`Error creating app_version for ${version}: no data`)
  }
  return data
}

export function getBaseData(appId: string): Partial<ReturnType<typeof makeBaseData>> {
  return structuredClone(makeBaseData(appId))
}
export type HttpMethod = 'POST' | 'PUT' | 'DELETE'

export async function fetchBundle(appId: string) {
  const params = new URLSearchParams({ app_id: appId })
  const response = await fetch(`${BASE_URL}/bundle?${params.toString()}`, {
    method: 'GET',
    headers,
  })
  return { response, data: await response.json() }
}

export async function resetAndSeedAppData(appId: string) {
  const { error } = await getSupabaseClient().rpc('reset_and_seed_app_data', { p_app_id: appId })
  if (error)
    throw error
}
export async function resetAppData(appId: string) {
  const { error } = await getSupabaseClient().rpc('reset_app_data', { p_app_id: appId })
  if (error)
    throw error
}

export async function resetAndSeedAppDataStats(appId: string) {
  const { error } = await getSupabaseClient().rpc('reset_and_seed_app_stats_data', { p_app_id: appId })
  if (error)
    throw error
}
export async function resetAppDataStats(appId: string) {
  const { error } = await getSupabaseClient().rpc('reset_app_stats_data', { p_app_id: appId })
  if (error)
    throw error
}

export function getSupabaseClient(): SupabaseClient<Database> {
  const supabaseUrl = env.SUPABASE_URL ?? ''
  const supabaseServiceKey = env.SUPABASE_SERVICE_KEY ?? ''
  return createClient<Database>(supabaseUrl, supabaseServiceKey)
}

export async function seedTestData(supabase: SupabaseClient, appId: string) {
  const { error } = await supabase.rpc('seed_test_data', { p_app_id: appId })
  if (error)
    throw error
}

export async function createDemoApp(supabase: SupabaseClient, appId: string) {
  const { error } = await supabase.from('apps').insert({ id: appId })
  if (error)
    throw error
}

export function generateUniqueAppId(testName: string): string {
  return `com.demo.${testName.toLowerCase().replace(/\s/g, '_')}_${Date.now()}`
}

export async function cleanupDemoApp(supabase: SupabaseClient, appId: string) {
  const { error } = await supabase.from('apps').delete().eq('id', appId)
  if (error)
    throw error
}

export function updateAndroidBaseData(appId: string) {
  return {
    platform: 'android',
    device_id: '00009a6b-eefe-490a-9c60-8e965132ae51',
    app_id: appId,
    custom_id: '',
    version_build: '1.0',
    version_code: '1',
    version_os: '13',
    version_name: '1.0.0',
    plugin_version: '5.2.1',
    is_emulator: false,
    is_prod: true,
  }
}

export async function responseOk(response: Response, requestName: string): Promise<void> {
  const cloneResponse = response.clone()
  if (!cloneResponse.ok) {
    throw new Error(`${requestName} response not ok: ${cloneResponse.status} ${cloneResponse.statusText} ${await cloneResponse.text()}`)
  }
}

export async function getUpdate(data: ReturnType<typeof updateAndroidBaseData>): Promise<Response> {
  return await fetch(`${BASE_URL}/updates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
}

export function getUpdateBaseData(appId: string): ReturnType<typeof updateAndroidBaseData> {
  return JSON.parse(JSON.stringify(updateAndroidBaseData(appId)))
}

export async function postUpdate(data: object) {
  const response = await fetch(`${BASE_URL}/updates`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  return response
}

export interface DeviceLink {
  channel?: string
  platform?: string
  device_id?: string
  app_id?: string
  custom_id?: string
  version_build?: string
  version_code?: string
  version_os?: string
  version_name?: string
  plugin_version?: string
  is_emulator?: boolean
  is_prod?: boolean
  defaultChannel?: string
}
