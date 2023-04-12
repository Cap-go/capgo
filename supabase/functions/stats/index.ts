import { serve } from 'https://deno.land/std@0.182.0/http/server.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.1/mod.ts'
import { methodJson, sendRes } from '../_utils/utils.ts'
import { supabaseAdmin, updateOnpremStats, updateVersionStats } from '../_utils/supabase.ts'
import type { AppStats, BaseHeaders } from '../_utils/types.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { sendNotif } from '../_utils/notifications.ts'
import { logsnag } from '../_utils/logsnag.ts'
import { appIdToUrl } from './../_utils/conversion.ts'

const failActions = [
  'set_fail',
  'update_fail',
  'download_fail',
]
async function main(url: URL, headers: BaseHeaders, method: string, body: AppStats) {
  try {
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

    const coerce = semver.coerce(version_build)

    const { data: appOwner } = await supabaseAdmin()
      .from('apps')
      .select('user_id, app_id')
      .eq('app_id', app_id)
      .single()

    if (!appOwner) {
      if (app_id) {
        await supabaseAdmin()
          .from('store_apps')
          .upsert({
            app_id,
            onprem: true,
            capacitor: true,
            capgo: true,
          })
      }
      if (action === 'get') {
        await updateOnpremStats({
          app_id,
          updates: 1,
        })
      }
      return sendRes({
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }

    if (coerce)
      version_build = coerce.version
    version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
    const device: Database['public']['Tables']['devices']['Insert'] = {
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
    const { data: appVersion } = await supabaseAdmin()
      .from('app_versions')
      .select('id, user_id')
      .eq('app_id', app_id)
      .or(`name.eq.${version_name},name.eq.builtin`)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    if (appVersion) {
      stat.version = appVersion.id
      device.version = appVersion.id
      if (action === 'set' && !device.is_emulator && device.is_prod) {
        const { data: deviceData } = await supabaseAdmin()
          .from('devices')
          .select()
          .eq('app_id', app_id)
          .eq('device_id', device_id)
          .single()
        if (deviceData && deviceData.version !== appVersion.id) {
          all.push(updateVersionStats({
            app_id,
            version_id: deviceData.version,
            install: 0,
            uninstall: 1,
            fail: 0,
          }))
        }
        if (!deviceData || deviceData.version !== appVersion.id) {
          all.push(updateVersionStats({
            app_id,
            version_id: appVersion.id,
            install: 1,
            uninstall: 0,
            fail: 0,
          }))
        }
      }
      else if (failActions.includes(action)) {
        const sent = await sendNotif('user:update_fail', {
          current_app_id: app_id,
          current_device_id: device_id,
          current_version_id: appVersion.id,
          current_app_id_url: appIdToUrl(app_id),
        }, appVersion.user_id, '0 0 * * 1', 'orange')
        if (sent) {
          await logsnag.publish({
            channel: 'updates',
            event: 'update fail',
            icon: '⚠️',
            tags: {
              'user-id': appVersion.user_id,
            },
            notify: false,
          }).catch()
        }
        all.push(updateVersionStats({
          app_id,
          version_id: appVersion.id,
          install: 0,
          uninstall: 0,
          fail: 1,
        }))
      }
    }
    else {
      console.error('switch to onprem', app_id)
      return sendRes({
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }
    all.push(supabaseAdmin()
      .from('devices')
      .upsert(device)
      .then(() => supabaseAdmin()
        .from('stats')
        .insert(stat)))
    await Promise.all(all)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
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
