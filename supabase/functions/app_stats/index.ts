import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

const getApp = (appId: string) => {
  const supabase = supabaseAdmin
  return {
    downloads: supabase
      .from<definitions['stats']>('stats')
      .select()
      .eq('app_id', appId)
      .eq('action', 'get'),
    versions: supabase
      .from<definitions['app_versions']>('app_versions')
      .select('*', { count: 'exact' })
      .eq('app_id', appId),
    shared: supabase
      .from<definitions['channel_users']>('channel_users'),
    channels: supabase
      .from<definitions['channels']>('channels')
      .select('*', { count: 'exact' })
      .eq('app_id', appId),
  }
}
serve(async(event: Request) => {
  const supabase = supabaseAdmin
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.error('Fail Authorization')
    return sendRes({ message: 'Fail Authorization' }, 400)
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
      const res = getApp(app.id)
      all.push(Promise.all([app, res.downloads, res.versions, res.shared, res.channels])
        .then(([app, downloads, versions, shared, channels]) => {
          if (!app.id)
            return
          const newData: definitions['app_stats'] = {
            app_id: app.app_id,
            user_id: app.user_id,
            channels: channels.data?.length || 0,
            mlu: downloads.data?.length || 0,
            versions: versions.data?.length || 0,
            shared: shared.data?.length || 0,
          }
          console.log('newData', newData)
          return supabase
            .from<definitions['app_stats']>('app_stats')
            .upsert(newData)
        }))
    }
    await Promise.all(all)
    return sendRes()
  }
  catch (e) {
    console.error(e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
