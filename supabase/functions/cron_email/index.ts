import { serve } from 'https://deno.land/std@0.199.0/http/server.ts'
import { map } from 'https://deno.land/x/fonction@v1.6.2/mod.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { trackEvent } from '../_utils/plunk.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'

// This is required propoably due to this https://github.com/supabase/postgrest-js/issues/408
interface AppWithUser {
  app_id: string
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
  fail_rate: [
    0.80,
    0.90,
    0.95,
  ],

}

async function main(url: URL, headers: BaseHeaders, method: string, body: any) {
  console.log('called!')
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
      user_id ( id )
    `)

  if (appsError) {
    console.error('appsError', appsError)
    // We have no error handling here, as we call this edge fn from postgress and postgress does not care
    return sendRes()
  }

  // TODO: REMOVE THIS
  let mappedApps = apps as unknown as AppWithUser[]
  mappedApps = mappedApps?.filter(app => app.app_id === 'com.demo.app')

  console.log('apps', mappedApps)

  // Set stats = all updates
  // Sucess updates = set - failed
  // Fail = failed
  for (const mapApp of mappedApps) {
    const { data: weeklyStats, error: generateStatsError } = await supabase.rpc('get_weekly_stats', {
      app_id: mapApp.app_id,
    }).single()

    console.log('weeklyStats', weeklyStats)

    if (generateStatsError) {
      console.error('error', generateStatsError)
      return sendRes()
    }
  }

  const data = {
    app_name: 'test_app',
    fun_comparison: 'fun',
    weekly_updates: '10',
    weekly_install: '4',
    weekly_install_success: '3',
    weekly_fail: '12',
    weekly_open: '100',
    fun_comparison_2: 'idk',
    weekly_open_time: '10min',
    fun_comparison_3: '??',
  }

  // await trackEvent('isupermichael007@gmail.com', data, 'cron-stats')

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
