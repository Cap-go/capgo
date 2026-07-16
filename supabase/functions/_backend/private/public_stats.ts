import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { PublicLiveUpdateMetrics } from '../utils/cloudflare.ts'
import { Hono } from 'hono/tiny'
import { REQUIRED_GLOBAL_STATS_SHARDS } from '../utils/global_stats.ts'
import { useCors } from '../utils/hono.ts'
import { CacheHelper } from '../utils/cache.ts'
import { getPublicLiveUpdateMetricsCF } from '../utils/cloudflare.ts'
import { cloudlog, cloudlogErr, serializeError } from '../utils/logging.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

const LIVE_UPDATE_METRICS_CACHE_TTL_SECONDS = 300
const LIVE_UPDATE_METRICS_CACHE_PATH = '/.public-live-update-metrics'
const LIVE_UPDATE_METRICS_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
}

type LiveUpdateMetricsResponse = PublicLiveUpdateMetrics & {
  period_days: number
  updated_at: string
}

app.use('*', useCors)

export function getLatestCompletedGlobalStatsDateId(referenceDate = new Date()) {
  const completedDay = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate() - 1,
  ))

  return completedDay.toISOString().slice(0, 10)
}

export async function getGlobalStatsSuccessRates(c: Context, referenceDate = new Date()) {
  const latestCompletedDateId = getLatestCompletedGlobalStatsDateId(referenceDate)
  const start = new Date(`${latestCompletedDateId}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - 29)
  const startDateId = start.toISOString().slice(0, 10)

  const { data, error } = await supabaseAdmin(c)
    .from('global_stats')
    .select('date_id, success_rate')
    .gte('date_id', startDateId)
    .lte('date_id', latestCompletedDateId)
    .not('success_rate', 'is', null)
    .order('date_id', { ascending: true })

  if (error)
    throw error

  const daily = (data ?? []).map(row => ({
    date: row.date_id,
    success_rate: Number(row.success_rate) || 0,
  }))

  return {
    success_rate: daily.at(-1)?.success_rate ?? 0,
    daily,
  }
}

app.get('/', async (c) => {
  const latestCompletedDateId = getLatestCompletedGlobalStatsDateId()
  const { data, error } = await supabaseAdmin(c)
    .from('global_stats')
    .select()
    .lte('date_id', latestCompletedDateId)
    .contains('completed_shards', [...REQUIRED_GLOBAL_STATS_SHARDS])
    .order('date_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data && !error) {
    return c.json({
      apps: data.apps,
      updates: (data.updates ?? 0) + (data.updates_external ?? 0),
      stars: data.stars,
    })
  }
  cloudlog({ requestId: c.get('requestId'), message: 'Missing completed global_stats row', latestCompletedDateId, error })
  return c.json({
    apps: 1688,
    updates: 1862788600,
    stars: 595,
  })
})

app.get('/live_updates', async (c) => {
  const cache = new CacheHelper(c)
  const cacheKey = cache.buildRequest(LIVE_UPDATE_METRICS_CACHE_PATH)
  let response = await cache.matchJson<LiveUpdateMetricsResponse>(cacheKey)

  if (!response) {
    try {
      const [successRates, breakdown] = await Promise.all([
        getGlobalStatsSuccessRates(c),
        getPublicLiveUpdateMetricsCF(c),
      ])
      response = {
        period_days: 30,
        updated_at: new Date().toISOString(),
        ...breakdown,
        ...successRates,
      }
      await cache.putJson(cacheKey, response, LIVE_UPDATE_METRICS_CACHE_TTL_SECONDS)
    }
    catch (error) {
      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'Public live update metrics are unavailable',
        error: serializeError(error),
      })
      return c.json(
        { error: 'Live update metrics are temporarily unavailable' },
        503,
        { 'Cache-Control': 'no-store' },
      )
    }
  }

  return c.json(response, 200, LIVE_UPDATE_METRICS_HEADERS)
})
