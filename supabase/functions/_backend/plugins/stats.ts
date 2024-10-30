import type { Context } from '@hono/hono'
import type { DeviceWithoutCreatedAt, StatsActions } from '../utils/stats.ts'
import type { Database } from '../utils/supabase.types.ts'
import type { AppStats } from '../utils/types.ts'
import { format, tryParse } from '@std/semver'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { saveStoreInfoCF, updateStoreApp } from '../utils/cloudflare.ts'
import { appIdToUrl } from '../utils/conversion.ts'
import { BRES } from '../utils/hono.ts'
import { sendNotifOrg } from '../utils/notifications.ts'
import { createStatsVersion, sendStatsAndDevice } from '../utils/stats.ts'
import { isAllowedActionOrg, supabaseAdmin } from '../utils/supabase.ts'
import { deviceIdRegex, fixSemver, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, isLimited, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_PLATFORM, MISSING_STRING_VERSION_NAME, MISSING_STRING_VERSION_OS, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_PLATFORM, NON_STRING_VERSION_NAME, NON_STRING_VERSION_OS, reverseDomainRegex } from '../utils/utils.ts'

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
  old_version_name: z.optional(z.string({
    required_error: MISSING_STRING_VERSION_NAME,
    invalid_type_error: NON_STRING_VERSION_NAME,
  })),
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
      old_version_name,
      app_id,
      version_os,
      device_id,
      action,
      plugin_version = '2.3.3',
      custom_id,
      is_emulator = false,
      is_prod = true,
    } = body

    const coerce = tryParse(fixSemver(version_build))

    const { data: appOwner } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id')
      .eq('app_id', app_id)
      .single()
    if (!appOwner) {
      if (app_id) {
        await saveStoreInfoCF(c, {
          app_id,
          onprem: true,
          capacitor: true,
          capgo: true,
        })
      }
      if (action === 'get')
        await updateStoreApp(c, app_id, 1)

      return c.json({
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }

    if (coerce)
      version_build = format(coerce)
    console.log({ requestId: c.get('requestId'), context: `VERSION NAME: ${version_name}` })
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
      .select('id, owner_org')
      .eq('app_id', app_id)
      .or(`name.eq.${version_name}`)
      .single()
    console.log({ requestId: c.get('requestId'), context: `appVersion ${JSON.stringify(appVersion)}` })
    if (!appVersion) {
      console.error({ requestId: c.get('requestId'), context: 'switch to onprem', app_id })
      return c.json({
        message: 'App not found',
        error: 'app_not_found',
      }, 200)
    }
    if (!(await isAllowedActionOrg(c, appVersion.owner_org))) {
      return c.json({
        message: 'Action not allowed',
        error: 'action_not_allowed',
      }, 200)
    }
    device.version = appVersion.id
    if (action === 'set' && !device.is_emulator && device.is_prod) {
      await createStatsVersion(c, device.version, app_id, 'install')
      if (old_version_name) {
        const { data: oldVersion } = await supabaseAdmin(c)
          .from('app_versions')
          .select('id')
          .eq('app_id', app_id)
          .eq('name', old_version_name)
          .single()
        if (oldVersion && oldVersion.id !== appVersion.id) {
          await createStatsVersion(c, oldVersion.id, app_id, 'uninstall')
          statsActions.push({ action: 'uninstall', versionId: oldVersion.id })
        }
      }
    }
    else if (failActions.includes(action)) {
      await createStatsVersion(c, appVersion.id, app_id, 'fail')
      console.log({ requestId: c.get('requestId'), context: 'FAIL!' })
      await sendNotifOrg(c, 'user:update_fail', {
        app_id,
        device_id,
        version_id: appVersion.id,
        app_id_url: appIdToUrl(app_id),
      }, appVersion.owner_org, app_id, '0 0 * * 1')
    }
    statsActions.push({ action: action as unknown as StatsActions })
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
    console.log({ requestId: c.get('requestId'), context: 'post plugin/stats body', body })
    return post(c, body)
  }
  catch (e) {
    return c.json({ status: 'Cannot post stats', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', (c: Context) => {
  return c.json({ status: 'ok' })
})
