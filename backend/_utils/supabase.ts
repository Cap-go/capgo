import type { Context } from 'https://deno.land/x/hono/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.38.5'
import { createCustomer } from './stripe.ts'
import type { Database } from './supabase.types.ts'
import { getEnv } from './utils.ts'
import type { Person, Segments } from './plunk.ts'
import { addDataContact } from './plunk.ts'
import type { Order } from './types.ts'
import { isClickHouseEnabled, sendDeviceToClickHouse, sendLogToClickHouse } from './clickhouse.ts'

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

export function supabaseClient(auth: string, c: Context) {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: auth } },
  }
  return createClient<Database>(getEnv('SUPABASE_URL', c), getEnv('SUPABASE_ANON_KEY', c), options)
}

export function emptySupabase(c: Context) {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(getEnv('SUPABASE_URL', c), getEnv('SUPABASE_ANON_KEY', c), options)
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
  return createClient<Database>(getEnv('SUPABASE_URL', c), getEnv('SUPABASE_ANON_KEY', c), options)
}

export function updateOrCreateVersion(update: Database['public']['Tables']['app_versions']['Insert'], c: Context) {
  console.log('updateOrCreateVersion', update)
  return supabaseAdmin(c)
    .from('app_versions')
    .upsert(update)
    .eq('app_id', update.app_id)
    .eq('name', update.name)
}

export async function updateOnpremStats(increment: Database['public']['Functions']['increment_store']['Args'], c: Context) {
  const { error } = await supabaseAdmin(c)
    .rpc('increment_store', increment)
  if (error)
    console.error('increment_store', error)
}

export function updateOrCreateChannel(update: Database['public']['Tables']['channels']['Insert'], c: Context) {
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

export async function checkAppOwner(userId: string | undefined, appId: string | undefined, c: Context): Promise<boolean> {
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
    console.log(error)
    return false
  }
}

export async function getCurrentPlanName(userId: string, c: Context): Promise<string> {
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

export async function getPlanUsagePercent(userId: string, c: Context): Promise<number> {
  const { data, error } = await supabaseAdmin(c)
    .rpc('get_plan_usage_percent', { userid: userId })
    .single()
  if (error) {
    console.error('getPlanUsagePercent error', error.message)
    throw new Error(error.message)
  }

  return data || 0
}

export async function getOrgs(userId: string, c: Context) {
  const { data, error } = await supabaseAdmin(c)
    .rpc('get_orgs', { userid: userId })
    .single()
  if (error) {
    console.error('getOrgs error', error.message)
    throw new Error(error.message)
  }

  return data
}

export async function isGoodPlan(userId: string, c: Context): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('is_good_plan_v4', { userid: userId })
      .single()
      .throwOnError()
    return data || false
  }
  catch (error) {
    console.error('isGoodPlan error', userId, error)
  }
  return false
}

export async function isOnboarded(userId: string, c: Context): Promise<boolean> {
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

export async function isFreeUsage(userId: string, c: Context): Promise<boolean> {
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

export async function isOnboardingNeeded(userId: string, c: Context): Promise<boolean> {
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

export async function isCanceled(userId: string, c: Context): Promise<boolean> {
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

export async function isPaying(userId: string, c: Context): Promise<boolean> {
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

export async function isTrial(userId: string, c: Context): Promise<number> {
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

export async function isAdmin(userId: string, c: Context): Promise<boolean> {
  const { data, error } = await supabaseAdmin(c)
    .rpc('is_admin', { userid: userId })
    .single()
  if (error)
    throw new Error(error.message)

  return data || false
}

export async function isAllowedAction(userId: string, c: Context): Promise<boolean> {
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

  const client = supabaseClient(auth, c)
  await client
    .from('devices')
    .update({ custom_id: customId })
    .eq('app_id', appId)
    .eq('device_id', deviceId)
    // TODO: to remove if we go 100% clickhouse
  if (!isClickHouseEnabled(c)) {
    // update the device custom_id
    return
  }
  const reqOwner = await client
    .rpc('is_app_owner', { appid: appId })
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
  return sendDeviceToClickHouse([{
    ...device,
    custom_id: customId,
  }], c)
}

export async function getSDashboard(c: Context, auth: string, userIdQuery: string, startDate: string, endDate: string, appId?: string) {
  console.log(`getSDashboard userId ${userIdQuery} appId ${appId} startDate ${startDate}, endDate ${endDate}`)

  let isAdmin = false
  let tableName: 'app_usage' | 'clickhouse_app_usage' = 'app_usage'
  let client = supabaseClient(auth, c)
  if (!auth)
    client = supabaseAdmin(c)

  const reqAdmin = await client
    .rpc('is_admin')
    .then(res => res.data || false)
  isAdmin = reqAdmin

  if (isClickHouseEnabled(c)) {
    tableName = 'clickhouse_app_usage'
    if (appId) {
      // const hasReadRights = await client.rpc('has_read_rights')
      //   .then(res => res.data || false)

      // console.log('read rights', hasReadRights)

      const reqOwner = await client
        .rpc('is_app_owner', { appid: appId })
        .then(res => res.data || false)
      if (!reqOwner && !reqAdmin)
        return Promise.reject(new Error('not allowed'))
    }
    client = supabaseAdmin(c)
  }
  console.log('tableName', tableName)
  let req = client
    .from(tableName)
    .select()

  if (appId) {
    req = req.eq('app_id', appId)
  }
  else {
    const userId = isAdmin ? userIdQuery : (await supabaseClient(auth, c).auth.getUser()).data.user?.id
    if (!userId)
      return []
    // get all user apps id
    const appIds = await supabaseClient(auth, c)
      .from('apps')
      .select('app_id')
      .eq('user_id', userId)
      .then(res => res.data?.map(app => app.app_id) || [])
    console.log('appIds', appIds)
    req = req.in('app_id', appIds)
  }

  if (startDate) {
    console.log('startDate', startDate)
    // convert date string startDate to YYYY-MM-DD
    const startDateStr = new Date(startDate).toISOString().split('T')[0]
    req = req.gt('date', startDateStr)
  }
  if (endDate) {
    console.log('endDate', endDate)
    // convert date string endDate to YYYY-MM-DD
    const endDateStr = new Date(endDate).toISOString().split('T')[0]
    req = req.lt('date', endDateStr)
  }

  const res = await req
  console.log('res', res)
  return res.data || []
}

export async function getSDevice(c: Context, auth: string, appId: string, versionId?: string, deviceIds?: string[], search?: string, order?: Order[], rangeStart?: number, rangeEnd?: number, count = false) {
  // do the request to supabase
  console.log(`getDevice appId ${appId} versionId ${versionId} deviceIds ${deviceIds} search ${search} rangeStart ${rangeStart}, rangeEnd ${rangeEnd}`, order)

  let tableName: 'devices' | 'clickhouse_devices' = 'devices'
  let client = supabaseClient(auth, c)
  if (!auth)
    client = supabaseAdmin(c)

  if (isClickHouseEnabled(c)) {
    tableName = 'clickhouse_devices'
    const reqOwner = await client
      .rpc('is_app_owner', { appid: appId })
      .then(res => res.data || false)
    if (!reqOwner) {
      const reqAdmin = await client
        .rpc('is_admin')
        .then(res => res.data || false)
      if (!reqAdmin)
        return Promise.reject(new Error('not allowed'))
    }
    client = supabaseAdmin(c)
  }

  const reqCount = count
    ? client
      .from(tableName)
      .select('', { count: 'exact', head: true })
      .eq('app_id', appId)
      .then(res => res.count || 0)
    : 0
  let req = client
    .from(tableName)
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
        req = req.order(col.key as any, { ascending: col.sortable === 'asc' })
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
  let tableName: 'stats' | 'clickhouse_logs' = 'stats'
  let client = supabaseClient(auth, c)
  if (!auth)
    client = supabaseAdmin(c)

  if (isClickHouseEnabled(c)) {
    tableName = 'clickhouse_logs'
    const reqOwner = auth
      ? (await client
          .rpc('is_app_owner', { appid: appId })
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
  }

  const reqCount = count
    ? client
      .from(tableName)
      .select('', { count: 'exact', head: true })
      .eq('app_id', appId)
      .then(res => res.count || 0)
    : 0
  let req = client
    .from(tableName)
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
        req = req.order(col.key as any, { ascending: col.sortable === 'asc' })
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

export function sendDevice(c: Context, device: Database['public']['Tables']['devices']['Update']) {
  const deviceComplete: Database['public']['Tables']['devices']['Insert'] = {
    updated_at: device.updated_at || new Date().toISOString(),
    platform: device.platform as Database['public']['Enums']['platform_os'],
    os_version: device.os_version as string,
    version: device.version as number,
    version_build: device.version_build as string,
    device_id: device.device_id as string,
    app_id: device.app_id as string,
    plugin_version: device.plugin_version as string,
    is_emulator: !!device.is_emulator,
    is_prod: !!device.is_prod,
    custom_id: device.custom_id as string,
    created_at: device.created_at || new Date().toISOString(),
  }
  const all = []
  if (isClickHouseEnabled(c))
    all.push(sendDeviceToClickHouse(c, [deviceComplete]))
  else
    all.push(supabaseAdmin(c).from('devices').upsert(deviceComplete, { onConflict: 'device_id', ignoreDuplicates: false }))

  return Promise.all(all)
    .catch((e) => {
      console.log('sendDevice error', e)
    })
}

export function sendStats(c: Context, stats: Database['public']['Tables']['stats']['Update'][]) {
  const all = []
  for (const stat of stats) {
    const statComplete: Database['public']['Tables']['stats']['Insert'] = {
      created_at: stat.created_at || new Date().toISOString(),
      device_id: stat.device_id as string,
      action: stat.action as string,
      app_id: stat.app_id as string,
      version_build: stat.version_build as string,
      version: stat.version as number,
      platform: stat.platform as Database['public']['Enums']['platform_os'],
    }
    if (isClickHouseEnabled(c))
      all.push(sendLogToClickHouse(c, [statComplete]))
    else
      all.push(supabaseAdmin(c).from('stats').insert(statComplete))
  }

  return Promise.all(all)
    .catch((e) => {
      console.log('sendDevice error', e)
    })
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

export async function saveStoreInfo(apps: (Database['public']['Tables']['store_apps']['Insert'])[], c: Context) {
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

export async function customerToSegment(userId: string, customer: Database['public']['Tables']['stripe_info']['Row'], c: Context, plan?: Database['public']['Tables']['plans']['Row'] | null): Promise<Segments> {
  const segments: Segments = {
    capgo: true,
    onboarded: await isOnboarded(userId, c),
    trial: false,
    trial7: false,
    trial1: false,
    trial0: false,
    paying: false,
    payingMonthly: plan?.price_m_id === customer.price_id,
    plan: plan?.name ?? '',
    overuse: false,
    canceled: await isCanceled(userId, c),
    issueSegment: false,
  }
  const trialDaysLeft = await isTrial(userId, c)
  const paying = await isPaying(userId, c)
  const canUseMore = await isGoodPlan(userId, c)

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

export async function getStripeCustomer(customerId: string, c: Context) {
  const { data: stripeInfo } = await supabaseAdmin(c)
    .from('stripe_info')
    .select('*')
    .eq('customer_id', customerId)
    .single()
  return stripeInfo
}

export async function createStripeCustomer(user: Database['public']['Tables']['users']['Row'], c: Context) {
  const customer = await createCustomer(user.email, user.id, `${user.first_name || ''} ${user.last_name || ''}`)
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
    .eq('stripe_id', customer.product_id)
    .single()
  const segment = await customerToSegment(user.id, customer, plan)
  await addDataContact(user.email, { ...person, ...segment }).catch((e) => {
    console.log('updatePerson error', e)
  })
  console.log('stripe_info done')
}
