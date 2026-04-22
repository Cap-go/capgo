import type { Database } from '../src/types/supabase.types'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  executeSQL,
  getSupabaseClient,
  resetAndSeedAppDataStats,
  resetAppDataStats,
  SUPABASE_ANON_KEY,
  SUPABASE_BASE_URL,
  USER_EMAIL,
  USER_ID,
  USER_PASSWORD,
} from './test-utils.ts'

const orgId = randomUUID()
const staleAppId = `com.chart.refresh.stale.${randomUUID().slice(0, 8)}`
const freshAppId = `com.chart.refresh.fresh.${randomUUID().slice(0, 8)}`

function createAuthClient() {
  return createClient<Database>(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
  })
}

async function clearCronStatAppMessages(appIds: string[]) {
  await executeSQL(
    `DELETE FROM pgmq.q_cron_stat_app WHERE message->'payload'->>'appId' = ANY($1::text[])`,
    [appIds],
  )
}

async function countCronStatAppMessages(appId: string): Promise<number> {
  const rows = await executeSQL(
    `SELECT COUNT(*)::integer AS count FROM pgmq.q_cron_stat_app WHERE message->'payload'->>'appId' = $1`,
    [appId],
  )
  return rows[0]?.count ?? 0
}

async function getAppRefreshState(appId: string) {
  const { data, error } = await getSupabaseClient()
    .from('apps')
    .select('stats_refresh_requested_at,stats_updated_at')
    .eq('app_id', appId)
    .single()

  if (error)
    throw error

  return data
}

describe('chart refresh RPCs', () => {
  const authorizedClient = createAuthClient()
  const unauthorizedClient = createAuthClient()

  beforeAll(async () => {
    await authorizedClient.auth.signInWithPassword({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    })
    await unauthorizedClient.auth.signInWithPassword({
      email: 'test2@capgo.app',
      password: USER_PASSWORD,
    })

    await getSupabaseClient().from('orgs').insert({
      created_by: USER_ID,
      id: orgId,
      management_email: USER_EMAIL,
      name: `Chart Refresh Org ${orgId}`,
      updated_at: new Date().toISOString(),
    }).throwOnError()

    await getSupabaseClient().from('org_users').insert({
      org_id: orgId,
      user_id: USER_ID,
      user_right: 'super_admin',
    }).throwOnError()

    await getSupabaseClient().from('apps').insert([
      {
        app_id: staleAppId,
        created_at: new Date().toISOString(),
        icon_url: '',
        last_version: '1.0.0',
        name: 'Stale Chart Refresh App',
        owner_org: orgId,
        updated_at: new Date().toISOString(),
        user_id: USER_ID,
      },
      {
        app_id: freshAppId,
        created_at: new Date().toISOString(),
        icon_url: '',
        last_version: '1.0.0',
        name: 'Fresh Chart Refresh App',
        owner_org: orgId,
        updated_at: new Date().toISOString(),
        user_id: USER_ID,
      },
    ]).throwOnError()

    await resetAndSeedAppDataStats(staleAppId)
  })

  beforeEach(async () => {
    await clearCronStatAppMessages([staleAppId, freshAppId])

    await getSupabaseClient().from('app_metrics_cache').delete().eq('org_id', orgId).throwOnError()
    await getSupabaseClient().from('orgs').update({
      stats_refresh_requested_at: null,
      stats_updated_at: null,
    }).eq('id', orgId).throwOnError()
    await getSupabaseClient().from('apps').update({
      stats_refresh_requested_at: null,
      stats_updated_at: null,
    }).in('app_id', [staleAppId, freshAppId]).throwOnError()
  })

  afterAll(async () => {
    await clearCronStatAppMessages([staleAppId, freshAppId])
    await resetAppDataStats(staleAppId)
    await getSupabaseClient().from('app_metrics_cache').delete().eq('org_id', orgId)
    await getSupabaseClient().from('apps').delete().in('app_id', [staleAppId, freshAppId])
    await getSupabaseClient().from('org_users').delete().eq('org_id', orgId)
    await getSupabaseClient().from('orgs').delete().eq('id', orgId)
    await authorizedClient.auth.signOut()
    await unauthorizedClient.auth.signOut()
  })

  it('queue_cron_stat_app_for_app only stamps refresh_requested_at when it enqueues work', async () => {
    await getSupabaseClient().from('apps').update({
      stats_updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }).eq('app_id', staleAppId).throwOnError()

    await getSupabaseClient().rpc('queue_cron_stat_app_for_app', {
      p_app_id: staleAppId,
      p_org_id: orgId,
    }).throwOnError()

    const queuedState = await getAppRefreshState(staleAppId)
    expect(queuedState?.stats_refresh_requested_at).toBeTruthy()
    expect(await countCronStatAppMessages(staleAppId)).toBe(1)

    await getSupabaseClient().from('apps').update({
      stats_refresh_requested_at: null,
      stats_updated_at: new Date().toISOString(),
    }).eq('app_id', freshAppId).throwOnError()

    await getSupabaseClient().rpc('queue_cron_stat_app_for_app', {
      p_app_id: freshAppId,
      p_org_id: orgId,
    }).throwOnError()

    const skippedState = await getAppRefreshState(freshAppId)
    expect(skippedState?.stats_refresh_requested_at).toBeNull()
    expect(await countCronStatAppMessages(freshAppId)).toBe(0)
  })

  it('request_app_chart_refresh queues once when stale and rejects users without access', async () => {
    await getSupabaseClient().from('apps').update({
      stats_updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }).eq('app_id', staleAppId).throwOnError()

    const { data: firstResponse, error: firstError } = await authorizedClient.rpc('request_app_chart_refresh', {
      app_id: staleAppId,
    }).single()

    expect(firstError).toBeNull()
    expect(firstResponse?.queued_app_ids).toEqual([staleAppId])
    expect(firstResponse?.queued_count).toBe(1)
    expect(firstResponse?.skipped_count).toBe(0)
    expect(await countCronStatAppMessages(staleAppId)).toBe(1)

    const { data: secondResponse, error: secondError } = await authorizedClient.rpc('request_app_chart_refresh', {
      app_id: staleAppId,
    }).single()

    expect(secondError).toBeNull()
    expect(secondResponse?.queued_count).toBe(0)
    expect(secondResponse?.skipped_count).toBe(1)
    expect(await countCronStatAppMessages(staleAppId)).toBe(1)

    const { data: deniedData, error: deniedError } = await unauthorizedClient.rpc('request_app_chart_refresh', {
      app_id: staleAppId,
    }).single()

    expect(deniedData).toBeNull()
    expect(deniedError?.message).toContain('App access denied')
  })

  it('request_org_chart_refresh stamps org refresh state and only queues stale apps', async () => {
    await getSupabaseClient().from('apps').update({
      stats_updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }).eq('app_id', staleAppId).throwOnError()
    await getSupabaseClient().from('apps').update({
      stats_updated_at: new Date().toISOString(),
    }).eq('app_id', freshAppId).throwOnError()

    const { data, error } = await authorizedClient.rpc('request_org_chart_refresh', {
      org_id: orgId,
    }).single()

    expect(error).toBeNull()
    expect(data?.queued_app_ids).toEqual([staleAppId])
    expect(data?.queued_count).toBe(1)
    expect(data?.skipped_count).toBe(1)
    expect(data?.requested_at).toBeTruthy()

    const { data: orgState, error: orgError } = await getSupabaseClient()
      .from('orgs')
      .select('stats_refresh_requested_at')
      .eq('id', orgId)
      .single()

    expect(orgError).toBeNull()
    expect(orgState?.stats_refresh_requested_at).toBeTruthy()

    const staleState = await getAppRefreshState(staleAppId)
    const freshState = await getAppRefreshState(freshAppId)
    expect(staleState?.stats_refresh_requested_at).toBeTruthy()
    expect(freshState?.stats_refresh_requested_at).toBeNull()
    expect(await countCronStatAppMessages(staleAppId)).toBe(1)
    expect(await countCronStatAppMessages(freshAppId)).toBe(0)
  })

  it('get_app_metrics rebuilds cache immediately when org stats_updated_at is newer than cached_at', async () => {
    const metricDate = new Date()
    metricDate.setHours(0, 0, 0, 0)
    const metricDateText = metricDate.toISOString().slice(0, 10)

    await getSupabaseClient().from('daily_mau').upsert({
      app_id: staleAppId,
      date: metricDateText,
      mau: 5,
    }, {
      onConflict: 'app_id,date',
    }).throwOnError()
    await getSupabaseClient().from('daily_bandwidth').upsert({
      app_id: staleAppId,
      bandwidth: 0,
      date: metricDateText,
    }, {
      onConflict: 'app_id,date',
    }).throwOnError()
    await getSupabaseClient().from('daily_storage').upsert({
      app_id: staleAppId,
      date: metricDateText,
      storage: 0,
    }, {
      onConflict: 'app_id,date',
    }).throwOnError()

    const { data: initialMetrics, error: initialError } = await getSupabaseClient().rpc('get_app_metrics', {
      org_id: orgId,
      start_date: metricDateText,
      end_date: metricDateText,
    })

    expect(initialError).toBeNull()
    const initialRow = initialMetrics?.find(row => row.app_id === staleAppId && row.date === metricDateText)
    expect(initialRow?.mau).toBe(5)

    const cacheRows = await executeSQL(
      'SELECT cached_at FROM public.app_metrics_cache WHERE org_id = $1 LIMIT 1',
      [orgId],
    )
    expect(cacheRows).toHaveLength(1)

    await getSupabaseClient().from('daily_mau').update({ mau: 9 }).eq('app_id', staleAppId).eq('date', metricDateText).throwOnError()

    const { data: cachedMetrics, error: cachedError } = await getSupabaseClient().rpc('get_app_metrics', {
      org_id: orgId,
      start_date: metricDateText,
      end_date: metricDateText,
    })

    expect(cachedError).toBeNull()
    const cachedRow = cachedMetrics?.find(row => row.app_id === staleAppId && row.date === metricDateText)
    expect(cachedRow?.mau).toBe(5)

    const refreshedAt = new Date(new Date(cacheRows[0].cached_at).getTime() + 60_000).toISOString()
    await getSupabaseClient().from('orgs').update({
      stats_updated_at: refreshedAt,
    }).eq('id', orgId).throwOnError()

    const { data: refreshedMetrics, error: refreshedError } = await getSupabaseClient().rpc('get_app_metrics', {
      org_id: orgId,
      start_date: metricDateText,
      end_date: metricDateText,
    })

    expect(refreshedError).toBeNull()
    const refreshedRow = refreshedMetrics?.find(row => row.app_id === staleAppId && row.date === metricDateText)
    expect(refreshedRow?.mau).toBe(9)
  })
})
