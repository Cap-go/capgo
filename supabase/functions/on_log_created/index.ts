import { serve } from 'https://deno.land/std@0.151.0/http/server.ts'
import type { AppStatsIncrement } from '../_utils/supabase.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
serve(async (event: Request) => {
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.log('Fail Authorization')
    return sendRes({ message: 'Fail Authorization' }, 400)
  }
  try {
    const body = (await event.json()) as { record: definitions['stats'] }
    const record = body.record
    console.log('record', record)
    const today_id = new Date().toISOString().slice(0, 10)
    const month_id = new Date().toISOString().slice(0, 7)
    let changed = false
    const increment: AppStatsIncrement = {
      app_id: record.app_id,
      date_id: today_id,
      bandwidth: 0,
      mlu: 0,
      mlu_real: 0,
      devices: 0,
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
      const { data: dataVersionsMeta } = await supabaseAdmin
        .from<definitions['app_versions_meta']>('app_versions_meta')
        .select()
        .eq('id', record.id)
        .single()
      if (dataVersionsMeta)
        increment.bandwidth = dataVersionsMeta.size
      changed = true
    }
    // get device and check if update_at is today
    const { data: dataDevice } = await supabaseAdmin
      .from<definitions['devices']>('devices')
      .select()
      .eq('device_id', record.device_id)
      .single()
    if (dataDevice) {
      // compare date with today
      if (dataDevice.date_id !== month_id) {
        increment.devices = 1
        changed = true
        await supabaseAdmin
          .from<definitions['devices']>('devices')
          .update({
            date_id: month_id,
          })
          .eq('device_id', record.device_id)
      }
    }
    if (changed) {
      const { error } = await supabaseAdmin
        .rpc('increment_stats', increment)
      if (error)
        console.error('increment_stats', error)
    }
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
