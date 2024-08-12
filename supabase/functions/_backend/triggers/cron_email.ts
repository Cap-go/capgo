import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { trackBentoEvent } from '../utils/bento.ts'

// This is required propoably due to this https://github.com/supabase/postgrest-js/issues/408
interface AppWithUser {
  app_id: string
  name: string | null
  user_id: {
    email: string
  }
}

const thresholds = {
  // Number of updates in plain number
  updates: [
    100,
    1000,
    10000,
  ],
  // Percentage in decimal form (0.9 ==== 90%)
  failRate: [
    0.80,
    0.90,
    0.95,
  ],
  // Number of app opens in plain number
  appOpen: [
    500,
    1500,
    5000,
  ],
}

const funComparisons = {
  updates: [
    'a cupcake to every student in a small school!',
    'a pizza to every resident of a small town!',
    'a burger to everyone in a big city!',
  ],
  failRate: [
    'Even cats don\'t land on their feet that often!',
    'That\'s a success rate higher than the average pass rate of a tough university exam!',
    'That\'s a success rate that even the best basketball players would envy!',
  ],
  appOpen: [
    'Your app was opened more times than a popular local bakery\'s door!',
    'Your app was more popular than the latest episode of a hit TV show!',
    'Your app was opened more times than a blockbuster movie on its opening weekend!',
  ],
}

// Check what treshold does the stat qualify for and return the fun comparison
function getFunComparison(comparison: keyof typeof funComparisons, stat: number): string {
  const thresholdsForComparisons = thresholds[comparison]
  const index = thresholdsForComparisons.findIndex((threshold, index) => {
    const thresholdGreaterThenStat = threshold >= stat
    const lastIndexAndStatGreaterOrEqualThreshold = index === 2 && stat >= threshold

    return thresholdGreaterThenStat || lastIndexAndStatGreaterOrEqualThreshold
  })

  if (index === -1 || index >= 3)
    throw new Error(`Cannot find index for fun comparison, ${index}`)

  return funComparisons[comparison][index]
}

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const supabase = await supabaseAdmin(c)

    const { data: apps, error: appsError } = await supabase
      .from('apps')
      .select(`
        app_id,
        name,
        user_id ( id, email )
      `)

    if (appsError) {
      console.error('appsError', appsError)
      // We have no error handling here, as we call this edge fn from postgress and postgress does not care
      return c.json(BRES)
    }

    // We propably do not need this, however for whatever reason supabase does not like our join
    const mappedApps = apps as unknown as AppWithUser[]

    // Set stats = all updates
    // Sucess updates = set - failed
    // Fail = failed
    for (const mapApp of mappedApps) {
      const { data: weeklyStats, error: generateStatsError } = await supabase.rpc('get_weekly_stats', {
        app_id: mapApp.app_id,
      }).single()

      if (!weeklyStats || generateStatsError) {
        console.error('Cannot send email for app', mapApp.app_id, generateStatsError, mapApp.user_id.email)
        continue
      }

      if (weeklyStats.all_updates === 0)
        continue

      const sucessUpdates = weeklyStats.all_updates - weeklyStats.failed_updates
      if (sucessUpdates < 0) {
        console.error('Cannot send email for app, sucessUpdates < 0', weeklyStats, mapApp)
        continue
      }

      const successPercantage = Math.round((sucessUpdates / weeklyStats.all_updates) * 10_000) / 10_000

      const metadata = {
        app_id: mapApp.app_id,
        weekly_updates: (weeklyStats.all_updates).toString(),
        fun_comparison: getFunComparison('updates', weeklyStats.all_updates),
        weekly_install: sucessUpdates.toString(),
        weekly_install_success: (successPercantage * 100).toString(),
        fun_comparison_2: getFunComparison('failRate', successPercantage),
        weekly_fail: (weeklyStats.failed_updates).toString(),
        weekly_open: (weeklyStats.open_app).toString(),
        fun_comparison_3: getFunComparison('appOpen', weeklyStats.open_app),
      }

      await trackBentoEvent(c, mapApp.user_id.email, metadata, 'cron-stats')
    }

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot process emails', error: JSON.stringify(e) }, 500)
  }
})
