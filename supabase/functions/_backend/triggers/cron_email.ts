import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

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
    const { email, appId } = await c.req.json()

    if (!email || !appId) {
      return c.json({ status: 'Missing email or appId' }, 400)
    }

    const supabase = await supabaseAdmin(c)

    const { data: weeklyStats, error: generateStatsError } = await supabase.rpc('get_weekly_stats', {
      app_id: appId,
    }).single()

    if (!weeklyStats || generateStatsError) {
      console.error({ requestId: c.get('requestId'), context: 'Cannot send email for app', appId, error: generateStatsError, email })
      return c.json({ status: 'Cannot generate stats' }, 500)
    }

    if (weeklyStats.all_updates === 0) {
      return c.json({ status: 'No updates this week' }, 200)
    }

    const sucessUpdates = weeklyStats.all_updates - weeklyStats.failed_updates
    // TODO: uncomment this when better stats are available and enabled back betetr email
    if (sucessUpdates < 0) {
      console.error(c.get('requestId'), 'Cannot send email for app, sucessUpdates < 0', weeklyStats, { app_id: appId, email })
      console.error(c.get('requestId'), 'Invalid stats detected', weeklyStats, { app_id: appId, email })
      return c.json({ status: 'No valid stats available' }, 200)
    }

    const successPercantage = Math.round((sucessUpdates / weeklyStats.all_updates) * 10_000) / 10_000

    const metadata = {
      app_id: appId,
      weekly_updates: (weeklyStats.all_updates).toString(),
      fun_comparison: getFunComparison('updates', weeklyStats.all_updates),
      weekly_install: sucessUpdates.toString(),
      weekly_install_success: (successPercantage * 100).toString(),
      fun_comparison_2: getFunComparison('failRate', successPercantage),
      weekly_fail: (weeklyStats.failed_updates).toString(),
      weekly_open: (weeklyStats.open_app).toString(),
      fun_comparison_3: getFunComparison('appOpen', weeklyStats.open_app),
    }

    await trackBentoEvent(c, email, metadata, 'user:weekly_stats')

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot process email', error: JSON.stringify(e) }, 500)
  }
})
