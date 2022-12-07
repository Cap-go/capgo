import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.1.2'
import type { Database } from './supabase.types.ts'
// Import Supabase client

export interface InsertPayload<T extends keyof Database['public']['Tables']> {
  type: 'INSERT'
  table: string
  schema: string
  record: Database['public']['Tables'][T]['Insert']
  old_record: null
}
export interface UpdatePayload<T extends keyof Database['public']['Tables']> {
  type: 'UPDATE'
  table: string
  schema: string
  record: Database['public']['Tables'][T]['Update']
  old_record: Database['public']['Tables'][T]['Row']
}
export interface DeletePayload<T extends keyof Database['public']['Tables']> {
  type: 'DELETE'
  table: string
  schema: string
  record: null
  old_record: Database['public']['Tables'][T]['Row']
}
export interface AppStatsIncrement {
  app_id: string
  date_id: string
  bandwidth: number
  mlu: number
  mlu_real: number
  devices: number
  // devices_real: number
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
export const supabaseClient = () => createClient<Database>(
  // Supabase API URL - env var exported by default.
  Deno.env.get('SUPABASE_URL') ?? '',
  // Supabase API ANON KEY - env var exported by default.
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
)

// WARNING: The service role key has admin priviliges and should only be used in secure server environments!
export const supabaseAdmin = () => createClient<Database>(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

export const updateOrCreateVersion = async (update: Database['public']['Tables']['app_versions']['Insert']) => {
  console.log('updateOrCreateVersion', update)
  const { data } = await supabaseAdmin()
    .from('app_versions')
    .select()
    .eq('app_id', update.app_id)
    .eq('name', update.name)
    .single()
  if (data) {
    console.log('update Version')
    update.deleted = false
    return supabaseAdmin()
      .from('app_versions')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('name', update.name)
  }
  else {
    return supabaseAdmin()
      .from('app_versions')
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
    .from('app_stats')
    .select()
    .eq('app_id', increment.app_id)
    .eq('date_id', date_id)
  console.log('updateOrAppStats', increment)
  if (dataAppStats) {
    const { error } = await supabaseAdmin()
      .rpc('increment_stats', increment)
    if (error)
      console.error('increment_stats', error)
  }
  else {
    const newDay: Database['public']['Tables']['app_stats']['Insert'] = {
      ...increment,
      devices_real: 0,
      user_id,
    }
    const { error } = await supabaseAdmin()
      .from('app_stats')
      .insert(newDay)
    if (error)
      console.error('Cannot create app_stats', error)
  }
}

export const updateOrCreateChannel = async (update: Database['public']['Tables']['channels']['Insert']) => {
  console.log('updateOrCreateChannel', update)
  if (!update.app_id || !update.name || !update.created_by) {
    console.log('missing app_id, name, or created_by')
    return Promise.reject(new Error('missing app_id, name, or created_by'))
  }
  const { data, error } = await supabaseAdmin()
    .from('channels')
    .select()
    .eq('app_id', update.app_id)
    .eq('name', update.name)
    .eq('created_by', update.created_by)
  if (data && data.length && !error) {
    return supabaseAdmin()
      .from('channels')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('name', update.name)
      .eq('created_by', update.created_by)
  }
  else {
    return supabaseAdmin()
      .from('channels')
      .insert(update)
  }
}

export const checkAppOwner = async (userId: string | undefined, appId: string | undefined): Promise<boolean> => {
  if (!appId || !userId)
    return false
  try {
    const { data, error } = await supabaseAdmin()
      .from('apps')
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

export const updateOrCreateDevice = async (update: Database['public']['Tables']['devices']['Insert']) => {
  console.log('updateOrCreateDevice', update)
  const { data } = await supabaseAdmin()
    .from('devices')
    .select()
    .eq('app_id', update.app_id)
    .eq('device_id', update.device_id)
    .single()
  if (!data) {
    return supabaseAdmin()
      .from('devices')
      .insert(update)
  }
  else {
    return supabaseAdmin()
      .from('devices')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('device_id', update.device_id)
  }
}

export const getCurrentPlanName = async (userId: string): Promise<string> => {
  const { data, error } = await supabaseAdmin()
    .rpc('get_current_plan_name', { userid: userId })
    .single()
  if (error)
    throw error

  return data || 'Free'
}

export const isGoodPlan = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_good_plan_v2', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}

export const isPaying = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_paying', { userid: userId })
    .single()
  if (error)
    throw error

  return data || false
}

export const isTrial = async (userId: string): Promise<number> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_trial', { userid: userId })
    .single()
  if (error)
    throw error

  return data || 0
}

export const isAllowedAction = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_allowed_action_user', { userid: userId })
    .single()
  if (error)
    throw error

  return data
}

export const sendStats = async (action: string, platform: string, device_id: string, app_id: string, version_build: string, versionId: number) => {
  const stat: Database['public']['Tables']['stats']['Insert'] = {
    platform: platform as Database['public']['Enums']['platform_os'],
    device_id,
    action,
    app_id,
    version_build,
    version: versionId,
  }
  try {
    const { error } = await supabaseAdmin()
      .from('stats')
      .insert(stat)
    if (error)
      console.log('Cannot insert stat', app_id, version_build, error)
  }
  catch (err) {
    console.log('Cannot insert stats', app_id, err)
  }
}
