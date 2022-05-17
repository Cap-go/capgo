import { supabaseAdmin } from './supabase.ts'
import type { definitions } from './types_supabase.ts'

const getApp = (appId: string) => {
  const supabase = supabaseAdmin
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  // console.log('req', req)
  return {
    downloads: supabase
      .from<definitions['stats']>('stats')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId)
      .lte('created_at', lastDay.toISOString())
      .gte('created_at', firstDay.toISOString())
      .eq('action', 'set'),
    versions: supabase
      .from<definitions['app_versions']>('app_versions')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId),
    shared: supabase
      .from<definitions['channel_users']>('channel_users')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId),
    channels: supabase
      .from<definitions['channels']>('channels')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId),
  }
}
const supabase = supabaseAdmin

const test = async() => {
  try {
    const { data: apps } = await supabase
      .from<definitions['apps']>('apps')
      .select()

    if (!apps || !apps.length) {
      console.log('no apps')
      return
    }
    // explore all apps
    const all = []
    for (const app of apps) {
      if (!app.app_id)
        continue
      const res = getApp(app.app_id)
      all.push(Promise.all([app, res.downloads, res.versions, res.shared, res.channels])
        .then(([app, downloads, versions, shared, channels]) => {
          if (!app.app_id)
            return
          // console.log('app', app.app_id, downloads, versions, shared, channels)
          const newData: definitions['app_stats'] = {
            app_id: app.app_id,
            user_id: app.user_id,
            channels: channels.count || 0,
            mlu: downloads.count || 0,
            versions: versions.count || 0,
            shared: shared.count || 0,
          }
          console.log('mlu', newData.app_id, newData.mlu)
          return app
          // return supabase
          //   .from<definitions['app_stats']>('app_stats')
          //   .upsert(newData)
        }))
    }
    await Promise.all(all)
  }
  catch (e) {
    console.error(e)
  }
}

test()
