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
  it('should handle too big build time correctly', async () => {
    const supabase = getSupabaseClient()

    // Clear any existing daily_build_time data for this app
    await supabase.from('daily_build_time').delete().eq('app_id', APPNAME)

    // Insert high build time usage directly into daily_build_time
    // (get_total_metrics reads from daily_build_time, not build_logs)
    // Solo plan limit is 1800 seconds (30 min), so we insert way over that
    const today = new Date().toISOString().split('T')[0]
    const { error: buildTimeInsertError } = await supabase
      .from('daily_build_time')
      .insert({
        app_id: APPNAME,
        date: today,
        build_time_unit: 36000, // 10 hours in seconds (way over Solo plan limit of 1800 seconds)
        build_count: 10,
      })
    expect(buildTimeInsertError).toBeFalsy()

    const { error } = await supabase
      .from('stripe_info')
      .update({ is_good_plan: true, trial_at: new Date(0).toISOString() })
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
    if (error)
      throw error

    // First verify the metrics can be retrieved and show excessive build time
    const { data: totalMetrics, error: totalMetricsError } = await supabase
      .rpc('get_total_metrics', { org_id: ORG_ID })
    expect(totalMetricsError).toBeFalsy()
    console.log('Total metrics before cron:', totalMetrics)
    expect((totalMetrics as any)?.[0]?.build_time_unit).toBeGreaterThan(1800)

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

    // These tests verify build time exceeded is blocking build actions
    const { data: isAllowedActionBuildTime, error: isAllowedActionBuildTimeError } = await supabase
      .rpc('is_allowed_action_org_action', { orgid: ORG_ID, actions: ['build_time'] as const })
    expect(isAllowedActionBuildTimeError).toBeFalsy()
    expect(isAllowedActionBuildTime).toBe(false) // Build time should be blocked
  })

  it('should correctly reset build_time_exceeded flag directly', async () => {
    const supabase = getSupabaseClient()

    // First set high build time using build_logs
    const excessiveBuildId = `${randomUUID()}-excessive-reset`
    const { error: rpcError } = await supabase.rpc('record_build_time', {
      p_org_id: ORG_ID,
      p_user_id: USER_ID,
      p_build_id: excessiveBuildId,
      p_platform: 'ios',
      p_build_time_unit: 18000, // 5 hours, 2x multiplier = 10 hours billable
    })
    expect(rpcError).toBeFalsy()

    // Set build_time_exceeded to true directly (simulating what cron would do)
    const { error: setExceededError } = await supabase
      .from('stripe_info')
      .update({ build_time_exceeded: true })
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
    expect(setExceededError).toBeFalsy()

    // Verify build time is exceeded
    const { data: buildTimeExceededBefore, error: buildTimeExceededErrorBefore } = await supabase
      .rpc('is_build_time_exceeded_by_org', { org_id: ORG_ID })
    expect(buildTimeExceededErrorBefore).toBeFalsy()
    expect(buildTimeExceededBefore).toBe(true)

    // Reset build time by deleting build logs
    const { error: resetBuildTimeError } = await supabase
      .from('build_logs')
      .delete()
      .eq('org_id', ORG_ID)
    expect(resetBuildTimeError).toBeFalsy()

    // Reset stripe_info build_time_exceeded flag directly
    const { error: resetFlagError } = await supabase
      .from('stripe_info')
      .update({ build_time_exceeded: false })
      .eq('customer_id', STRIPE_INFO_CUSTOMER_ID)
    expect(resetFlagError).toBeFalsy()

    // Verify build time is no longer exceeded
    const { data: buildTimeExceededAfter, error: buildTimeExceededErrorAfter } = await supabase
      .rpc('is_build_time_exceeded_by_org', { org_id: ORG_ID })
    expect(buildTimeExceededErrorAfter).toBeFalsy()
    expect(buildTimeExceededAfter).toBe(false)
  })

  // Note: get_total_metrics reads from daily_build_time, not build_logs.
  // build_logs are aggregated by a scheduled job, not synchronously.
  // These tests verify record_build_time inserts into build_logs correctly (tested below).
  // Testing get_total_metrics requires inserting into daily_build_time directly.

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
