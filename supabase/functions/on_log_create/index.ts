import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import type { InsertPayload } from '../_utils/supabase.ts'
import { supabaseAdmin, updateOrAppStats } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.

const ignoredEvents = [
  'needPlanUpgrade',
  'invalidIP',
  'noNew',
  'disablePlatformIos',
  'disablePlatformAndroid',
  'disableAutoUpdateToMajor',
  'disableAutoUpdateUnderNative',
  'disableDevBuild',
  'disableEmulator',
]
serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization' }, 400)

  try {
    const table: keyof Database['public']['Tables'] = 'stats'
    const body = (await event.json()) as InsertPayload<typeof table>
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return sendRes({ message: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log('Not INSERT')
      return sendRes({ message: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log('record', record)
    const today_id = new Date().toISOString().slice(0, 10)
    const month_id = new Date().toISOString().slice(0, 7)
    let changed = false
    const increment: Database['public']['Functions']['increment_stats_v2']['Args'] = {
      app_id: record.app_id,
      date_id: today_id,
      bandwidth: 0,
      mlu: 0,
      mlu_real: 0,
      devices: 0,
      devices_real: 0,
      version_size: 0,
      channels: 0,
      shared: 0,
      versions: 0,
    }
    if (record.action === 'set') {
      increment.mlu = 1
      changed = true
    }
    else if (record.action === 'get') {
      increment.mlu_real = 1
      const { data: dataVersionsMeta } = await supabaseAdmin()
        .from('app_versions_meta')
        .select()
        .eq('id', record.version)
        .single()
      if (dataVersionsMeta)
        increment.bandwidth = dataVersionsMeta.size
      else
        console.log('Cannot find version meta', record.version)
      changed = true
    }
    // get device and check if update_at is today
    if (!ignoredEvents.includes(record.action)) {
      const { data: dataDevice } = await supabaseAdmin()
        .from('devices')
        .select()
        .eq('device_id', record.device_id)
        .neq('date_id', month_id)
        .eq('is_emulator', false)
        .eq('is_prod', true)
        .single()
      if (dataDevice && !ignoredEvents.includes(record.action)) {
      // compare date with today
        increment.devices = 1
        changed = true
        const { error } = await supabaseAdmin()
          .from('devices')
          .update({
            date_id: month_id,
          })
          .eq('device_id', record.device_id)
        if (error)
          console.log('Error update device', error)
      }
    }
    if (changed) {
      // get app_versions_meta
      const { data: dataApp } = await supabaseAdmin()
        .from('apps')
        .select()
        .eq('app_id', record.app_id)
        .single()
      if (!dataApp) {
        console.log('Cannot find app', record.app_id)
        return sendRes()
      }
      await updateOrAppStats(increment, today_id, dataApp.user_id)
    }

    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
