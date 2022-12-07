import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.1/mod.ts'
import { sendRes } from '../_utils/utils.ts'
import { supabaseAdmin, updateVersionStats } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import type { AppStats } from '../_utils/types.ts'

serve(async (event: Request) => {
  try {
    const body = (await event.json()) as AppStats
    console.log('body', body)
    let {
      version_name,
      version_build,
    } = body
    const {
      platform,
      app_id,
      version_os,
      version,
      device_id,
      action,
      plugin_version = '2.3.3',
      custom_id,
      is_emulator = false,
      is_prod = true,
    } = body
    let statsDb = 'stats'
    let deviceDb = 'devices'

    const coerce = semver.coerce(version_build)
    if (coerce)
      version_build = coerce.version
    version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
    const device: Partial<definitions['devices'] | definitions['devices_onprem']> = {
      platform: platform as definitions['stats']['platform'],
      device_id,
      app_id,
      plugin_version,
      os_version: version_os,
      is_emulator: is_emulator === undefined ? false : is_emulator,
      is_prod: is_prod === undefined ? true : is_prod,
      ...(custom_id ? { custom_id } : {}),
    }

    const stat: Partial<definitions['stats']> = {
      platform: platform as definitions['stats']['platform'],
      device_id,
      action,
      app_id,
      version_build,
    }
    const all = []
    const { data, error } = await supabaseAdmin()
      .from('app_versions')
      .select()
      .eq('app_id', app_id)
      .eq('name', version_name || 'unknown')
      .single()
    if (data && !error) {
      stat.version = data.id
      device.version = data.id
      if (!device.is_emulator && device.is_prod) {
        const { data: deviceData, error: deviceError } = await supabaseAdmin()
          .from(deviceDb)
          .select()
          .eq('app_id', app_id)
          .eq('device_id', device_id)
          .single()
        if (deviceData && !deviceError) {
          all.push(updateVersionStats({
            app_id,
            version_id: deviceData.version,
            devices: -1,
          }))
        }
        all.push(updateVersionStats({
          app_id,
          version_id: data.id,
          devices: 1,
        }))
      }
    }
    else if (!device.is_emulator && device.is_prod) {
      console.log('switch to onprem', app_id)
      device.version = version_name || 'unknown' as any
      stat.version = version || 0
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
