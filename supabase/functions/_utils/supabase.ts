import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.1.2'
import { updatePerson } from './crisp.ts'
import { createCustomer } from './stripe.ts'
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

const allObject = async <T extends string, R>(all: { [key in T]: PromiseLike<R> }) => {
  const allAwaited: { [key in T]: number } = await Object
    .entries(all)
    .reduce(async (acc, [key, value]) => ({
      ...await acc,
      [key]: await value,
    }), Promise.resolve({} as { [key in T]: number }))
  return allAwaited
}

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

export const updateOrAppStats = async (increment: Database['public']['Functions']['increment_stats_v2']['Args'],
  date_id: string, user_id: string) => {
  const { data: dataAppStats } = await supabaseAdmin()
    .from('app_stats')
    .select()
    .eq('app_id', increment.app_id)
    .eq('date_id', date_id)
    .single()
  console.log('updateOrAppStats', increment, !!dataAppStats)
  if (dataAppStats) {
    const { error } = await supabaseAdmin()
      .rpc('increment_stats_v2', increment)
    if (error)
      console.error('increment_stats_v2', error)
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
  const { data } = await supabaseAdmin()
    .from('channels')
    .select()
    .eq('app_id', update.app_id)
    .eq('name', update.name)
    .eq('created_by', update.created_by)
    .single()
  if (data) {
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
  const { data } = await supabaseAdmin()
    .from('devices')
    .select()
    .eq('app_id', update.app_id)
    .eq('device_id', update.device_id)
    .single()
  console.log('updateOrCreateDevice', update, !!data)
  if (data) {
    return supabaseAdmin()
      .from('devices')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('device_id', update.device_id)
  }
  else {
    return supabaseAdmin()
      .from('devices')
      .insert(update)
  }
}

export const getCurrentPlanName = async (userId: string): Promise<string> => {
  const { data, error } = await supabaseAdmin()
    .rpc('get_current_plan_name', { userid: userId })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || 'Free'
}

export const getPlanUsagePercent = async (userId: string, dateid: string): Promise<number> => {
  const { data, error } = await supabaseAdmin()
    .rpc('get_plan_usage_percent', { userid: userId, dateid })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || 0
}

export const isGoodPlan = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_good_plan_v3', { userid: userId })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || false
}

export const isOnboarded = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_onboarded', { userid: userId })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || false
}

export const isFreeUsage = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_free_usage', { userid: userId })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || false
}

export const isOnboardingNeeded = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_onboarding_needed', { userid: userId })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || false
}

export const isPaying = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_paying', { userid: userId })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || false
}

export const isTrial = async (userId: string): Promise<number> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_trial', { userid: userId })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || 0
}

export const isAllowedAction = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin()
    .rpc('is_allowed_action_user', { userid: userId })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

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

const allDateIdOfMonth = () => {
  const date_id = new Date().toISOString().slice(0, 7)
  const lastDay = new Date(new Date().getFullYear(), new Date().getMonth(), 0)
  const days = []
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const day = new Date(new Date().getFullYear(), new Date().getMonth(), d).getDate()
    days.push(`${date_id}-${day}`)
  }
  // console.log('days', days)
  return days
}

export const createAppStat = async (userId: string, appId: string, date_id: string) => {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  // console.log('req', req)
  const mlu = supabaseAdmin()
    .from('stats')
    .select('app_id', { count: 'exact', head: true })
    .eq('app_id', appId)
    .lte('created_at', lastDay.toISOString())
    .gte('created_at', firstDay.toISOString())
    .eq('action', 'get')
    .then(res => res.count || 0)
  const mlu_real = supabaseAdmin()
    .from('stats')
    .select('app_id', { count: 'exact', head: true })
    .eq('app_id', appId)
    .lte('created_at', lastDay.toISOString())
    .gte('created_at', firstDay.toISOString())
    .eq('action', 'set')
    .then(res => res.count || 0)
  const devices = supabaseAdmin()
    .from('devices')
    .select('device_id', { count: 'exact', head: true })
    .eq('app_id', appId)
    .eq('is_emulator', false)
    .eq('is_prod', true)
    .lte('updated_at', lastDay.toISOString())
    .gte('updated_at', firstDay.toISOString())
    .then(res => res.count || 0)
  const devices_real = supabaseAdmin()
    .from('devices')
    .select('device_id', { count: 'exact', head: true })
    .eq('app_id', appId)
    .lte('updated_at', lastDay.toISOString())
    .gte('updated_at', firstDay.toISOString())
    .then(res => res.count || 0)
  const bandwidth = supabaseAdmin()
    .from('app_stats')
    .select('bandwidth')
    .eq('app_id', appId)
    .in('date_id', allDateIdOfMonth())
    .then(res => (res.data ? res.data : []).reduce((acc, cur) => acc + (cur.bandwidth || 0), 0))
  const version_size = supabaseAdmin()
    .from('app_versions_meta')
    .select('size')
    .eq('app_id', appId)
    .eq('user_id', userId)
    .then(res => (res.data ? res.data : []).reduce((acc, cur) => acc + (cur.size || 0), 0))
  const versions = supabaseAdmin()
    .from('app_versions')
    .select('id', { count: 'exact', head: true })
    .eq('app_id', appId)
    .eq('user_id', userId)
    .eq('deleted', false)
    .then(res => res.count || 0)
  const shared = supabaseAdmin()
    .from('channel_users')
    .select('id', { count: 'exact', head: true })
    .eq('app_id', appId)
    .then(res => res.count || 0)
  const channels = supabaseAdmin()
    .from('channels')
    .select('id', { count: 'exact', head: true })
    .eq('app_id', appId)
    .then(res => res.count || 0)
  const all = { mlu, mlu_real, devices, devices_real, bandwidth, version_size, versions, shared, channels }
  type Keys = keyof typeof all
  const allAwaited = await allObject<Keys, number>(all)
  const newData = {
    app_id: appId,
    user_id: userId,
    date_id,
    ...allAwaited,
  }
  return newData
}

export const createApiKey = async (userId: string) => {
  // check if user has apikeys
  const total = await supabaseAdmin()
    .from('apikeys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .then(res => res.count || 0)

  if (total === 0) {
    // create apikeys
    return supabaseAdmin()
      .from('apikeys')
      .insert([
        {
          user_id: userId,
          key: crypto.randomUUID(),
          mode: 'all',
        },
        {
          user_id: userId,
          key: crypto.randomUUID(),
          mode: 'upload',
        },
        {
          user_id: userId,
          key: crypto.randomUUID(),
          mode: 'read',
        }])
  }
  return Promise.resolve()
}

export const createStripeCustomer = async (userId: string, email: string) => {
  const customer = await createCustomer(userId)
  await supabaseAdmin()
    .from('stripe_info')
    .insert({
      customer_id: customer.id,
    })
  await supabaseAdmin()
    .from('users')
    .update({
      customer_id: customer.id,
    })
    .eq('id', userId)
  await updatePerson(email, {
    id: userId,
    customer_id: customer.id,
    product_id: 'free',
  }).catch((e) => {
    console.log('updatePerson error', e)
  })
  console.log('stripe_info done')
}
