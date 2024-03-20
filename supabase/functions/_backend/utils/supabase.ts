import type { Context } from 'hono'

import { createClient } from '@supabase/supabase-js'
import { createCustomer } from './stripe.ts'
import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'
import type { Person, Segments } from './plunk.ts'
import { addDataContact } from './plunk.ts'
import type { Order } from './types.ts'
import { readMauFromClickHouse, sendStatsAndDevice } from './clickhouse.ts'
import type { AppActivity } from './clickhouse.ts'

export const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

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

export function supabaseClient(c: Context, auth: string) {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: auth } },
  }
  return createClient<Database>(getEnv(c, 'SUPABASE_URL'), getEnv(c, 'SUPABASE_ANON_KEY'), options)
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

export function updateOrCreateVersion(c: Context, update: Database['public']['Tables']['app_versions']['Insert']) {
  console.log('updateOrCreateVersion', update)
  return supabaseAdmin(c)
    .from('app_versions')
    .upsert(update)
    .eq('app_id', update.app_id)
    .eq('name', update.name)
}

export async function updateOnpremStats(c: Context, increment: Database['public']['Functions']['increment_store']['Args']) {
  const { error } = await supabaseAdmin(c)
    .rpc('increment_store', increment)
  if (error)
    console.error('increment_store', error)
}

export function updateOrCreateChannel(c: Context, update: Database['public']['Tables']['channels']['Insert']) {
  console.log('updateOrCreateChannel', update)
  if (!update.app_id || !update.name || !update.created_by) {
    console.log('missing app_id, name, or created_by')
    return Promise.reject(new Error('missing app_id, name, or created_by'))
  }
  return supabaseAdmin(c)
    .from('channels')
    .upsert(update)
    .eq('app_id', update.app_id)
    .eq('name', update.name)
    .eq('created_by', update.created_by)
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
    if (!data || !data.length || error)
      return false
    return true
  }
  catch (error) {
    console.error(error)
    return false
  }
}

export async function hasAppRight(c: Context, appId: string | undefined, userid: string, right: Database['public']['Enums']['user_min_right']) {
  if (!appId)
    return false

  const { data, error } = await supabaseAdmin(c)
    .rpc('has_app_right_userid', { appid: appId, right, userid })

  if (error) {
    console.error(error)
    return false
  }

  return data
}

export async function getCurrentPlanName(c: Context, userId: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin(c)
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

export async function getPlanUsagePercent(c: Context, userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin(c)
    .rpc('get_plan_usage_percent', { userid: userId })
    .single()
  if (error) {
    console.error('getPlanUsagePercent error', error.message)
    throw new Error(error.message)
  }

  return data || 0
}

export async function isGoodPlan(c: Context, userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('is_good_plan_v5', { userid: userId })
      .single()
      .throwOnError()
    return data || false
  }
  catch (error) {
    console.error('isGoodPlan error', userId, error)
  }
  return false
}

export async function isOnboarded(c: Context, userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
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

export async function isFreeUsage(c: Context, userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
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

export async function isOnboardingNeeded(c: Context, userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
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

export async function isCanceled(c: Context, userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
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

export async function isPaying(c: Context, userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
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

export async function isTrial(c: Context, userId: string): Promise<number> {
  try {
    const { data } = await supabaseAdmin(c)
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

export async function isAdmin(c: Context, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin(c)
    .rpc('is_admin', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data || false
}

export async function isAllowedAction(c: Context, userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
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

export async function updateDeviceCustomId(c: Context, auth: string, appId: string, deviceId: string, customId: string) {
  console.log(`UpdateDeviceCustomId appId ${appId} deviceId ${deviceId} customId ${customId}`)

  const client = supabaseClient(c, auth)
  const reqOwner = await client
    .rpc('has_app_right', { appid: appId, right: 'write' })
    .then(res => res.data || false)
  if (!reqOwner) {
    const reqAdmin = await client
      .rpc('is_admin')
      .then(res => res.data || false)
    if (!reqAdmin)
      return Promise.reject(new Error('not allowed'))
  }
  console.log('UpdateDeviceCustomId clickhouse')
  // get the device from clickhouse
  const device = await supabaseAdmin(c)
    .from('clickhouse_devices')
    .select()
    .eq('app_id', appId)
    .eq('device_id', deviceId)
    .limit(1)
    .single()
    .then(res => res.data || null)
  console.log('UpdateDeviceCustomId get device', device)
  if (!device)
    return Promise.reject(new Error('device not found'))
    // send the device to clickhouse
  return sendStatsAndDevice(c, {
    ...device,
    custom_id: customId,
  }, [{ action: 'setCustomId' }])
}

export async function getSDashboard(c: Context, auth: string, orgIdQuery: string, startDate: string, endDate: string, appId?: string) {
  console.log(`getSDashboard orgId ${orgIdQuery} appId ${appId} startDate ${startDate}, endDate ${endDate}`)

  let client = supabaseClient(c, auth)
  if (!auth)
    client = supabaseAdmin(c)

  if (appId) {
    const reqOwner = await client
      .rpc('has_app_right', { appid: appId, right: 'read' })
      .then(res => res.data || false)
    if (!reqOwner)
      return Promise.reject(new Error('not allowed'))
  }

  client = supabaseAdmin(c)

  // console.log('tableName', tableName)
  let req = client
    .from('clickhouse_app_usage_parm')
    .select()

  if (appId) {
    req = req.eq('_app_list', JSON.stringify([appId]))
  }
  else {
    const userId = (await supabaseClient(c, auth).auth.getUser()).data.user?.id
    if (!userId)
      return []
    // get all user apps id
    let appIdsReq = supabaseClient(c, auth)
      .from('apps')
      .select('app_id')
      // .eq('user_id', userId)

    if (orgIdQuery)
      appIdsReq = appIdsReq.eq('owner_org', orgIdQuery)

    const appIds = await appIdsReq.then(res => res.data?.map(app => app.app_id) || [])

    console.log('appIds', appIds)
    req = req.eq('_app_list', JSON.stringify(appIds))
  }

  if (startDate) {
    console.log('startDate', startDate)
    // convert date string startDate to YYYY-MM-DD
    const startDateStr = new Date(startDate).toISOString().split('T')[0]
    req = req.eq('_start_date', startDateStr)
  }
  if (endDate) {
    console.log('endDate', endDate)
    // convert date string endDate to YYYY-MM-DD
    const endDateStr = new Date(endDate).toISOString().split('T')[0]
    req = req.eq('_end_date', endDateStr)
  }

  const res = await req
  console.log('res', res)
  return res.data || []
}

export async function getSDashboardV2(c: Context, auth: string, orgId: string, startDate: string, endDate: string, appId?: string): Promise<AppActivity[]> {
  console.log(`getSDashboardV2 orgId ${orgId} appId ${appId} startDate ${startDate}, endDate ${endDate}`)

  let client = supabaseClient(c, auth)
  const userId = (await client.auth.getUser()).data.user?.id
  if (!auth)
    client = supabaseAdmin(c)

  if (appId) {
    const reqOwner = await client
      .rpc('has_app_right', { appid: appId, right: 'read' })
      .then(res => res.data || false)
    if (!reqOwner)
      return Promise.reject(new Error('not allowed'))
  }

  console.log('appId', appId)
  const appIds: string[] = []

  if (appId) {
    appIds.push(appId)
  }
  else {
    console.log('getSDashboard V2 get apps', userId)
    if (!userId)
      return []
    // get all user apps id
    console.log('userId', userId)
    const resAppIds = await client
      .from('apps')
      .select('app_id')
      .eq('owner_org', orgId)
      .then(res => res.data?.map(app => app.app_id) || [])
    appIds.push(...resAppIds)
  }

  console.log('appIds', appIds)
  const res = await readMauFromClickHouse(c, startDate, endDate, appIds)
  console.log('res', res)
  return res.data || []
}

export async function getSDevice(c: Context, auth: string, appId: string, versionId?: string, deviceIds?: string[], search?: string, order?: Order[], rangeStart?: number, rangeEnd?: number, count = false) {
  // do the request to supabase
  console.log(`getDevice appId ${appId} versionId ${versionId} deviceIds ${deviceIds} search ${search} rangeStart ${rangeStart}, rangeEnd ${rangeEnd}`, order)

  let client = supabaseClient(c, auth)
  if (!auth)
    client = supabaseAdmin(c)

  const reqOwner = auth
    ? await client
      .rpc('has_app_right', { appid: appId, right: 'read' })
      .then((r) => {
        console.log(r)
        return r
      })
      .then(res => res.data || false)
    : true
  if (!reqOwner) {
    const reqAdmin = await client
      .rpc('is_admin')
      .then(res => res.data || false)
    if (!reqAdmin)
      return Promise.reject(new Error('not allowed'))
  }
  client = supabaseAdmin(c)

  const reqCount = count
    ? client
      .from('clickhouse_devices')
      .select('', { count: 'exact', head: true })
      .eq('app_id', appId)
      .then(res => res.count || 0)
    : 0
  let req = client
    .from('clickhouse_devices')
    .select()
    .eq('app_id', appId)

  if (versionId) {
    console.log('versionId', versionId)
    req = req.eq('version', versionId)
  }

  if (rangeStart !== undefined && rangeEnd !== undefined) {
    console.log('range', rangeStart, rangeEnd)
    req = req.range(rangeStart, rangeEnd)
  }

  if (deviceIds && deviceIds.length) {
    console.log('deviceIds', deviceIds)
    if (deviceIds.length === 1) {
      req = req.eq('device_id', deviceIds[0])
      req = req.limit(1)
    }
    else {
      req = req.in('device_id', deviceIds)
    }
  }
  if (search) {
    console.log('search', search)
    if (deviceIds && deviceIds.length)
      req = req.or(`custom_id.like.%${search}%`)
    else
      req = req.or(`device_id.like.%${search}%,custom_id.like.%${search}%`)
  }

  if (order?.length) {
    order.forEach((col) => {
      if (col.sortable && typeof col.sortable === 'string') {
        console.log('order', col.key, col.sortable)
        req = req.order(col.key as string, { ascending: col.sortable === 'asc' })
      }
    })
  }
  return Promise.all([reqCount, req.then(res => res.data || [])]).then(res => ({ count: res[0], data: res[1] }))

  // }
  // else {
  //   console.log('getDevice enabled')
  //   // check the rights of the user
  //   return readDevicesInTinyBird(appId, versionId, deviceIds, search, order, rangeStart, rangeEnd)
  // }
}

export async function getSStats(c: Context, auth: string, appId: string, deviceIds?: string[], search?: string, order?: Order[], rangeStart?: number, rangeEnd?: number, after?: string, count = false) {
  // if (!isTinybirdGetDevicesEnabled()) {
  console.log(`getStats auth ${auth} appId ${appId} deviceIds ${deviceIds} search ${search} rangeStart ${rangeStart}, rangeEnd ${rangeEnd} after ${after}`, order)
  // getStats ee.forgr.captime undefined  [
  //   { key: "action", sortable: true },
  //   { key: "created_at", sortable: "desc" }
  // ] 0 9
  let client = supabaseClient(c, auth)
  if (!auth)
    client = supabaseAdmin(c)

  const reqOwner = auth
    ? (await client
        .rpc('has_app_right', { appid: appId, right: 'read' })
        .then(res => res.data || false))
    : true
  if (!reqOwner) {
    const reqAdmin = await client
      .rpc('is_admin')
      .then(res => res.data || false)
    if (!reqAdmin)
      return Promise.reject(new Error('not allowed'))
  }
  client = supabaseAdmin(c)

  const reqCount = count
    ? client
      .from('clickhouse_logs')
      .select('', { count: 'exact', head: true })
      .eq('app_id', appId)
      .then(res => res.count || 0)
    : 0
  let req = client
    .from('clickhouse_logs')
    .select(`
        device_id,
        action,
        platform,
        version_build,
        version,
        created_at
      `)
    .eq('app_id', appId)

  if (rangeStart !== undefined && rangeEnd !== undefined) {
    console.log('range', rangeStart, rangeEnd)
    req = req.range(rangeStart, rangeEnd)
  }

  if (after) {
    console.log('after', after)
    req = req.gt('created_at', after)
  }

  if (deviceIds && deviceIds.length) {
    console.log('deviceIds', deviceIds)
    if (deviceIds.length === 1)
      req = req.eq('device_id', deviceIds[0])
    else
      req = req.in('device_id', deviceIds)
  }
  if (search) {
    console.log('search', search)
    if (deviceIds && deviceIds.length)
      req = req.or(`action.like.%${search}%`)
    else
      req = req.or(`device_id.like.%${search}%,action.like.%${search}%`)
  }

  if (order?.length) {
    order.forEach((col) => {
      if (col.sortable && typeof col.sortable === 'string') {
        console.log('order', col.key, col.sortable)
        req = req.order(col.key as string, { ascending: col.sortable === 'asc' })
      }
    })
  }
  return Promise.all([reqCount, req.then(res => res.data || [])]).then(res => ({ count: res[0], data: res[1] }))
  // }
  // else {
  //   console.log('getStats enabled')
  //   // check the rights of the user
  //   return readLogInTinyBird(appId, deviceId, search, order, rangeStart, rangeEnd)
  // }
}

export async function createApiKey(c: Context, userId: string) {
  // check if user has apikeys
  const total = await supabaseAdmin(c)
    .from('apikeys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .then(res => res.count || 0)

  if (total === 0) {
    // create apikeys
    return supabaseAdmin(c)
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
        },
      ])
  }
  return Promise.resolve()
}

export async function createdefaultOrg(c: Context, userId: string, name = 'Default') {
  // check if user has apikeys
  const total = await supabaseAdmin(c)
    .from('orgs')
    .select('created_by', { count: 'exact', head: true })
    .eq('created_by', userId)
    .then(res => res.count || 0)

  if (total === 0) {
    // create apikeys
    const { data, error } = await supabaseAdmin(c)
      .from('orgs')
      .insert(
        {
          created_by: userId,
          logo: '',
          name: `${name} organization`,
        },
      )
      .select()
      .single()
      // create org_users admin from data.id
    if (error)
      console.error('createdefaultOrg error', error)

    if (data)
      return Promise.resolve()
  }
  return Promise.resolve()
}

export function userToPerson(user: Database['public']['Tables']['users']['Row'], customer: Database['public']['Tables']['stripe_info']['Row']): Person {
  const person: Person = {
    id: user.id,
    product_id: customer.product_id,
    customer_id: customer.customer_id,
    nickname: `${user.first_name ?? ''} ${user.last_name ?? ''}`,
    avatar: user.image_url ? user.image_url : undefined,
    country: user.country ? user.country : undefined,
  }
  return person
}

export async function saveStoreInfo(c: Context, apps: (Database['public']['Tables']['store_apps']['Insert'])[]) {
  // save in supabase
  if (!apps.length)
    return
  const noDup = apps.filter((value, index, self) => index === self.findIndex(t => (t.app_id === value.app_id)))
  console.log('saveStoreInfo', noDup.length)
  const { error } = await supabaseAdmin(c)
    .from('store_apps')
    .upsert(noDup)
  if (error)
    console.error('saveStoreInfo error', error)
}

export async function customerToSegment(c: Context, userId: string, price_id: string, plan?: Database['public']['Tables']['plans']['Row'] | null): Promise<Segments> {
  const segments: Segments = {
    capgo: true,
    onboarded: await isOnboarded(c, userId),
    trial: false,
    trial7: false,
    trial1: false,
    trial0: false,
    paying: false,
    payingMonthly: plan?.price_m_id === price_id,
    plan: plan?.name ?? '',
    overuse: false,
    canceled: await isCanceled(c, userId),
    issueSegment: false,
  }
  const trialDaysLeft = await isTrial(c, userId)
  const paying = await isPaying(c, userId)
  const canUseMore = await isGoodPlan(c, userId)

  if (!segments.onboarded)
    return segments

  if (!paying && trialDaysLeft > 1 && trialDaysLeft <= 7) {
    segments.trial = true
    segments.trial7 = true
  }
  else if (!paying && trialDaysLeft === 1) {
    segments.trial = true
    segments.trial1 = true
  }

  else if (!paying && !canUseMore) {
    segments.trial = true
    segments.trial0 = true
  }

  else if (paying && !canUseMore && plan) {
    segments.overuse = true
    segments.paying = true
  }

  else if (paying && canUseMore && plan) {
    segments.paying = true
  }
  else {
    segments.issueSegment = true
  }

  return segments
}

export async function getStripeCustomer(c: Context, customerId: string) {
  const { data: stripeInfo } = await supabaseAdmin(c)
    .from('stripe_info')
    .select('*')
    .eq('customer_id', customerId)
    .single()
  return stripeInfo
}

export async function createStripeCustomer(c: Context, user: Database['public']['Tables']['users']['Row']) {
  const customer = await createCustomer(c, user.email, user.id, `${user.first_name || ''} ${user.last_name || ''}`)
  // create date + 15 days
  const trial_at = new Date()
  trial_at.setDate(trial_at.getDate() + 15)
  const { error: createInfoError } = await supabaseAdmin(c)
    .from('stripe_info')
    .insert({
      customer_id: customer.id,
      trial_at: trial_at.toISOString(),
    })
  if (createInfoError)
    console.log('createInfoError', createInfoError)

  const { error: updateUserError } = await supabaseAdmin(c)
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
  const { data: plan } = await supabaseAdmin(c)
    .from('plans')
    .select()
    .eq('stripe_id', customer.id)
    .single()
  const segment = await customerToSegment(c, user.id, 'free', plan)
  await addDataContact(c, user.email, { ...person, ...segment }).catch((e) => {
    console.log('updatePerson error', e)
  })
  console.log('stripe_info done')
}
