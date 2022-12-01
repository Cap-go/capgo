import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { sendRes } from '../_utils/utils.ts'
import { supabaseAdmin, updateVersionStats } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import type { AppStats } from '../_utils/types.ts'

serve(async (event: Request) => {
  try {
    const body = (await event.json()) as AppStats
    let statsDb = 'stats'
    let deviceDb = 'devices'

    console.log('body', body)
    const device: Partial<definitions['devices'] | definitions['devices_onprem']> = {
      platform: body.platform as definitions['stats']['platform'],
      device_id: body.device_id,
      app_id: body.app_id,
      plugin_version: body.plugin_version || '2.3.3',
      os_version: body.version_os,
      is_emulator: body.is_emulator === undefined ? false : body.is_emulator,
      is_prod: body.is_prod === undefined ? true : body.is_prod,
      ...(body.custom_id ? { custom_id: body.custom_id } : {}),
    }

    const stat: Partial<definitions['stats']> = {
      platform: body.platform as definitions['stats']['platform'],
      device_id: body.device_id,
      action: body.action,
      app_id: body.app_id,
      version_build: body.version_build,
    }
    const all = []
    const { data, error } = await supabaseAdmin()
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version_name || 'unknown')
      .single()
    if (data && !error) {
      stat.version = data.id
      device.version = data.id
      if (!device.is_emulator && device.is_prod) {
        const { data: deviceData, error: deviceError } = await supabaseAdmin()
          .from<definitions['devices']>(deviceDb)
          .select()
          .eq('app_id', body.app_id)
          .eq('device_id', body.device_id)
          .single()
        if (deviceData && !deviceError) {
          all.push(updateVersionStats({
            app_id: body.app_id,
            version_id: deviceData.version,
            devices: -1,
          }))
        }
        all.push(updateVersionStats({
          app_id: body.app_id,
          version_id: data.id,
          devices: 1,
        }))
      }
    }
    else if (!device.is_emulator && device.is_prod) {
      console.log('switch to onprem', body.app_id)
      device.version = body.version_name || 'unknown' as any
      stat.version = body.version || 0
      statsDb = `${statsDb}_onprem`
      deviceDb = `${deviceDb}_onprem`
    }
    all.push(supabaseAdmin()
      .from(deviceDb)
      .upsert(device))
    all.push(supabaseAdmin()
      .from(statsDb)
      .insert(stat))
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
