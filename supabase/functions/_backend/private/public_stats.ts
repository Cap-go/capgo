import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { REQUIRED_GLOBAL_STATS_SHARDS } from '../utils/global_stats.ts'
import { useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { getPublicLiveUpdateMetricsCF } from '../utils/cloudflare.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

export function getLatestCompletedGlobalStatsDateId(referenceDate = new Date()) {
  const completedDay = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate() - 1,
  ))

  return completedDay.toISOString().slice(0, 10)
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

app.get('/live_updates', async (c) => {
  const metrics = await getPublicLiveUpdateMetricsCF(c)
  return c.json({
    period_days: 30,
    updated_at: new Date().toISOString(),
    ...metrics,
  }, 200, {
    'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
  })
})
})
