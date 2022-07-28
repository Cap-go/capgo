import { serve } from 'https://deno.land/std@0.149.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

const getApp = (appId: string) => {
  const supabase = supabaseAdmin
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  // console.log('req', req)
  return {
    mlu: supabase
      .from<definitions['stats']>('stats')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId)
      .lte('created_at', lastDay.toISOString())
      .gte('created_at', firstDay.toISOString())
      .eq('action', 'get'),
    mlu_real: supabase
      .from<definitions['stats']>('stats')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId)
      .lte('created_at', lastDay.toISOString())
      .gte('created_at', firstDay.toISOString())
      .eq('action', 'set'),
    devices: supabase
      .from<definitions['devices']>('devices')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId)
      .lte('updated_at', lastDay.toISOString())
      .gte('updated_at', firstDay.toISOString()),
    versions: supabase
      .from<definitions['app_versions']>('app_versions')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', appId)
      .eq('deleted', false),
    shared: supabase
      .from<definitions['channel_users']>('channel_users')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', appId),
    channels: supabase
      .from<definitions['channels']>('channels')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', appId),
  }
}
serve(async (event: Request) => {
  const supabase = supabaseAdmin
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret) {
    console.log('Cannot find authorization secret')
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  }
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.log('Fail Authorization', authorizationSecret, API_SECRET)
    return sendRes({ message: 'Fail Authorization', authorizationSecret, API_SECRET }, 400)
  }
  try {
    const { data: apps } = await supabase
      .from<definitions['apps']>('apps')
      .select()

    if (!apps || !apps.length)
      return sendRes({ status: 'error', message: 'no apps' })
    // explore all apps
    const all = []
    for (const app of apps) {
      if (!app.id)
        continue
      const res = getApp(app.app_id)
      all.push(Promise.all([app, res.mlu, res.mlu_real, res.versions, res.shared, res.channels, res.devices])
        .then(([app, mlu, mlu_real, versions, shared, channels, devices]) => {
          if (!app.app_id)
            return
          // console.log('app', app.app_id, downloads, versions, shared, channels)
          // create var date_id with yearn-month
          const now = new Date()
          // get_current_plan_name
          // get month with leading zero
          const month = now.getMonth() + 1 < 10 ? `0${now.getMonth() + 1}` : `${now.getMonth() + 1})`
          const newData: definitions['app_stats'] = {
            app_id: app.app_id,
            date_id: `${now.getFullYear()}-${month}`,
            user_id: app.user_id,
            channels: channels.count || 0,
            mlu: mlu.count || 0,
            devices: devices.count || 0,
            mlu_real: mlu_real.count || 0,
            versions: versions.count || 0,
            shared: shared.count || 0,
          }
          // console.log('newData', newData)
          return supabase
            .from<definitions['app_stats']>('app_stats')
            .upsert(newData)
        }))
    }
    await Promise.all(all)
    return sendRes()
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
