import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { serve } from 'https://deno.land/std@0.207.0/http/server.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.1/mod.ts'
import {
  INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_PLATFORM, MISSING_STRING_VERSION_NAME,
  MISSING_STRING_VERSION_OS, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_PLATFORM, NON_STRING_VERSION_NAME, NON_STRING_VERSION_OS,
  deviceIdRegex, isLimited, methodJson, reverseDomainRegex, sendRes,
} from '../_utils/utils.ts'
import { getSDevice, sendDevice, sendStats, supabaseAdmin } from '../_utils/supabase.ts'
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

// ios sends 13 fields while android sends 11 fields
export const jsonRequestSchema = z.object({
  app_id: z.string({
    required_error: MISSING_STRING_APP_ID,
    invalid_type_error: NON_STRING_APP_ID,
  }),
  device_id: z.string({
    required_error: MISSING_STRING_DEVICE_ID,
    invalid_type_error: NON_STRING_DEVICE_ID,
  }).max(36),
  platform: z.string({
    required_error: MISSING_STRING_PLATFORM,
    invalid_type_error: NON_STRING_PLATFORM,
  }),
  version_name: z.string({
    required_error: MISSING_STRING_VERSION_NAME,
    invalid_type_error: NON_STRING_VERSION_NAME,
  }),
  version_os: z.string({
    required_error: MISSING_STRING_VERSION_OS,
    invalid_type_error: NON_STRING_VERSION_OS,
  }),
  version_code: z.optional(z.string()),
  version_build: z.optional(z.string()),
  action: z.optional(z.string()),
  custom_id: z.optional(z.string()),
  channel: z.optional(z.string()),
  plugin_version: z.optional(z.string()),
  is_emulator: z.boolean().default(false),
  is_prod: z.boolean().default(true),
}).refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).refine(data => deviceIdRegex.test(data.device_id), {
  message: INVALID_STRING_DEVICE_ID,
})

async function main(url: URL, headers: BaseHeaders, method: string, body: AppStats) {
  try {
    console.log('body', body)
    if (isLimited(body.app_id)) {
      return sendRes({
        message: 'Too many requests',
        error: 'too_many_requests',
      }, 200)
    }
    const parseResult: any = jsonRequestSchema.safeParse(body)
    if (!parseResult.success)
      return sendRes({ error: `Cannot parse json: ${parseResult.error}` }, 400)

    let {
      version_name,
      version_build,
    } = body
    const {
      platform,
      app_id,
      version_os,
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
      .select('app_id')
      .eq('app_id', app_id)
      .single()
    if (!appOwner) {
      // TODO: transfer to clickhouse
      // if (app_id) {
      //   await supabaseAdmin()
      //     .from('store_apps')
      //     .upsert({
      //       app_id,
      //       onprem: true,
      //       capacitor: true,
      //       capgo: true,
      //     })
      // }
      // if (action === 'get') {
      //   await updateOnpremStats({
      //     app_id,
      //     updates: 1,
      //   })
      // }
      return sendRes({
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }

    if (coerce)
      version_build = coerce.version
    console.log(`VERSION NAME: ${version_name}`)
    version_name = !version_name ? version_build : version_name
    const device: Database['public']['Tables']['devices']['Insert'] = {
      platform: platform as Database['public']['Enums']['platform_os'],
      device_id,
      app_id,
      plugin_version,
      os_version: version_os,
      version: version_name || 'unknown' as any,
      is_emulator: is_emulator == null ? false : is_emulator,
      is_prod: is_prod == null ? true : is_prod,
      custom_id,
    }

    const stat: Database['public']['Tables']['stats']['Insert'] = {
      platform: platform as Database['public']['Enums']['platform_os'],
      device_id,
      action,
      app_id,
      version_build,
      version: 0,
    }
    const rows: Database['public']['Tables']['stats']['Insert'][] = []
    const { data: appVersion } = await supabaseAdmin()
      .from('app_versions')
      .select('id, user_id')
      .eq('app_id', app_id)
      .or(`name.eq.${version_name}`)
      .single()
    console.log(`appVersion ${JSON.stringify(appVersion)}`)
    if (appVersion) {
      stat.version = appVersion.id
      device.version = appVersion.id
      if (action === 'set' && !device.is_emulator && device.is_prod) {
        const res = await getSDevice('', body.app_id, undefined, [body.device_id])
        if (res && res.data && res.data.length) {
          const oldDevice = res.data[0]
          const oldVersion = oldDevice.version
          if (oldVersion !== appVersion.id) {
            const statUninstall: Database['public']['Tables']['stats']['Insert'] = {
              ...stat,
              action: 'uninstall',
              version: oldVersion,
            }
            rows.push(statUninstall)
          }
        }
      }
      else if (failActions.includes(action)) {
        console.log('FAIL!')
        const sent = await sendNotif('user:update_fail', {
          current_app_id: app_id,
          current_device_id: device_id,
          current_version_id: appVersion.id,
          current_app_id_url: appIdToUrl(app_id),
        }, appVersion.user_id, '0 0 * * 1', 'orange')
        if (sent) {
          await logsnag.track({
            channel: 'updates',
            event: 'update fail',
            icon: '⚠️',
            user_id: appVersion.user_id,
            notify: false,
          }).catch()
        }
      }
    }
    else {
      console.error('switch to onprem', app_id)
      return sendRes({
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }
    rows.push(stat)
    await Promise.all([sendDevice(device).then(() => sendStats(rows))])
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
