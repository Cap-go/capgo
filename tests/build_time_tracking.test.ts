import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, ORG_ID, PRODUCT_ID, resetAndSeedAppDataStats, resetAppData, resetAppDataStats, STRIPE_INFO_CUSTOMER_ID, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.cp.${id}`
const headers = {
  'Content-Type': 'application/json',
  'apisecret': 'testsecret',
}

beforeEach(async () => {
  await resetAndSeedAppDataStats(APPNAME)
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('stripe_info')
    .upsert([
      {
        subscription_id: 'sub_2',
        customer_id: STRIPE_INFO_CUSTOMER_ID,
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
        build_time_exceeded: false,
      },
    ], { onConflict: 'customer_id' })
  if (error)
    throw error

  const { error: orgError } = await supabase.from('orgs').upsert([
    {
      id: ORG_ID,
      customer_id: STRIPE_INFO_CUSTOMER_ID,
      name: 'Test Org Build Time',
      created_by: USER_ID,
      management_email: TEST_EMAIL,
    },
  ], { onConflict: 'id' })
  if (orgError)
    throw orgError

  const { error: appError } = await supabase.from('apps').upsert([
    {
      owner_org: ORG_ID,
      name: 'Test App Build Time',
      app_id: APPNAME,
      icon_url: 'https://example.com/icon.png',
    },
  ], { onConflict: 'app_id' })
  if (appError)
    throw appError

  // Reset build_logs for this org
  const { error: buildTimeError } = await supabase
    .from('build_logs')
    .delete()
    .eq('org_id', ORG_ID)
  expect(buildTimeError).toBeFalsy()

  // Clear app metrics cache
  const { error: appMetricsCacheError } = await supabase
    .from('app_metrics_cache')
    .delete()
    .eq('org_id', ORG_ID)
  expect(appMetricsCacheError).toBeFalsy()

  // Clear all credit-related data for this org
  await supabase
    .from('usage_credit_consumptions')
    .delete()
    .eq('org_id', ORG_ID)

  await supabase
    .from('usage_overage_events')
    .delete()
    .eq('org_id', ORG_ID)

  await supabase
    .from('usage_credit_transactions')
    .delete()
    .eq('org_id', ORG_ID)

  await supabase
    .from('usage_credit_grants')
    .delete()
    .eq('org_id', ORG_ID)
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
  const supabase = getSupabaseClient()

  // Clean up build logs
  await supabase
    .from('build_logs')
    .delete()
    .eq('org_id', ORG_ID)
})

describe('build Time Tracking System', () => {
  // TODO: Update these tests to use build_logs instead of daily_build_time
  it.skip('should handle too big build time correctly', async () => {
    const supabase = getSupabaseClient()

    // Get a date within the billing cycle
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0]

    // Insert high build time usage (10 hours = 36000 seconds, way over Solo plan limit of 1800 seconds)
    const { error: insertError } = await supabase
      .from('daily_build_time')
      .insert({
        app_id: APPNAME,
        date: dateStr,
        build_time_unit: 36000, // 10 hours
        build_count: 10,
      })
    expect(insertError).toBeFalsy()

    const { error } = await supabase
      .from('stripe_info')
      .update({ is_good_plan: true, trial_at: new Date(0).toISOString() })
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
    if (error)
      throw error

    // First verify the metrics can be retrieved
    const { data: totalMetrics, error: totalMetricsError } = await supabase
      .rpc('get_total_metrics', { org_id: ORG_ID })
    expect(totalMetricsError).toBeFalsy()
    console.log('Total metrics before cron:', totalMetrics)

    const response = await fetch(`${BASE_URL}/triggers/cron_stat_org`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orgId: ORG_ID }),
    })
    if (response.status !== 200) {
      const errorText = await response.text()
      console.error('Cron endpoint error:', response.status, errorText)
    }
    expect(response.status).toBe(200)

    const { data: stripeInfoData } = await supabase
      .from('stripe_info')
      .select('*')
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
      .single()
    console.log('Stripe info after cron:', stripeInfoData)
    expect(stripeInfoData?.is_good_plan).toBe(false)

    const { data: buildTimeExceeded, error: buildTimeExceededError } = await supabase
      .rpc('is_build_time_exceeded_by_org', { org_id: ORG_ID })
    expect(buildTimeExceededError).toBeFalsy()
    expect(buildTimeExceeded).toBe(true)

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
    expect(bandwidthExceeded).toBe(false)

    const { data: isAllowedActionBuildTime, error: isAllowedActionBuildTimeError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['build_time'] as const })
    expect(isAllowedActionBuildTimeError).toBeFalsy()
    expect(isAllowedActionBuildTime).toBe(false)

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
    expect(isAllowedActionBandwidth).toBe(true)
  })

  it.skip('should correctly handle build time reset', async () => {
    const supabase = getSupabaseClient()

    // First set high build time
    const { error: insertError } = await supabase
      .from('daily_build_time')
      .insert({
        app_id: APPNAME,
        date: new Date().toISOString().split('T')[0],
        build_time_unit: 36000, // 10 hours
        build_count: 10,
      })
    expect(insertError).toBeFalsy()

    // Run cron to set exceeded status
    const response = await fetch(`${BASE_URL}/triggers/cron_stat_org`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orgId: ORG_ID }),
    })
    expect(response.status).toBe(200)

    // Verify build time is exceeded
    const { data: buildTimeExceededBefore, error: buildTimeExceededErrorBefore } = await supabase
      .rpc('is_build_time_exceeded_by_org', { org_id: ORG_ID })
    expect(buildTimeExceededErrorBefore).toBeFalsy()
    expect(buildTimeExceededBefore).toBe(true)

    // Reset build time to normal value
    const { error: resetBuildTimeError } = await supabase
      .from('daily_build_time')
      .update({ build_time_unit: 0, build_count: 0 })
      .eq('app_id', APPNAME)
      .eq('date', new Date().toISOString().split('T')[0])
    expect(resetBuildTimeError).toBeFalsy()

    // Clear cache
    const { error: appMetricsCacheError } = await supabase
      .from('app_metrics_cache')
      .delete()
      .eq('org_id', ORG_ID)
    expect(appMetricsCacheError).toBeFalsy()

    // Run cron again
    const response2 = await fetch(`${BASE_URL}/triggers/cron_stat_org`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orgId: ORG_ID }),
    })
    expect(response2.status).toBe(200)

    // Verify build time is no longer exceeded
    const { data: buildTimeExceededAfter, error: buildTimeExceededErrorAfter } = await supabase
      .rpc('is_build_time_exceeded_by_org', { org_id: ORG_ID })
    expect(buildTimeExceededErrorAfter).toBeFalsy()
    expect(buildTimeExceededAfter).toBe(false)
  })

  it.skip('should correctly track build time in get_app_metrics', async () => {
    const supabase = getSupabaseClient()

    // Insert build time data
    const { error: insertError } = await supabase
      .from('daily_build_time')
      .insert({
        app_id: APPNAME,
        date: new Date().toISOString().split('T')[0],
        build_time_unit: 1800, // 30 minutes
        build_count: 5,
      })
    expect(insertError).toBeFalsy()

    // Get app metrics
    const { data: metrics, error: metricsError } = await supabase
      .rpc('get_app_metrics', {
        org_id: ORG_ID,
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
      })
    expect(metricsError).toBeFalsy()
    expect(metrics).toBeTruthy()

    if (!metrics)
      throw new Error('Metrics should not be null')

    // Find today's metrics
    const todayMetrics = metrics.find(m => m.date === new Date().toISOString().split('T')[0])
    expect(todayMetrics).toBeTruthy()
    expect(todayMetrics?.build_time_unit).toBe(1800)
  })

  it.skip('should correctly track build time in get_total_metrics', async () => {
    const supabase = getSupabaseClient()

    // Insert build time data for multiple days
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const { error: insertError1 } = await supabase
      .from('daily_build_time')
      .insert({
        app_id: APPNAME,
        date: today.toISOString().split('T')[0],
        build_time_unit: 1800, // 30 minutes
        build_count: 5,
      })
    expect(insertError1).toBeFalsy()

    const { error: insertError2 } = await supabase
      .from('daily_build_time')
      .insert({
        app_id: APPNAME,
        date: yesterday.toISOString().split('T')[0],
        build_time_unit: 1200, // 20 minutes
        build_count: 3,
      })
    expect(insertError2).toBeFalsy()

    // Get total metrics
    const { data: totalMetrics, error: totalMetricsError } = await supabase
      .rpc('get_total_metrics', {
        org_id: ORG_ID,
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
      })
    expect(totalMetricsError).toBeFalsy()
    expect(totalMetrics).toBeTruthy()

    if (!totalMetrics || !Array.isArray(totalMetrics) || totalMetrics.length === 0)
      throw new Error('Total metrics should not be null or empty')

    const metrics = totalMetrics[0]
    expect(metrics.build_time_unit).toBe(3000) // 50 minutes total in seconds
  })

  it('should correctly record build time using RPC function (iOS 2x multiplier)', async () => {
    const supabase = getSupabaseClient()
    const buildId = randomUUID()

    const { error: rpcError } = await supabase.rpc('record_build_time', {
      p_org_id: ORG_ID,
      p_user_id: USER_ID,
      p_build_id: buildId,
      p_platform: 'ios',
      p_build_time_unit: 600, // 10 minutes
    })
    expect(rpcError).toBeFalsy()

    const { data: buildLog, error } = await supabase
      .from('build_logs')
      .select('*')
      .eq('build_id', buildId)
      .single()
    expect(error).toBeFalsy()
    expect(buildLog?.build_time_unit).toBe(600)
    expect(buildLog?.billable_seconds).toBe(1200) // iOS 2x multiplier
  })

  it('should correctly apply Android 1x multiplier', async () => {
    const supabase = getSupabaseClient()
    const buildId = randomUUID()

    const { error: rpcError } = await supabase.rpc('record_build_time', {
      p_org_id: ORG_ID,
      p_user_id: USER_ID,
      p_build_id: buildId,
      p_platform: 'android',
      p_build_time_unit: 150,
    })
    expect(rpcError).toBeFalsy()

    const { data: buildLog, error } = await supabase
      .from('build_logs')
      .select('*')
      .eq('build_id', buildId)
      .single()
    expect(error).toBeFalsy()
    expect(buildLog?.build_time_unit).toBe(150)
    expect(buildLog?.billable_seconds).toBe(150) // Android 1x multiplier
  })

  it('should upsert on duplicate build_id', async () => {
    const supabase = getSupabaseClient()
    const buildId = randomUUID()

    // First call
    await supabase.rpc('record_build_time', {
      p_org_id: ORG_ID,
      p_user_id: USER_ID,
      p_build_id: buildId,
      p_platform: 'ios',
      p_build_time_unit: 600,
    })

    // Second call with updated time
    const { error: rpcError } = await supabase.rpc('record_build_time', {
      p_org_id: ORG_ID,
      p_user_id: USER_ID,
      p_build_id: buildId,
      p_platform: 'ios',
      p_build_time_unit: 700,
    })
    expect(rpcError).toBeFalsy()

    // Should have updated, not created duplicate
    const { data: logs, error } = await supabase
      .from('build_logs')
      .select('*')
      .eq('build_id', buildId)
    expect(error).toBeFalsy()
    expect(logs?.length).toBe(1)
    expect(logs?.[0]?.build_time_unit).toBe(700)
    expect(logs?.[0]?.billable_seconds).toBe(1400)
  })

  it('should reject invalid platform', async () => {
    const supabase = getSupabaseClient()
    const buildId = randomUUID()

    const { error } = await supabase.rpc('record_build_time', {
      p_org_id: ORG_ID,
      p_user_id: USER_ID,
      p_build_id: buildId,
      p_platform: 'windows' as any,
      p_build_time_unit: 600,
    })
    expect(error).toBeTruthy()
  })

  it('should reject negative build time', async () => {
    const supabase = getSupabaseClient()
    const buildId = randomUUID()

    const { error } = await supabase.rpc('record_build_time', {
      p_org_id: ORG_ID,
      p_user_id: USER_ID,
      p_build_id: buildId,
      p_platform: 'ios',
      p_build_time_unit: -100,
    })
    expect(error).toBeTruthy()
  })
})
