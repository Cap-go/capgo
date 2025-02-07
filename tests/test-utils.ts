import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/supabase.types'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'

export const BASE_URL = `${env.SUPABASE_URL}/functions/v1`
export const APIKEY_TEST = 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
export const headers = {
  'Content-Type': 'application/json',
  'Authorization': APIKEY_TEST,
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
    plugin_version: '5.2.1',
    is_emulator: false,
    is_prod: true,
  }
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

export async function resetAndSeedAppDataStats(appId: string) {
  const { error } = await getSupabaseClient().rpc('reset_and_seed_app_stats_data', { p_app_id: appId })
  if (error)
    throw error
}

export function getSupabaseClient(): SupabaseClient<Database> {
  const supabaseUrl = env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
  const supabaseServiceKey = env.SUPABASE_SERVICE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    db: {
      schema: 'public'
    }
  })
}

export async function seedTestData(supabase: SupabaseClient, appId: string) {
  const { error } = await supabase.rpc('reset_and_seed_app_data', { p_app_id: appId })
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
