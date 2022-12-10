import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import type { UpdatePayload } from '../_utils/supabase.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { sendRes } from '../_utils/utils.ts'
import type { Database } from './../_utils/supabase.types.ts'

const allDayOfMonth = () => {
  const lastDay = new Date(new Date().getFullYear(), 10, 0).getDate()
  const days = []
  for (let d = 1; d <= lastDay; d++)
    days.push(d)

  return days
}
const getApp = (userId: string, appId: string) => {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  // console.log('req', req)
  return {
    mlu: supabaseAdmin()
      .from('stats')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId)
      .lte('created_at', lastDay.toISOString())
      .gte('created_at', firstDay.toISOString())
      .eq('action', 'get'),
    mlu_real: supabaseAdmin()
      .from('stats')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId)
      .lte('created_at', lastDay.toISOString())
      .gte('created_at', firstDay.toISOString())
      .eq('action', 'set'),
    devices: supabaseAdmin()
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId)
      .eq('is_emulator', false)
      .eq('is_prod', true)
      .lte('updated_at', lastDay.toISOString())
      .gte('updated_at', firstDay.toISOString()),
    devicesTT: supabaseAdmin()
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', appId)
      .lte('updated_at', lastDay.toISOString())
      .gte('updated_at', firstDay.toISOString()),
    bandwidth: supabaseAdmin()
      .from('app_stats')
      .select()
      .eq('app_id', appId)
      .in('date_id', allDayOfMonth()),
    versions: supabaseAdmin()
      .from('app_versions_meta')
      .select()
      .eq('app_id', appId)
      .eq('user_id', userId),
    shared: supabaseAdmin()
      .from('channel_users')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', appId),
    channels: supabaseAdmin()
      .from('channels')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', appId),
  }
}
serve(async (event: Request) => {
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)

  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization', authorizationSecret, API_SECRET }, 400)

  try {
    const table: keyof Database['public']['Tables'] = 'app_stats'
    const body = (await event.json()) as UpdatePayload<typeof table>
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return sendRes({ message: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log('Not UPDATE')
      return sendRes({ message: 'Not UPDATE' }, 200)
    }
    const record = body.record
    console.log('record', record, event.headers)
    const month_id = new Date().toISOString().slice(0, 7)

    if (record.date_id === month_id)
      return sendRes({ message: 'Already updated' }, 200)

    const all = []
    if (!record.user_id || !record.app_id) {
      console.log('No user_id or app_id')
      return sendRes({ message: 'No user_id or app_id' }, 200)
    }

    const res = getApp(record.user_id, record.app_id)
    all.push(Promise.all([record, res.mlu, res.mlu_real, res.versions, res.shared, res.channels, res.devices, res.devicesTT, res.bandwidth])
      .then(([app, mlu, mlu_real, versions, shared, channels, devices, devicesTT, bandwidth]) => {
        // console.log('app', app.app_id, devices, versions, shared, channels)
        // check if today is first day of the month
        const versionSize = versions.data?.reduce((acc, cur) => acc + (cur.size || 0), 0) || 0
        const bandwidthTotal = bandwidth.data?.reduce((acc, cur) => acc + (cur.bandwidth || 0), 0) || 0
        const newData: Database['public']['Tables']['app_stats']['Insert'] = {
          app_id: app.app_id || '',
          date_id: month_id,
          user_id: app.user_id || '',
          channels: channels.count || 0,
          mlu: mlu.count || 0,
          mlu_real: mlu_real.count || 0,
          devices: devices.count || 0,
          devices_real: devicesTT.count || 0,
          versions: versions.data?.length || 0,
          version_size: versionSize,
          shared: shared.count || 0,
          bandwidth: bandwidthTotal,
        }
        // console.log('newData', newData)
        return supabaseAdmin()
          .from('app_stats')
          .upsert(newData)
      }))
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
