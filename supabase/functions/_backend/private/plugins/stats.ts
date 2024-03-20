import { Hono } from 'hono/tiny'
import type { Context } from 'hono'

import { z } from 'zod'

import * as semver from 'semver'
import {
  INVALID_STRING_APP_ID,
  INVALID_STRING_DEVICE_ID,
  MISSING_STRING_APP_ID,
  MISSING_STRING_DEVICE_ID,
  MISSING_STRING_PLATFORM,
  MISSING_STRING_VERSION_NAME,
  MISSING_STRING_VERSION_OS,
  NON_STRING_APP_ID,
  NON_STRING_DEVICE_ID,
  NON_STRING_PLATFORM,
  NON_STRING_VERSION_NAME,
  NON_STRING_VERSION_OS,
  deviceIdRegex,
  isLimited,
  reverseDomainRegex,
} from '../../utils/utils.ts'
import { getSDevice, supabaseAdmin } from '../../utils/supabase.ts'
import type { AppStats } from '../../utils/types.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { sendNotif } from '../../utils/notifications.ts'
import { logsnag } from '../../utils/logsnag.ts'
import { appIdToUrl } from '../../utils/conversion.ts'
import { BRES } from '../../utils/hono.ts'
import type { DeviceWithoutCreatedAt, StatsActions } from '../../utils/clickhouse.ts'
import { sendStatsAndDevice } from '../../utils/clickhouse.ts'

const failActions = [
  'set_fail',
  'update_fail',
  'download_fail',
]
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
  defaultChannel: z.optional(z.string()),
  plugin_version: z.optional(z.string()),
  is_emulator: z.boolean().default(false),
  is_prod: z.boolean().default(true),
}).refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).refine(data => deviceIdRegex.test(data.device_id), {
  message: INVALID_STRING_DEVICE_ID,
})

async function post(c: Context, body: AppStats) {
  try {
    console.log('body', body)
    if (isLimited(c, body.app_id)) {
      return c.json({
        message: 'Too many requests',
        error: 'too_many_requests',
      }, 200)
    }
    const parseResult: any = jsonRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return c.json({
        error: `Cannot parse json: ${parseResult.error}`,
      }, 400)
    }

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

    const { data: appOwner } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id')
      .eq('app_id', app_id)
      .single()
    if (!appOwner) {
      // TODO: transfer to clickhouse
      // if (app_id) {
      //   await supabaseAdmin(c)
      //     .from('store_apps')
      //     .upsert({
      //       app_id,
      //       onprem: true,
      //       capacitor: true,
      //       capgo: true,
      //     })
      // }
      // if (action === 'get') {
      //   await updateOnpremStats(c, {
      //     app_id,
      //     updates: 1,
      //   })
      // }
      return c.json({
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }

    if (coerce)
      version_build = coerce.version
    console.log(`VERSION NAME: ${version_name}`)
    version_name = !version_name ? version_build : version_name
    const device: DeviceWithoutCreatedAt = {
      platform: platform as Database['public']['Enums']['platform_os'],
      device_id,
      app_id,
      plugin_version,
      os_version: version_os,
      version: 0,
      is_emulator: is_emulator == null ? false : is_emulator,
      is_prod: is_prod == null ? true : is_prod,
      custom_id,
      updated_at: new Date().toISOString(),
    }
    const statsActions: StatsActions[] = []

    const { data: appVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id, user_id')
      .eq('app_id', app_id)
      .or(`name.eq.${version_name}`)
      .single()
    console.log(`appVersion ${JSON.stringify(appVersion)}`)
    if (appVersion) {
      device.version = appVersion.id
      if (action === 'set' && !device.is_emulator && device.is_prod) {
        const res = await getSDevice(c, '', body.app_id, undefined, [body.device_id])
        if (res && res.data && res.data.length) {
          const oldDevice = res.data[0]
          const oldVersion = oldDevice.version
          if (oldVersion !== appVersion.id)
            statsActions.push({ action: 'uninstall', versionId: oldVersion })
        }
      }
      else if (failActions.includes(action)) {
        console.log('FAIL!')
        const sent = await sendNotif(c, 'user:update_fail', {
          current_app_id: app_id,
          current_device_id: device_id,
          current_version_id: appVersion.id,
          current_app_id_url: appIdToUrl(app_id),
        }, appVersion.user_id, '0 0 * * 1', 'orange')
        if (sent) {
          await logsnag(c).track({
            channel: 'updates',
            event: 'update fail',
            icon: '⚠️',
            user_id: appVersion.user_id,
            tags: {
              app_id,
              device_id,
              version_id: appVersion.id,
            },
            notify: false,
          }).catch()
        }
      }
    }
    else {
      console.error('switch to onprem', app_id)
      return c.json({
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }
    statsActions.push({ action })
    await sendStatsAndDevice(c, device, statsActions)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
}

export const app = new Hono()

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<AppStats>()
    console.log('body', body)
    return post(c, body)
  }
  catch (e) {
    return c.json({ status: 'Cannot post stats', error: JSON.stringify(e) }, 500)
  }
})
