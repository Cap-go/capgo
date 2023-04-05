import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import type { Person } from './crisp.ts'
import { updatePerson } from './crisp.ts'
import { createCustomer } from './stripe.ts'
import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'
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

export function supabaseClient() {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'), options)
}

// WARNING: The service role key has admin priviliges and should only be used in secure server environments!
export function supabaseAdmin() {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), options)
}

async function allObject<T extends string, R>(all: { [key in T]: PromiseLike<R> }) {
  const allAwaited: { [key in T]: number } = await Object
    .entries(all)
    .reduce(async (acc, [key, value]) => ({
      ...await acc,
      [key]: await value,
    }), Promise.resolve({} as { [key in T]: number }))
  return allAwaited
}

export async function updateOrCreateVersion(update: Database['public']['Tables']['app_versions']['Insert']) {
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

export async function updateOnpremStats(increment: Database['public']['Functions']['increment_store']['Args']) {
  const { error } = await supabaseAdmin()
    .rpc('increment_store', increment)
  if (error)
    console.error('increment_store', error)
}

export async function updateVersionStats(increment: Database['public']['Functions']['update_version_stats']['Args']) {
  const { error } = await supabaseAdmin()
    .rpc('update_version_stats', increment)
  if (error)
    console.error('update_version_stats', error)
}

export async function updateOrAppStats(increment: Database['public']['Functions']['increment_stats_v2']['Args'],
  date_id: string, user_id: string) {
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

export async function updateOrCreateChannel(update: Database['public']['Tables']['channels']['Insert']) {
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

export async function checkAppOwner(userId: string | undefined, appId: string | undefined): Promise<boolean> {
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

export async function updateOrCreateDevice(update: Database['public']['Tables']['devices']['Insert']) {
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

export async function getCurrentPlanName(userId: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin()
      .rpc('get_current_plan_name', { userid: userId })
      .single()
      .throwOnError()
    return data || ''
  }
  catch (error) {
    console.error('getCurrentPlanName error', userId, error)
  }
  return ''
}

export async function getPlanUsagePercent(userId: string, dateid: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .rpc('get_plan_usage_percent', { userid: userId, dateid })
    .single()
  if (error) {
    console.error('getPlanUsagePercent error', error.message)
    throw new Error(error.message)
  }

  return data || 0
}

export async function isGoodPlan(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .rpc('is_good_plan_v3', { userid: userId })
      .single()
      .throwOnError()
    return data || false
  }
  catch (error) {
    console.error('isGoodPlan error', userId, error)
  }
  return false
}

export async function isOnboarded(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .rpc('is_onboarded', { userid: userId })
      .single()
      .throwOnError()
    return data || false
  }
  catch (error) {
    console.error('isOnboarded error', userId, error)
  }
  return false
}

export async function isFreeUsage(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .rpc('is_free_usage', { userid: userId })
      .single()
      .throwOnError()
    return data || false
  }
  catch (error) {
    console.error('isFreeUsage error', userId, error)
  }
  return false
}

export async function isOnboardingNeeded(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .rpc('is_onboarding_needed', { userid: userId })
      .single()
      .throwOnError()
    return data || false
  }
  catch (error) {
    console.error('isOnboardingNeeded error', userId, error)
  }
  return false
}

export async function isCanceled(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .rpc('is_canceled', { userid: userId })
      .single()
      .throwOnError()
    return data || false
  }
  catch (error) {
    console.error('isCanceled error', userId, error)
  }
  return false
}

export async function isPaying(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .rpc('is_paying', { userid: userId })
      .single()
      .throwOnError()
    return data || false
  }
  catch (error) {
    console.error('isPaying error', userId, error)
  }
  return false
}

export async function isTrial(userId: string): Promise<number> {
  try {
    const { data } = await supabaseAdmin()
      .rpc('is_trial', { userid: userId })
      .single()
      .throwOnError()
    return data || 0
  }
  catch (error) {
    console.error('isTrial error', userId, error)
  }
  return 0
}

export async function isAllowedAction(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .rpc('is_allowed_action_user', { userid: userId })
      .single()
      .throwOnError()
    return data || false
  }
  catch (error) {
    console.error('isAllowedAction error', userId, error)
  }
  return false
}

export async function sendStats(action: string, platform: string, device_id: string, app_id: string, version_build: string, versionId: number) {
  const stat: Database['public']['Tables']['stats']['Insert'] = {
    platform: platform as Database['public']['Enums']['platform_os'],
    device_id,
    action,
    app_id,
    version_build,
    version: versionId,
  }
  try {
    const { error: errorDev } = await supabaseAdmin()
      .from('devices')
      .upsert({
        app_id,
        device_id,
        version: versionId,
      })
    if (errorDev)
      console.log('Cannot upsert device', app_id, version_build, errorDev)
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

function allDateIdOfMonth() {
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

export async function createAppStat(userId: string, appId: string, date_id: string) {
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
  //  write in SQL select all id of app_versions who match app_id = "toto" and use the result to find all app_versions_meta and sum all size
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

export async function createApiKey(userId: string) {
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

export function userToPerson(user: Database['public']['Tables']['users']['Row'], customer: Database['public']['Tables']['stripe_info']['Row']): Person {
  const person: Person = {
    id: user.id,
    product_id: customer.product_id,
    customer_id: customer.customer_id,
    nickname: `${user.first_name} ${user.last_name}`,
    avatar: user.image_url ? user.image_url : undefined,
    country: user.country ? user.country : undefined,
  }
  return person
}

export async function saveStoreInfo(apps: (Database['public']['Tables']['store_apps']['Insert'])[]) {
  // save in supabase
  if (!apps.length)
    return
  const noDup = apps.filter((value, index, self) => index === self.findIndex(t => (t.app_id === value.app_id)))
  console.log('saveStoreInfo', noDup.length)
  const { error } = await supabaseAdmin()
    .from('store_apps')
    .upsert(noDup)
  if (error)
    console.error('saveStoreInfo error', error)
}

export async function customerToSegment(userId: string, customer: Database['public']['Tables']['stripe_info']['Row'],
  plan?: Database['public']['Tables']['plans']['Row']): Promise<string[]> {
  const isMonthly = plan?.price_m_id === customer.price_id
  const segments = ['Capgo']
  const trialDaysLeft = await isTrial(userId)
  const paying = await isPaying(userId)
  const canUseMore = await isGoodPlan(userId)
  const onboarded = await isOnboarded(userId)
  const canceled = await isCanceled(userId)

  if (onboarded) {
    segments.push('Onboarded')
  }
  else {
    segments.push('NotOnboarded')
    return segments
  }

  if (canceled)
    segments.push('Canceled')

  else if (!paying && trialDaysLeft > 1 && trialDaysLeft <= 7)
    segments.push('Trial', 'Trial7')

  else if (!paying && trialDaysLeft === 1)
    segments.push('Trial', 'Trial1')

  else if (!paying && !canUseMore)
    segments.push('Trial', 'Trial0')

  else if (paying && !canUseMore && plan)
    segments.push('Paying', plan.name, isMonthly ? 'Monthly' : 'Yearly', 'Overuse')

  else if (paying && canUseMore && plan)
    segments.push('Paying', plan.name, isMonthly ? 'Monthly' : 'Yearly')

  else
    segments.push('Not_found')

  return segments
}

export async function getStripeCustomer(customerId: string) {
  const { data: stripeInfo } = await supabaseAdmin()
    .from('stripe_info')
    .select('*')
    .eq('customer_id', customerId)
    .single()
  return stripeInfo
}

export async function createStripeCustomer(user: Database['public']['Tables']['users']['Row']) {
  const customer = await createCustomer(user.email, user.id, `${user.first_name || ''} ${user.last_name || ''}`)
  // create date + 15 days
  const trial_at = new Date()
  trial_at.setDate(trial_at.getDate() + 15)
  const { error: createInfoError } = await supabaseAdmin()
    .from('stripe_info')
    .insert({
      customer_id: customer.id,
      trial_at: trial_at.toISOString(),
    })
  if (createInfoError)
    console.log('createInfoError', createInfoError)

  const { error: updateUserError } = await supabaseAdmin()
    .from('users')
    .update({
      customer_id: customer.id,
    })
    .eq('id', user.id)
  if (updateUserError)
    console.log('updateUserError', updateUserError)
  const person: Person = {
    id: user.id,
    customer_id: customer.id,
    product_id: 'free',
    nickname: `${user.first_name} ${user.last_name}`,
    avatar: user.image_url ? user.image_url : undefined,
    country: user.country ? user.country : undefined,
  }
  const { data: plan } = await supabaseAdmin()
    .from('plans')
    .select()
    .eq('stripe_id', customer.product_id)
    .single()
  let segment = ['Capgo']
  if (plan)
    segment = await customerToSegment(user.id, customer, plan)
  await updatePerson(user.email, person, segment).catch((e) => {
    console.log('updatePerson error', e)
  })
  console.log('stripe_info done')
}
