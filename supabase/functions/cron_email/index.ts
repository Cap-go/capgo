import { serve } from 'https://deno.land/std@0.199.0/http/server.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { trackEvent } from '../_utils/plunk.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'

// This is required propoably due to this https://github.com/supabase/postgrest-js/issues/408
interface AppWithUser {
  app_id: string
  name: string | null
  user_id: {
    email: string
  }
}

const thresholds = {
  updates: [
    100,
    1000,
    10000,
  ],
  failRate: [
    0.80,
    0.90,
    0.95,
  ],
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

function getFunComparison(comparison: 'updates' | 'failRate' | 'appOpen', stat: number): string {
  const thresholdsForComparisons = thresholds[comparison]
  const index = thresholdsForComparisons.map((threshold, index) => {
    if (threshold >= stat)
      return index
    else if ((index === 2 && stat >= threshold))
      return 2 // Last index

    return undefined
  }).find(i => i !== undefined)

  if (index === undefined || index >= 3)
    throw new Error(`Cannot find index for fun comparison, ${index}`)

  return funComparisons[comparison][index]
}

async function main(_url: URL, headers: BaseHeaders, _method: string, _body: any) {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = headers.apisecret
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)

  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.error('Fail Authorization', { authorizationSecret, API_SECRET })
    return sendRes({ message: 'Fail Authorization', authorizationSecret }, 400)
  }

  const supabase = await supabaseAdmin()

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
    return sendRes()
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

    await trackEvent(mapApp.user_id.email, metadata, 'cron-stats')
  }

  return sendRes()
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
