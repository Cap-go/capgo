import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { getDrizzleClientD1 } from '../utils/pg_d1.ts'
import type { Database } from '../utils/supabase.types.ts'
import type { AppStats, DeviceWithoutCreatedAt, StatsActions } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/v4-mini'
import { appIdToUrl } from '../utils/conversion.ts'
import { BRES, getIsV2, parseBody, quickError, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { sendNotifOrg } from '../utils/notifications.ts'
import { closeClient, getAppOwnerPostgres, getAppVersionPostgres, getDrizzleClient, getPgClient, isAllowedActionOrgActionPg } from '../utils/pg.ts'
import { getAppOwnerPostgresV2, getAppVersionPostgresV2, getDrizzleClientD1Session, isAllowedActionOrgActionD1 } from '../utils/pg_d1.ts'
import { parsePluginBody } from '../utils/plugin_parser.ts'
import { createStatsVersion, opnPremStats, sendStatsAndDevice } from '../utils/stats.ts'
import { deviceIdRegex, INVALID_STRING_APP_ID, INVALID_STRING_DEVICE_ID, isLimited, MISSING_STRING_APP_ID, MISSING_STRING_DEVICE_ID, MISSING_STRING_PLATFORM, MISSING_STRING_VERSION_NAME, MISSING_STRING_VERSION_OS, NON_STRING_APP_ID, NON_STRING_DEVICE_ID, NON_STRING_PLATFORM, NON_STRING_VERSION_NAME, NON_STRING_VERSION_OS, reverseDomainRegex } from '../utils/utils.ts'

const failActions = [
  'set_fail',
  'update_fail',
  'download_fail',
]
z.config(z.locales.en())
export const jsonRequestSchema = z.object({
  app_id: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_APP_ID : NON_STRING_APP_ID,
  }).check(z.regex(reverseDomainRegex, { message: INVALID_STRING_APP_ID })),
  device_id: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_DEVICE_ID : NON_STRING_DEVICE_ID,
  }).check(z.maxLength(36), z.regex(deviceIdRegex, { message: INVALID_STRING_DEVICE_ID })),
  platform: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_PLATFORM : NON_STRING_PLATFORM,
  }),
  version_name: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_VERSION_NAME : NON_STRING_VERSION_NAME,
  }),
  old_version_name: z.optional(z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_VERSION_NAME : NON_STRING_VERSION_NAME,
  })),
  version_os: z.string({
    error: issue => issue.input === undefined ? MISSING_STRING_VERSION_OS : NON_STRING_VERSION_OS,
  }),
  version_code: z.optional(z.string()),
  version_build: z.optional(z.string()),
  action: z.optional(z.string()),
  custom_id: z.optional(z.string()),
  channel: z.optional(z.string()),
  defaultChannel: z.optional(z.string()),
  plugin_version: z.optional(z.string()),
  is_emulator: z.boolean(),
  is_prod: z.boolean(),
})

async function post(c: Context, drizzleCient: ReturnType<typeof getDrizzleClient> | ReturnType<typeof getDrizzleClientD1Session>, isV2: boolean, body: AppStats) {
  const {
    version_name,
    version_build,
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
  const appOwner = isV2 ? await getAppOwnerPostgresV2(c, app_id, drizzleCient as ReturnType<typeof getDrizzleClientD1Session>) : await getAppOwnerPostgres(c, app_id, drizzleCient as ReturnType<typeof getDrizzleClient>)
  if (!appOwner) {
    return opnPremStats(c, app_id, action, device)
  }
  const statsActions: StatsActions[] = []

  let allowedDeleted = false
  if (version_name === 'builtin' || version_name === 'unknown') {
    allowedDeleted = true
  }
  const appVersion = isV2 ? await getAppVersionPostgresV2(c, app_id, version_name, allowedDeleted, drizzleCient as ReturnType<typeof getDrizzleClientD1Session>) : await getAppVersionPostgres(c, app_id, version_name, allowedDeleted, drizzleCient as ReturnType<typeof getDrizzleClient>)
  if (!appVersion) {
    throw quickError(404, 'version_not_found', 'Version not found', { app_id, version_name })
  }
  const planValid = isV2 ? await isAllowedActionOrgActionD1(c, drizzleCient as ReturnType<typeof getDrizzleClientD1>, appOwner.orgs.id, ['mau', 'bandwidth']) : await isAllowedActionOrgActionPg(c, drizzleCient as ReturnType<typeof getDrizzleClient>, appOwner.orgs.id, ['mau', 'bandwidth'])
  if (!planValid) {
    throw simpleError('action_not_allowed', 'Action not allowed', { appVersion, app_id, owner_org: appVersion.owner_org })
  }
  device.version = appVersion.id
  if (action === 'set' && !device.is_emulator && device.is_prod) {
    await createStatsVersion(c, device.version, app_id, 'install')
    if (old_version_name) {
      const oldVersion = isV2 ? await getAppVersionPostgresV2(c, app_id, old_version_name, undefined, drizzleCient as ReturnType<typeof getDrizzleClientD1Session>) : await getAppVersionPostgres(c, app_id, old_version_name, undefined, drizzleCient as ReturnType<typeof getDrizzleClient>)
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

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', async (c) => {
  const body = await parseBody<AppStats>(c)
  if (isLimited(c, body.app_id)) {
    throw simpleError('too_many_requests', 'Too many requests')
  }
  const isV2 = getIsV2(c)
  const pgClient = isV2 ? null : getPgClient(c)

  const bodyParsed = parsePluginBody<AppStats>(c, body, jsonRequestSchema)
  let res
  try {
    res = await post(c, isV2 ? getDrizzleClientD1Session(c) : getDrizzleClient(pgClient as any), !!isV2, bodyParsed)
  }
  catch (e) {
    throw simpleError('unknow_error', `Error unknow`, { body }, e)
  }
  if (isV2 && pgClient)
    await closeClient(c, pgClient)
  return res
})

app.get('/', (c) => {
  return c.json(BRES)
})
