import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import type { DeviceWithoutCreatedAt, Order, ReadDevicesParams, ReadStatsParams } from './types.ts'
import { createClient } from '@supabase/supabase-js'
import { type AuthInfo, type MiddlewareKeyVariables, simpleError } from './hono.ts'
import { cloudlog, cloudlogErr } from './loggin.ts'
import { createCustomer } from './stripe.ts'
import { getEnv } from './utils.ts'

const DEFAULT_LIMIT = 1000
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

export function supabaseClient(c: Context, jwt: string) {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: jwt } },
  }
  return createClient<Database>(getEnv(c, 'SUPABASE_URL'), getEnv(c, 'SUPABASE_ANON_KEY'), options)
}

export function supabaseWithAuth(c: Context, auth: AuthInfo) {
  if (auth.authType === 'jwt' && auth.jwt) {
    return supabaseClient(c, auth.jwt)
  }
  else if (auth.authType === 'apikey' && auth.apikey) {
    return supabaseApikey(c, auth.apikey.key)
  }
  else {
    throw simpleError('not_authorized', 'Not authorized')
  }
}

export function emptySupabase(c: Context) {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(getEnv(c, 'SUPABASE_URL'), getEnv(c, 'SUPABASE_ANON_KEY'), options)
}

// WARNING: The service role key has admin priviliges and should only be used in secure server environments!
export function supabaseAdmin(c: Context) {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(getEnv(c, 'SUPABASE_URL'), getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY'), options)
}

export function supabaseApikey(c: Context, apikey: string) {
  cloudlog({ requestId: c.get('requestId'), message: 'supabaseApikey', apikey })
  return createClient<Database>(getEnv(c, 'SUPABASE_URL'), getEnv(c, 'SUPABASE_ANON_KEY'), {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        capgkey: apikey,
      },
    },
  })
}

export async function getAppsFromSB(c: Context): Promise<string[]> {
  const limit = 1000
  let page = 0
  let apps: string[] = []

  while (true) {
    const { data, error } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id')
      .range(page * limit, (page + 1) * limit - 1)

    if (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting apps from Supabase', error })
      break
    }

    if (data.length === 0)
      break

    apps = [...apps, ...data.map(row => row.app_id)]
    page++
  }

  return apps
}

export async function updateOrCreateChannel(c: Context, update: Database['public']['Tables']['channels']['Insert']) {
  cloudlog({ requestId: c.get('requestId'), message: 'updateOrCreateChannel', update })
  if (!update.app_id || !update.name || !update.created_by) {
    cloudlog({ requestId: c.get('requestId'), message: 'missing app_id, name, or created_by' })
    return Promise.reject(new Error('missing app_id, name, or created_by'))
  }

  const { data: existingChannel } = await supabaseAdmin(c)
    .from('channels')
    .select('*')
    .eq('app_id', update.app_id)
    .eq('name', update.name)
    .eq('created_by', update.created_by)
    .single()

  if (existingChannel) {
    const fieldsDiffer = Object.keys(update).some(key =>
      (update as any)[key] !== (existingChannel as any)[key] && key !== 'created_at' && key !== 'updated_at',
    )
    if (!fieldsDiffer) {
      cloudlog({ requestId: c.get('requestId'), message: 'No fields differ, no update needed' })
      return Promise.resolve({ error: null, requestId: c.get('requestId') })
    }
  }

  return supabaseAdmin(c)
    .from('channels')
    .upsert(update, { onConflict: 'app_id, name' })
    .throwOnError()
}

export async function updateOrCreateChannelDevice(c: Context, update: Database['public']['Tables']['channel_devices']['Insert']) {
  cloudlog({ requestId: c.get('requestId'), message: 'updateOrCreateChannelDevice', update })
  if (!update.device_id || !update.channel_id || !update.app_id) {
    cloudlog({ requestId: c.get('requestId'), message: 'missing device_id, channel_id, or app_id' })
    return Promise.reject(new Error('missing device_id, channel_id, or app_id'))
  }
  const { data: existingChannelDevice } = await supabaseAdmin(c)
    .from('channel_devices')
    .select('*')
    .eq('device_id', update.device_id)
    .eq('channel_id', update.channel_id)
    .eq('app_id', update.app_id)
    .single()

  if (existingChannelDevice) {
    const fieldsDiffer = Object.keys(update).some(key =>
      (update as any)[key] !== (existingChannelDevice as any)[key] && key !== 'created_at' && key !== 'updated_at',
    )
    if (!fieldsDiffer) {
      cloudlog({ requestId: c.get('requestId'), message: 'No fields differ, no update needed' })
      return Promise.resolve()
    }
  }

  return supabaseAdmin(c)
    .from('channel_devices')
    .upsert(update, { onConflict: 'device_id, channel_id, app_id' })
}

export async function checkAppOwner(c: Context, userId: string | undefined, appId: string | undefined): Promise<boolean> {
  if (!appId || !userId)
    return false
  try {
    const { data, error } = await supabaseAdmin(c)
      .from('apps')
      .select()
      .eq('user_id', userId)
      .eq('app_id', appId)
    if (!data?.length || error)
      return false
    return true
  }
  catch (error) {
    cloudlogErr(error)
    return false
  }
}

export async function hasAppRight(c: Context, appId: string | undefined, userid: string, right: Database['public']['Enums']['user_min_right']) {
  if (!appId)
    return false

  const { data, error } = await supabaseAdmin(c)
    .rpc('has_app_right_userid', { appid: appId, right, userid })

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'has_app_right_userid error', error })
    return false
  }

  return data
}

export async function hasAppRightApikey(c: Context<MiddlewareKeyVariables, any, object>, appId: string | undefined, userid: string, right: Database['public']['Enums']['user_min_right'], apikey: string) {
  if (!appId)
    return false

  cloudlog({ requestId: c.get('requestId'), message: 'hasAppRightApikey', appId, userid, right, apikey })

  const { data, error } = await supabaseAdmin(c)
    .rpc('has_app_right_apikey', { appid: appId, right, userid, apikey })

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'has_app_right_userid error', error })
    return false
  }

  return data
}

export function apikeyHasOrgRight(key: Database['public']['Tables']['apikeys']['Row'], orgId: string) {
  if (!key.limited_to_orgs || key.limited_to_orgs.length === 0)
    return true
  return key.limited_to_orgs.includes(orgId)
}

export async function hasOrgRight(c: Context, orgId: string, userId: string, right: Database['public']['Enums']['user_min_right']) {
  const userRight = await supabaseAdmin(c).rpc('check_min_rights', {
    min_right: right,
    org_id: orgId,
    user_id: userId,
    channel_id: null as any,
    app_id: null as any,
  })

  cloudlog({ requestId: c.get('requestId'), message: 'check_min_rights (hasOrgRight)', userRight })

  if (userRight.error || !userRight.data) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'check_min_rights (hasOrgRight) error', error: userRight.error })
    return false
  }

  return userRight.data
}

export async function hasOrgRightApikey(c: Context, orgId: string, userId: string, right: Database['public']['Enums']['user_min_right'], apikey: string) {
  const userRight = await supabaseApikey(c, apikey).rpc('check_min_rights', {
    min_right: right,
    org_id: orgId,
    user_id: userId,
    channel_id: null as any,
    app_id: null as any,
  })

  cloudlog({ requestId: c.get('requestId'), message: 'check_min_rights (hasOrgRight)', userRight })

  if (userRight.error || !userRight.data) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'check_min_rights (hasOrgRight) error', error: userRight.error })
    return false
  }

  return userRight.data
}

interface PlanTotal {
  mau: number
  bandwidth: number
  storage: number
  get: number
  fail: number
  install: number
  uninstall: number
}

export async function getTotalStats(c: Context, orgId?: string): Promise<PlanTotal> {
  if (!orgId) {
    return {
      mau: 0,
      bandwidth: 0,
      storage: 0,
      get: 0,
      fail: 0,
      install: 0,
      uninstall: 0,
    }
  }
  const { data, error } = await supabaseAdmin(c)
    .rpc('get_total_metrics', { org_id: orgId })
    .single()
  if (error)
    throw new Error(error.message)
  return data
}

export interface PlanUsage {
  total_percent: number
  mau_percent: number
  bandwidth_percent: number
  storage_percent: number
}

export async function getPlanUsagePercent(c: Context, orgId?: string): Promise<PlanUsage> {
  if (!orgId) {
    return {
      total_percent: 0,
      mau_percent: 0,
      bandwidth_percent: 0,
      storage_percent: 0,
    }
  }
  const { data, error } = await supabaseAdmin(c)
    .rpc('get_plan_usage_percent_detailed', { orgid: orgId })
    .single()
  if (error)
    throw new Error(error.message)
  return data
}

export async function isGoodPlanOrg(c: Context, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('is_good_plan_v5_org', { orgid: orgId })
      .single()
      .throwOnError()
    return data ?? false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isGoodPlan error', orgId, error })
  }
  return false
}

export async function isOnboardedOrg(c: Context, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('is_onboarded_org', { orgid: orgId })
      .single()
      .throwOnError()
    return data ?? false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isOnboarded error', orgId, error })
  }
  return false
}

export async function set_mau_exceeded(c: Context, orgId: string, disabled: boolean): Promise<boolean> {
  const { error } = await supabaseAdmin(c).rpc('set_mau_exceeded_by_org', { org_id: orgId, disabled })
  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'set_mau_exceeded error', orgId, error })
    return false
  }
  return true
}

export async function set_storage_exceeded(c: Context, orgId: string, disabled: boolean): Promise<boolean> {
  const { error } = await supabaseAdmin(c).rpc('set_storage_exceeded_by_org', { org_id: orgId, disabled })
  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'set_download_disabled error', orgId, error })
    return false
  }
  return true
}

export async function set_bandwidth_exceeded(c: Context, orgId: string, disabled: boolean): Promise<boolean> {
  const { error } = await supabaseAdmin(c).rpc('set_bandwidth_exceeded_by_org', { org_id: orgId, disabled })
  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'set_bandwidth_exceeded error', orgId, error })
    return false
  }
  return true
}

export async function isOnboardingNeeded(c: Context, userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('is_onboarding_needed_org', { orgid: userId })
      .single()
      .throwOnError()
    return data ?? false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isOnboardingNeeded error', userId, error })
  }
  return false
}

export async function isCanceledOrg(c: Context, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('is_canceled_org', { orgid: orgId })
      .single()
      .throwOnError()
    return data ?? false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isCanceled error', orgId, error })
  }
  return false
}

export async function isPayingOrg(c: Context, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('is_paying_org', { orgid: orgId })
      .single()
      .throwOnError()
    return data ?? false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isPayingOrg error', orgId, error })
  }
  return false
}

export async function isTrialOrg(c: Context, orgId: string): Promise<number> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('is_trial_org', { orgid: orgId })
      .single()
      .throwOnError()
    return data ?? 0
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isTrialOrg error', orgId, error })
  }
  return 0
}

export async function isAdmin(c: Context, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin(c)
    .rpc('is_admin', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data ?? false
}

export async function isAllowedActionOrg(c: Context, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('is_allowed_action_org', { orgid: orgId })
      .single()
      .throwOnError()
    return data ?? false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isAllowedActionOrg error', orgId, error })
  }
  return false
}

export async function createApiKey(c: Context, userId: string) {
  // check if user has apikeys
  if (!userId) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'createApiKey error', userId, error: 'userId is null' })
    return
  }
  const total = await supabaseAdmin(c)
    .from('apikeys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .then(res => res.count ?? null)
  if (total === null) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'createApiKey error', userId, error: 'total is null' })
    return
  }
  if (total === 0) {
    // create apikeys
    return supabaseAdmin(c)
      .from('apikeys')
      .insert([
        {
          user_id: userId,
          key: crypto.randomUUID(),
          mode: 'all',
          name: 'all',
        },
        {
          user_id: userId,
          key: crypto.randomUUID(),
          mode: 'upload',
          name: 'upload',
        },
        {
          user_id: userId,
          key: crypto.randomUUID(),
          mode: 'read',
          name: 'read',
        },
      ])
  }
  return Promise.resolve()
}

export async function customerToSegmentOrg(
  c: Context,
  orgId: string,
  price_id?: string | null,
  plan?: Database['public']['Tables']['plans']['Row'] | null,
): Promise<{ segments: string[], deleteSegments: string[] }> {
  const segmentsObj = {
    capgo: true,
    onboarded: await isOnboardedOrg(c, orgId),
    trial: false,
    trial7: false,
    trial1: false,
    trial0: false,
    paying: false,
    payingMonthly: plan?.price_m_id === price_id,
    plan: plan?.name ?? '',
    overuse: false,
    canceled: await isCanceledOrg(c, orgId),
    issueSegment: false,
  }

  const trialDaysLeft = await isTrialOrg(c, orgId)
  const paying = await isPayingOrg(c, orgId)
  const canUseMore = await isGoodPlanOrg(c, orgId)

  if (!segmentsObj.onboarded) {
    return processSegments(segmentsObj)
  }

  if (!paying && trialDaysLeft > 1 && trialDaysLeft <= 7) {
    segmentsObj.trial = true
    segmentsObj.trial7 = true
  }
  else if (!paying && trialDaysLeft === 1) {
    segmentsObj.trial = true
    segmentsObj.trial1 = true
  }
  else if (!paying && !canUseMore) {
    segmentsObj.trial = true
    segmentsObj.trial0 = true
  }
  else if (paying && !canUseMore && plan) {
    segmentsObj.overuse = true
    segmentsObj.paying = true
  }
  else if (paying && canUseMore && plan) {
    segmentsObj.paying = true
  }
  else {
    segmentsObj.issueSegment = true
  }

  return processSegments(segmentsObj)
}

function processSegments(segmentsObj: any): { segments: string[], deleteSegments: string[] } {
  const segments: string[] = []
  const deleteSegments: string[] = []

  Object.entries(segmentsObj).forEach(([key, value]) => {
    if (typeof value === 'boolean') {
      if (value)
        segments.push(key)
      else
        deleteSegments.push(key)
    }
    else if (typeof value === 'string' && value !== '') {
      segments.push(`${key}:${value}`)
    }
  })

  return { segments, deleteSegments }
}

export async function getStripeCustomer(c: Context, customerId: string) {
  const { data: stripeInfo } = await supabaseAdmin(c)
    .from('stripe_info')
    .select('*')
    .eq('customer_id', customerId)
    .single()
  return stripeInfo
}

export async function getDefaultPlan(c: Context) {
  const { data: plan } = await supabaseAdmin(c)
    .from('plans')
    .select()
    .eq('name', 'Solo')
    .single()
  return plan
}

export async function createStripeCustomer(c: Context, org: Database['public']['Tables']['orgs']['Row']) {
  const customer = await createCustomer(c, org.management_email, org.created_by, org.name)
  // create date + 15 days
  const trial_at = new Date()
  trial_at.setDate(trial_at.getDate() + 15)
  const soloPlan = await getDefaultPlan(c)
  if (!soloPlan) {
    cloudlog({ requestId: c.get('requestId'), message: 'no default plan' })
    throw new Error('no default plan')
  }
  cloudlog({ requestId: c.get('requestId'), message: 'createInfo', soloPlan, customer })
  const { error: createInfoError } = await supabaseAdmin(c)
    .from('stripe_info')
    .insert({
      product_id: soloPlan.stripe_id,
      customer_id: customer.id,
      trial_at: trial_at.toISOString(),
    })
  if (createInfoError)
    cloudlog({ requestId: c.get('requestId'), message: 'createInfoError', createInfoError })

  const { error: updateUserError } = await supabaseAdmin(c)
    .from('orgs')
    .update({
      customer_id: customer.id,
    })
    .eq('id', org.id)
  if (updateUserError)
    cloudlog({ requestId: c.get('requestId'), message: 'updateUserError', updateUserError })
  cloudlog({ requestId: c.get('requestId'), message: 'stripe_info done' })
}

export function trackBandwidthUsageSB(
  c: Context,
  deviceId: string,
  appId: string,
  fileSize: number,
) {
  return supabaseAdmin(c)
    .from('bandwidth_usage')
    .insert([
      {
        device_id: deviceId.toLowerCase(),
        app_id: appId,
        file_size: fileSize,
      },
    ])
}

export function trackVersionUsageSB(
  c: Context,
  versionId: number,
  appId: string,
  action: Database['public']['Enums']['version_action'],
) {
  return supabaseAdmin(c)
    .from('version_usage')
    .insert([
      {
        version_id: versionId,
        app_id: appId,
        action,
      },
    ])
}

export function trackDeviceUsageSB(
  c: Context,
  deviceId: string,
  appId: string,
) {
  return supabaseAdmin(c)
    .from('device_usage')
    .insert([
      {
        device_id: deviceId.toLowerCase(),
        app_id: appId,
      },
    ])
}

export function trackMetaSB(
  c: Context,
  app_id: string,
  version_id: number,
  size: number,
) {
  cloudlog({ requestId: c.get('requestId'), message: 'createStatsMeta', app_id, version_id, size })
  return supabaseAdmin(c)
    .rpc('upsert_version_meta', {
      p_app_id: app_id,
      p_version_id: version_id,
      p_size: size,
    })
}

export function trackDevicesSB(c: Context, device: DeviceWithoutCreatedAt) {
  cloudlog({ requestId: c.get('requestId'), message: 'trackDevicesSB', device })
  return supabaseAdmin(c)
    .from('devices')
    .upsert(
      {
        app_id: device.app_id,
        updated_at: new Date().toISOString(),
        device_id: device.device_id,
        platform: device.platform,
        plugin_version: device.plugin_version,
        os_version: device.os_version,
        version_build: device.version_build,
        custom_id: device.custom_id,
        version: device.version,
        is_prod: device.is_prod,
        is_emulator: device.is_emulator,
      },
      { onConflict: 'device_id,app_id' },
    )
}

export function trackLogsSB(c: Context, app_id: string, device_id: string, action: Database['public']['Enums']['stats_action'], version_id: number) {
  return supabaseAdmin(c)
    .from('stats')
    .insert(
      {
        app_id,
        created_at: new Date().toISOString(),
        device_id,
        action,
        version: version_id,
      },
    )
}

export async function readDeviceUsageSB(c: Context, app_id: string, period_start: string, period_end: string) {
  const { data } = await supabaseAdmin(c)
    .rpc('read_device_usage', { p_app_id: app_id, p_period_start: period_start, p_period_end: period_end })
  return data ?? []
}

export async function readBandwidthUsageSB(c: Context, app_id: string, period_start: string, period_end: string) {
  const { data } = await supabaseAdmin(c)
    .rpc('read_bandwidth_usage', { p_app_id: app_id, p_period_start: period_start, p_period_end: period_end })
  return data ?? []
}

export async function readStatsStorageSB(c: Context, app_id: string, period_start: string, period_end: string) {
  const { data } = await supabaseAdmin(c)
    .rpc('read_storage_usage', { p_app_id: app_id, p_period_start: period_start, p_period_end: period_end })
  return data ?? []
}

export async function readStatsVersionSB(c: Context, app_id: string, period_start: string, period_end: string) {
  const { data } = await supabaseAdmin(c)
    .rpc('read_version_usage', { p_app_id: app_id, p_period_start: period_start, p_period_end: period_end })
  return data ?? []
}

export async function readStatsSB(c: Context, params: ReadStatsParams) {
  const supabase = supabaseAdmin(c)

  let query = supabase
    .from('stats')
    .select('*')
    .eq('app_id', params.app_id)
    .limit(params.limit ?? DEFAULT_LIMIT)

  if (params.start_date)
    query = query.gte('created_at', new Date(params.start_date).toISOString())

  if (params.end_date)
    query = query.lt('created_at', new Date(params.end_date).toISOString())

  if (params.deviceIds?.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'deviceIds', deviceIds: params.deviceIds })
    if (params.deviceIds.length === 1)
      query = query.eq('device_id', params.deviceIds[0])
    else
      query = query.in('device_id', params.deviceIds)
  }

  if (params.search) {
    cloudlog({ requestId: c.get('requestId'), message: 'search', search: params.search })
    if (params.deviceIds?.length)
      query = query.ilike('version_build', `${params.search}%`)
    else
      query = query.or(`device_id.ilike.${params.search}%,version_build.ilike.${params.search}%`)
  }

  if (params.order?.length) {
    params.order.forEach((col: Order) => {
      if (col.sortable && typeof col.sortable === 'string') {
        cloudlog({ requestId: c.get('requestId'), message: 'order', key: col.key, sortable: col.sortable })
        query = query.order(col.key as string, { ascending: col.sortable === 'asc' })
      }
    })
  }

  const { data, error } = await query

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading stats list', error })
    return []
  }

  return data ?? []
}

export async function readDevicesSB(c: Context, params: ReadDevicesParams) {
  const supabase = supabaseAdmin(c)

  cloudlog({ requestId: c.get('requestId'), message: 'readDevicesSB', params })
  let query = supabase
    .from('devices')
    .select('*')
    .eq('app_id', params.app_id)
    .range(params.rangeStart ?? 0, params.rangeEnd ?? DEFAULT_LIMIT)
    .limit(params.limit ?? DEFAULT_LIMIT)

  if (params.deviceIds?.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'deviceIds', deviceIds: params.deviceIds })
    if (params.deviceIds.length === 1)
      query = query.eq('device_id', params.deviceIds[0])
    else
      query = query.in('device_id', params.deviceIds)
  }

  if (params.search) {
    cloudlog({ requestId: c.get('requestId'), message: 'search', search: params.search })
    if (params.deviceIds?.length)
      query = query.ilike('custom_id', `${params.search}%`)
    else
      query = query.or(`device_id.ilike.${params.search}%,custom_id.ilike.${params.search}%`)
  }
  if (params.order?.length) {
    params.order.forEach((col) => {
      if (col.sortable && typeof col.sortable === 'string') {
        cloudlog({ requestId: c.get('requestId'), message: 'order', key: col.key, sortable: col.sortable })
        query = query.order(col.key as string, { ascending: col.sortable === 'asc' })
      }
    })
  }
  if (params.version_id)
    query = query.eq('version_id', params.version_id)

  const { data, error } = await query

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error reading device list', error })
    return []
  }

  return data ?? []
}

export async function countDevicesSB(c: Context, app_id: string) {
  const { count } = await supabaseAdmin(c)
    .from('devices')
    .select('device_id', { count: 'exact', head: true })
    .eq('app_id', app_id)
  return count ?? 0
}

const DEFAUL_PLAN_NAME = 'Solo'

export async function getCurrentPlanNameOrg(c: Context, orgId?: string): Promise<string> {
  if (!orgId)
    return DEFAUL_PLAN_NAME
  const { data, error } = await supabaseAdmin(c)
    .rpc('get_current_plan_name_org', { orgid: orgId })
    .single()
  if (error)
    throw new Error(error.message)

  return data ?? DEFAUL_PLAN_NAME
}

interface UpdateStats {
  apps: {
    app_id: string
    failed: number
    set: number
    get: number
    success_rate: number
    healthy: boolean
  }[]
  total: {
    failed: number
    set: number
    get: number
    success_rate: number
    healthy: boolean
  }
}

export async function getUpdateStatsSB(c: Context): Promise<UpdateStats> {
  const { data, error } = await supabaseAdmin(c)
    .rpc('get_update_stats')

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error getting update stats', error })
    return {
      apps: [],
      total: {
        failed: 0,
        set: 0,
        get: 0,
        success_rate: 100,
        healthy: true,
      },
    }
  }

  const apps = data.map((app: any) => {
    const totalEvents = app.failed + app.install + app.get
    const successRate = totalEvents > 0 ? ((app.install + app.get) / totalEvents) * 100 : 100
    return {
      app_id: app.app_id,
      failed: Number(app.failed),
      set: Number(app.install),
      get: Number(app.get),
      success_rate: Number(successRate.toFixed(2)),
      healthy: successRate >= 70,
    }
  })

  const total = apps.reduce((acc, app) => {
    acc.failed += app.failed
    acc.set += app.set
    acc.get += app.get
    return acc
  }, { failed: 0, set: 0, get: 0 })

  const totalEvents = total.failed + total.set + total.get
  const totalSuccessRate = totalEvents > 0 ? ((total.set + total.get) / totalEvents) * 100 : 100

  return {
    apps,
    total: {
      ...total,
      success_rate: Number(totalSuccessRate.toFixed(2)),
      healthy: totalSuccessRate >= 70,
    },
  }
}
