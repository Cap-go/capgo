import { createClient } from 'https://esm.sh/@supabase/supabase-js@^1.35.3'
import type { definitions } from './types_supabase.ts'
// Import Supabase client

export interface AppStatsIncrement {
  app_id: string
  date_id: string
  bandwidth: number
  mlu: number
  mlu_real: number
  devices: number
  version_size: number
  channels: number
  shared: number
  versions: number
}
export interface VersionStatsIncrement {
  app_id: string
  version_id: number
  devices: number
}
export const supabaseClient = () => createClient(
  // Supabase API URL - env var exported by default.
  Deno.env.get('SUPABASE_URL') ?? '',
  // Supabase API ANON KEY - env var exported by default.
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
)

// WARNING: The service role key has admin priviliges and should only be used in secure server environments!
export const supabaseAdmin = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

export const updateOrCreateVersion = async (update: Partial<definitions['app_versions']>) => {
  console.log('updateOrCreateVersion', update)
  const { data, error } = await supabaseAdmin()
    .from<definitions['app_versions']>('app_versions')
    .select()
    .eq('app_id', update.app_id)
    .eq('name', update.name)
  if (data && data.length && !error) {
    console.log('update Version')
    update.deleted = false
    return supabaseAdmin()
      .from<definitions['app_versions']>('app_versions')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('name', update.name)
  }
  else {
    return supabaseAdmin()
      .from<definitions['app_versions']>('app_versions')
      .insert(update)
  }
}

export const updateVersionStats = async (increment: VersionStatsIncrement) => {
  const { error } = await supabaseAdmin()
    .rpc('increment_version_stats', increment)
  if (error)
    console.error('increment_stats', error)
}

export const updateOrAppStats = async (increment: AppStatsIncrement, date_id: string, user_id: string) => {
  const { data: dataAppStats } = await supabaseAdmin()
    .from<definitions['app_stats']>('app_stats')
    .select()
    .eq('app_id', increment.app_id)
    .eq('date_id', date_id)
    .single()
  console.log('updateOrAppStats', increment)
  if (dataAppStats) {
    const { error } = await supabaseAdmin()
      .rpc('increment_stats', increment)
    if (error)
      console.error('increment_stats', error)
  }
  else {
    const newDay: definitions['app_stats'] = {
      ...increment,
      user_id,
    }
    const { error } = await supabaseAdmin()
      .from<definitions['app_stats']>('app_stats')
      .insert(newDay)
    if (error)
      console.error('Cannot create app_stats', error)
  }
}

export const updateOrCreateChannel = async (update: Partial<definitions['channels']>) => {
  console.log('updateOrCreateChannel', update)
  if (!update.app_id || !update.name || !update.created_by) {
    console.log('missing app_id, name, or created_by')
    return Promise.reject(new Error('missing app_id, name, or created_by'))
  }
  const { data, error } = await supabaseAdmin()
    .from<definitions['channels']>('channels')
    .select()
    .eq('app_id', update.app_id)
    .eq('name', update.name)
    .eq('created_by', update.created_by)
  if (data && data.length && !error) {
    return supabaseAdmin()
      .from<definitions['channels']>('channels')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('name', update.name)
      .eq('created_by', update.created_by)
  }
  else {
    return supabaseAdmin()
      .from<definitions['channels']>('channels')
      .insert(update)
  }
}

export const checkAppOwner = async (userId: string | undefined, appId: string | undefined): Promise<boolean> => {
  if (!appId || !userId)
    return false
  try {
    const { data, error } = await supabaseAdmin()
      .from<definitions['apps']>('apps')
      .select()
      .eq('user_id', userId)
      .eq('app_id', appId)
    if (!data || !data.length || error)
      return false
    return true
  }
  catch (error) {
    console.log(error)
    return false
  }
}

export const updateOrCreateDevice = async (update: Partial<definitions['devices']>) => {
  console.log('updateOrCreateDevice', update)
  const { data, error } = await supabaseAdmin()
    .from<definitions['devices']>('devices')
    .select()
    .eq('app_id', update.app_id)
    .eq('device_id', update.device_id)
  if (!data || !data.length || error) {
    return supabaseAdmin()
      .from<definitions['devices']>('devices')
      .insert(update)
  }
  else {
    return supabaseAdmin()
      .from<definitions['devices']>('devices')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('device_id', update.device_id)
  }
}

export const getCurrentPlanName = async (userId: string): Promise<string> => {
  const { data, error } = await supabaseAdmin()
    .rpc<string>('get_current_plan_name', { userid: userId })
    .single()
  if (error)
    throw error

  return data || 'Free'
}

export const isGoodPlan = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc<boolean>('is_good_plan_v2', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}

export const isPaying = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc<boolean>('is_paying', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}

export const isTrial = async (userId: string): Promise<number> => {
  const { data, error } = await supabaseAdmin()
    .rpc<number>('is_trial', { userid: userId })
    .single()
  if (error)
    throw error

  return data || 0
}

export const checkPlanValid = async (userId: string) => {
  const validPlan = await isGoodPlan(userId)
  const paying = await isPaying(userId)
  const trialDays = await isTrial(userId)
  return (paying && validPlan) || (!paying && trialDays > 0)
}

export const sendStats = async (action: string, platform: string, device_id: string, app_id: string, version_build: string, versionId: number) => {
  const stat: Partial<definitions['stats']> = {
    platform: platform as definitions['stats']['platform'],
    device_id,
    action,
    app_id,
    version_build,
    version: versionId,
  }
  try {
    const { error } = await supabaseAdmin()
      .from<definitions['stats']>('stats')
      .insert(stat)
    if (error)
      console.log('Cannot insert stat', app_id, version_build, error)
  }
  catch (err) {
    console.log('Cannot insert stats', app_id, err)
  }
}
