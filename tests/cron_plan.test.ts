import { beforeEach, describe, expect, it } from 'vitest'
import { BASE_URL, getBaseData, getSupabaseClient, postUpdate, PRODUCT_ID, resetAndSeedAppDataStats, TEST_EMAIL, USER_ID } from './test-utils.ts'

const APPNAME = 'com.demo.app.cron_plan'
const ORG_ID = '046a36ac-e03c-4190-9257-bd6c9dba9ee9'
const STRIPE_INFO_CUSTOMER_ID = 'cus_Q38uE91NP8Ufq1'
const headers = {
  'Content-Type': 'application/json',
  'apisecret': 'testsecret',
}

beforeEach(async () => {
  await resetAndSeedAppDataStats(APPNAME)
  // await resetAndSeedAppData(APPNAME)
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('stripe_info')
    .upsert([
      {
        subscription_id: 'sub_2',
        customer_id: STRIPE_INFO_CUSTOMER_ID, // this is the stripe info that I will be using
        status: 'succeeded' as const,
        product_id: PRODUCT_ID,
        trial_at: new Date(0).toISOString(),
        is_good_plan: true,
        plan_usage: 2,
        subscription_metered: {},
        subscription_anchor_start: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_anchor_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        mau_exceeded: false,
        storage_exceeded: false,
        bandwidth_exceeded: false,
      },
    ], { onConflict: 'customer_id' })
  if (error)
    throw error

  const { error: orgError } = await supabase.from('orgs').upsert([
    {
      id: ORG_ID,
      customer_id: STRIPE_INFO_CUSTOMER_ID,
      name: 'Test Org V2',
      created_by: USER_ID,
      management_email: TEST_EMAIL,
    },
  ], { onConflict: 'id' })
  if (orgError)
    throw orgError

  const { error: appError } = await supabase.from('apps').upsert([
    {
      owner_org: ORG_ID,
      name: 'Test App V2',
      app_id: APPNAME,
      icon_url: 'https://example.com/icon.png',
    },
  ], { onConflict: 'app_id' })
  if (appError)
    throw appError

  // app_versions update
  const { error: appVersionsError, data: appVersionsData } = await supabase.from('app_versions').insert([{
    app_id: APPNAME,
    name: `1.0.0-${new Date().toISOString()}`,
    owner_org: ORG_ID,
  }]).select('*')
  if (appVersionsError)
    throw appVersionsError

  const { error: appVersionMetaError } = await supabase.from('app_versions_meta').upsert(appVersionsData.map((version) => {
    return {
      id: version.id,
      app_id: APPNAME,
      size: 0,
      checksum: '',
      owner_org: ORG_ID,
    }
  }), { onConflict: 'id' })
  if (appVersionMetaError)
    throw appVersionMetaError

  const { error: appVersionMetaError2 } = await supabase
    .from('app_versions_meta')
    .update({ size: 0 })
    .eq('app_id', APPNAME)
  if (appVersionMetaError2)
    throw appVersionMetaError2

  const { error: mauError } = await supabase
    .from('daily_mau')
    .update({ mau: 0 })
    .eq('app_id', APPNAME)
  expect(mauError).toBeFalsy()

  const { error: bandwidthError } = await supabase
    .from('daily_bandwidth')
    .update({ bandwidth: 0 })
    .eq('app_id', APPNAME)
  expect(bandwidthError).toBeFalsy()
})

describe('[POST] /triggers/cron_plan', () => {
  it('should return 400 when orgId is missing', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_plan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    const data = await response.json() as { status: string }
    expect(data.status).toBe('No orgId')
  })

  it('should handle too big MAU correctly', async () => {
    // First set the org as trial
    const supabase = getSupabaseClient()
    const { error: latestMauError, data: latestMauData } = await supabase
      .from('daily_mau')
      .select('*')
      .eq('app_id', APPNAME)
      .order('date', { ascending: false })
      .limit(1)
      .single()
    expect(latestMauError).toBeFalsy()

    const { error: setMauError } = await supabase
      .from('daily_mau')
      .update({ mau: 1000000 })
      .eq('app_id', APPNAME)
      .eq('date', latestMauData?.date ?? '')
    expect(setMauError).toBeFalsy()

    const { error } = await supabase
      .from('stripe_info')
      .update({ is_good_plan: true, trial_at: new Date(0).toISOString() })
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
    if (error)
      throw error

    const response = await fetch(`${BASE_URL}/triggers/cron_plan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orgId: ORG_ID }),
    })
    expect(response.status).toBe(200)

    const { data: stripeInfoData } = await supabase
      .from('stripe_info')
      .select('*')
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
      .single()
    expect(stripeInfoData?.is_good_plan).toBe(false)

    const { data: mauExceeded, error: mauExceededError } = await supabase
      .rpc('is_mau_exceeded_by_org', { org_id: ORG_ID })
    expect(mauExceededError).toBeFalsy()
    expect(mauExceeded).toBe(true)

    const { data: storageExceeded, error: storageExceededError } = await supabase
      .rpc('is_storage_exceeded_by_org', { org_id: ORG_ID })
    expect(storageExceededError).toBeFalsy()
    expect(storageExceeded).toBe(false)

    const { data: bandwidthExceeded, error: bandwidthExceededError } = await supabase
      .rpc('is_bandwidth_exceeded_by_org', { org_id: ORG_ID })
    expect(bandwidthExceededError).toBeFalsy()
    expect(bandwidthExceeded).toBe(false)

    const { data: isAllowedActionMau, error: isAllowedActionMauError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['mau'] as const })
    expect(isAllowedActionMauError).toBeFalsy()
    expect(isAllowedActionMau).toBe(false)

    const { data: isAllowedActionStorage, error: isAllowedActionStorageError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['storage'] as const })
    expect(isAllowedActionStorageError).toBeFalsy()
    expect(isAllowedActionStorage).toBe(true)

    const { data: isAllowedActionBandwidth, error: isAllowedActionBandwidthError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['bandwidth'] as const })
    expect(isAllowedActionBandwidthError).toBeFalsy()
    expect(isAllowedActionBandwidth).toBe(true)

    const baseData = getBaseData(APPNAME)
    const updateResponse = await postUpdate(baseData)

    expect(updateResponse.status).toBe(200)
    expect(await updateResponse.json<{ error: string }>().then(data => data.error)).toEqual('need_plan_upgrade')
  })

  it('should handle too big storage correctly', async () => {
    // First set the org as trial
    const supabase = getSupabaseClient()

    const { error: setStorageError } = await supabase
      .from('app_versions_meta')
      .update({ size: 1000000000 })
      .eq('app_id', APPNAME)
    expect(setStorageError).toBeFalsy()

    const { error } = await supabase
      .from('stripe_info')
      .update({ is_good_plan: true, trial_at: new Date(0).toISOString() })
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
    if (error)
      throw error

    const response = await fetch(`${BASE_URL}/triggers/cron_plan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orgId: ORG_ID }),
    })
    expect(response.status).toBe(200)

    const { data: stripeInfoData } = await supabase
      .from('stripe_info')
      .select('*')
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
      .single()
    expect(stripeInfoData?.is_good_plan).toBe(false)

    const { data: mauExceeded, error: mauExceededError } = await supabase
      .rpc('is_mau_exceeded_by_org', { org_id: ORG_ID })
    expect(mauExceededError).toBeFalsy()
    expect(mauExceeded).toBe(false)

    const { data: storageExceeded, error: storageExceededError } = await supabase
      .rpc('is_storage_exceeded_by_org', { org_id: ORG_ID })
    expect(storageExceededError).toBeFalsy()
    expect(storageExceeded).toBe(true)

    const { data: bandwidthExceeded, error: bandwidthExceededError } = await supabase
      .rpc('is_bandwidth_exceeded_by_org', { org_id: ORG_ID })
    expect(bandwidthExceededError).toBeFalsy()
    expect(bandwidthExceeded).toBe(false)

    const { data: isAllowedActionStorage, error: isAllowedActionStorageError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['storage'] as const })
    expect(isAllowedActionStorageError).toBeFalsy()
    expect(isAllowedActionStorage).toBe(false)

    const { data: isAllowedActionMau, error: isAllowedActionMauError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['mau'] as const })
    expect(isAllowedActionMauError).toBeFalsy()
    expect(isAllowedActionMau).toBe(true)

    const { data: isAllowedActionBandwidth, error: isAllowedActionBandwidthError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['bandwidth'] as const })
    expect(isAllowedActionBandwidthError).toBeFalsy()
    expect(isAllowedActionBandwidth).toBe(true)

    const baseData = getBaseData(APPNAME)
    const updateResponse = await postUpdate(baseData)

    expect(updateResponse.status).toBe(200)
    expect(await updateResponse.json<{ error: string }>()).not.toEqual({ error: 'need_plan_upgrade' })
  })

  it('should handle too big bandwidth correctly', async () => {
    // First set the org as trial
    const supabase = getSupabaseClient()
    const { error: latestBandwidthError, data: latestBandwidthData } = await supabase
      .from('daily_bandwidth')
      .select('*')
      .eq('app_id', APPNAME)
      .order('date', { ascending: false })
      .limit(1)
      .single()
    expect(latestBandwidthError).toBeFalsy()

    const { error: setBandwidthError } = await supabase
      .from('daily_bandwidth')
      .update({ bandwidth: 100000000000 })
      .eq('app_id', APPNAME)
      .eq('date', latestBandwidthData?.date ?? '')
    expect(setBandwidthError).toBeFalsy()

    const { error } = await supabase
      .from('stripe_info')
      .update({ is_good_plan: true, trial_at: new Date(0).toISOString() })
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
    if (error)
      throw error

    const response = await fetch(`${BASE_URL}/triggers/cron_plan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orgId: ORG_ID }),
    })
    expect(response.status).toBe(200)

    const { data: stripeInfoData } = await supabase
      .from('stripe_info')
      .select('*')
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
      .single()
    expect(stripeInfoData?.is_good_plan).toBe(false)

    const { data: mauExceeded, error: mauExceededError } = await supabase
      .rpc('is_mau_exceeded_by_org', { org_id: ORG_ID })
    expect(mauExceededError).toBeFalsy()
    expect(mauExceeded).toBe(false)

    const { data: storageExceeded, error: storageExceededError } = await supabase
      .rpc('is_storage_exceeded_by_org', { org_id: ORG_ID })
    expect(storageExceededError).toBeFalsy()
    expect(storageExceeded).toBe(false)

    const { data: bandwidthExceeded, error: bandwidthExceededError } = await supabase
      .rpc('is_bandwidth_exceeded_by_org', { org_id: ORG_ID })
    expect(bandwidthExceededError).toBeFalsy()
    expect(bandwidthExceeded).toBe(true)

    const { data: isAllowedActionMau, error: isAllowedActionMauError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['mau'] as const })
    expect(isAllowedActionMauError).toBeFalsy()
    expect(isAllowedActionMau).toBe(true)

    const { data: isAllowedActionStorage, error: isAllowedActionStorageError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['storage'] as const })
    expect(isAllowedActionStorageError).toBeFalsy()
    expect(isAllowedActionStorage).toBe(true)

    const { data: isAllowedActionBandwidth, error: isAllowedActionBandwidthError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['bandwidth'] as const })
    expect(isAllowedActionBandwidthError).toBeFalsy()
    expect(isAllowedActionBandwidth).toBe(false)

    const baseData = getBaseData(APPNAME)
    const updateResponse = await postUpdate(baseData)

    expect(updateResponse.status).toBe(200)
    expect(await updateResponse.json<{ error: string }>().then(data => data.error)).toEqual('need_plan_upgrade')
  })
})
