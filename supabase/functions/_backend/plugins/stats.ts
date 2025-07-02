import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeviceWithoutCreatedAt, StatsActions } from '../utils/stats.ts'
import type { Database } from '../utils/supabase.types.ts'
import type { AppStats } from '../utils/types.ts'
import { format, tryParse } from '@std/semver'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { createIfNotExistStoreInfo, updateStoreApp } from '../utils/cloudflare.ts'
import { appIdToUrl } from '../utils/conversion.ts'
import { BRES } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { sendNotifOrg } from '../utils/notifications.ts'
import { createStatsLogsExternal, createStatsVersion, sendStatsAndDevice } from '../utils/stats.ts'
import { isAllowedActionOrg, supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask, deviceIdRegex, fixSemver, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, isLimited, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_PLATFORM, MISSING_STRING_VERSION_NAME, MISSING_STRING_VERSION_OS, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_PLATFORM, NON_STRING_VERSION_NAME, NON_STRING_VERSION_OS, reverseDomainRegex } from '../utils/utils.ts'

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

async function opnPremStats(c: Context, app_id: string, action: string, device: DeviceWithoutCreatedAt) {
  if (app_id) {
    await createIfNotExistStoreInfo(c, {
      app_id,
      onprem: true,
      capacitor: true,
      capgo: true,
    })
  }
  if (action === 'get')
    await updateStoreApp(c, app_id, 1)
  // save stats of unknow sources in our analytic DB
  await backgroundTask(c, createStatsLogsExternal(c, device.app_id, device.device_id, 'get', device.version))
  cloudlog({ requestId: c.get('requestId'), message: 'App is external', app_id: device.app_id, country: (c.req.raw as any)?.cf?.country })
}

async function post(c: Context, body: AppStats) {
  try {
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
    if (!coerce) {
      return c.json({
        message: 'Invalid version build',
        error: 'invalid_version_build',
      }, 400)
    }
    version_build = format(coerce)
    cloudlog({ requestId: c.get('requestId'), message: `VERSION NAME: ${version_name}, VERSION BUILD: ${version_build}` })
    version_name = !version_name ? version_build : version_name
    const device: DeviceWithoutCreatedAt = {
      platform: platform as Database['public']['Enums']['platform_os'],
      device_id,
      app_id,
      plugin_version,
      version_build,
      os_version: version_os,
      version: 0,
      is_emulator: is_emulator ?? false,
      is_prod: is_prod ?? true,
      custom_id,
      updated_at: new Date().toISOString(),
    }
    const { data: appOwner } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id')
      .eq('app_id', app_id)
      .single()
    if (!appOwner) {
      await opnPremStats(c, app_id, action, device)
      return c.json({
        message: 'App not found',
        error: 'app_not_found',
      }, 400)
    }
    const statsActions: StatsActions[] = []

    let allowedDeleted = false
    if (version_name === 'builtin' || version_name === 'unknown') {
      allowedDeleted = true
    }
    const { data: appVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id, owner_org')
      .eq('app_id', app_id)
      .or(`name.eq.${version_name}`)
      .eq('deleted', allowedDeleted)
      .single()
    cloudlog({ requestId: c.get('requestId'), message: `appVersion ${JSON.stringify(appVersion)}` })
    if (!appVersion) {
      cloudlog({ requestId: c.get('requestId'), message: 'switch to onprem', app_id })
      return c.json({
        message: 'Version not found',
        error: 'version_not_found',
      }, 400)
    }
    if (!(await isAllowedActionOrg(c, appVersion.owner_org))) {
      return c.json({
        message: 'Action not allowed',
        error: 'action_not_allowed',
      }, 400)
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
      cloudlog({ requestId: c.get('requestId'), message: 'FAIL!' })
      await sendNotifOrg(c, 'user:update_fail', {
        app_id,
        device_id,
        version_id: appVersion.id,
        app_id_url: appIdToUrl(app_id),
      }, appVersion.owner_org, app_id, '0 0 * * 1')
    }
    statsActions.push({ action } as unknown as StatsActions)
    await sendStatsAndDevice(c, device, statsActions)
    return c.json(BRES)
  }
  catch (e) {
    cloudlog({ requestId: c.get('requestId'), message: `Error unknow: ${e}` })
    return c.json({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', async (c) => {
  try {
    const body = await c.req.json<AppStats>()
    if (isLimited(c, body.app_id)) {
      cloudlog({ requestId: c.get('requestId'), message: 'Too many requests' })
      return c.json({
        message: 'Too many requests',
        error: 'too_many_requests',
      }, 400)
    }
    const parseResult: any = jsonRequestSchema.safeParse(body)
    if (!parseResult.success) {
      cloudlog({ requestId: c.get('requestId'), message: `Cannot parse json: ${parseResult.error}` })
      return c.json({
        error: `Cannot parse json: ${parseResult.error}`,
      }, 400)
    }
    cloudlog({ requestId: c.get('requestId'), message: 'post plugin/stats body', body })
    return post(c, body)
  }
  catch (e) {
    cloudlog({ requestId: c.get('requestId'), message: `Error unknow: ${e}` })
    return c.json({ status: 'Cannot post stats', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', (c) => {
  return c.json({ status: 'ok' })
})
