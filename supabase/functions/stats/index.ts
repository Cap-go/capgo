import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.1/mod.ts'
import { sendRes } from '../_utils/utils.ts'
import { supabaseAdmin, updateVersionStats } from '../_utils/supabase.ts'
import type { AppStats } from '../_utils/types.ts'
import type { Database } from '../_utils/supabase.types.ts'

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
    const device: Database['public']['Tables']['devices']['Insert'] | Database['public']['Tables']['devices_onprem']['Insert'] = {
      platform: platform as Database['public']['Enums']['platform_os'],
      device_id,
      app_id,
      plugin_version,
      os_version: version_os,
      version: version_name || 'unknown' as any,
      is_emulator: is_emulator == null ? false : is_emulator,
      is_prod: is_prod == null ? true : is_prod,
      ...(custom_id != null ? { custom_id } : {}),
    }

    const stat: Database['public']['Tables']['stats']['Insert'] = {
      platform: platform as Database['public']['Enums']['platform_os'],
      device_id,
      action,
      app_id,
      version_build,
      version: version || 0,
    }
    const all = []
    const { data } = await supabaseAdmin()
      .from('app_versions')
      .select('id')
      .eq('app_id', app_id)
      .or(`name.eq.${version_name},name.eq.builtin`)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    if (data) {
      stat.version = data.id
      device.version = data.id
      if (action === 'set' && !device.is_emulator && device.is_prod) {
        const { data: deviceData } = await supabaseAdmin()
          .from(deviceDb)
          .select()
          .eq('app_id', app_id)
          .eq('device_id', device_id)
          .single()
        if (deviceData && deviceData.version !== data.id) {
          all.push(updateVersionStats({
            app_id,
            version_id: deviceData.version,
            devices: -1,
          }))
        }
        if (!deviceData || deviceData.version !== data.id) {
          all.push(updateVersionStats({
            app_id,
            version_id: data.id,
            devices: 1,
          }))
        }
      }
    }
    else {
      console.log('switch to onprem', app_id)
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
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
