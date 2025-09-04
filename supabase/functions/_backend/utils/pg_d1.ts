import type { Context } from 'hono'
import { and, eq, or, sql } from 'drizzle-orm'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { alias as aliasV2 } from 'drizzle-orm/sqlite-core'
import { existInEnv } from '../utils/utils.ts'
import { cloudlog, cloudlogErr } from './loggin.ts'
import * as schemaV2 from './sqlite_schema.ts'

export function getAliasV2() {
  const versionAlias = aliasV2(schemaV2.app_versions, 'version')
  const channelDevicesAlias = aliasV2(schemaV2.channel_devices, 'channel_devices')
  const channelAlias = aliasV2(schemaV2.channels, 'channels')
  return { versionAlias, channelDevicesAlias, channelAlias }
}

// Helper function to parse manifestEntries
export function parseManifestEntries(c: Context, data: any, source: string) {
  const result = data.at(0)
  if (result && typeof result.manifestEntries === 'string') {
    try {
      result.manifestEntries = JSON.parse(result.manifestEntries)
    }
    catch (e) {
      cloudlogErr({ requestId: c.get('requestId'), message: `Error parsing manifestEntries for ${source}:`, error: e })
    }
  }
  return result
}

export function getDrizzleClientD1(c: Context) {
  if (!existInEnv(c, 'DB_REPLICATE')) {
    throw new Error('DB_REPLICATE is not set')
  }
  return drizzleD1(c.env.DB_REPLICATE)
}

export function getDrizzleClientD1Session(c: Context) {
  if (!existInEnv(c, 'DB_REPLICATE')) {
    throw new Error('DB_REPLICATE is not set')
  }
  const session = c.env.DB_REPLICATE.withSession('first-unconstrained')
  return drizzleD1(session)
}

export async function isAllowedActionOrgActionD1(c: Context, drizzleCient: ReturnType<typeof getDrizzleClientD1>, orgId: string, actions: ('mau' | 'storage' | 'bandwidth')[]): Promise<boolean> {
  try {
    const conditions = actions.map(action => `${action}_exceeded = 0`).join(' AND ')
    const subQuery = sql<boolean>`EXISTS (
      SELECT 1
      FROM ${schemaV2.stripe_info}
      WHERE customer_id = (SELECT customer_id FROM ${schemaV2.orgs} WHERE id = ${orgId})
      AND (
        (date(trial_at) > date('now'))
        OR (
          status = 'succeeded'
          AND is_good_plan = 1
          ${conditions ? sql` AND ${sql.raw(conditions)}` : sql``}
        )
      )
    )`
    const fullQuery = drizzleCient.select({ is_allowed: subQuery }).from(sql`(SELECT 1)`)
    const result = await fullQuery
    return result[0]?.is_allowed ?? false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isAllowedActionOrgActionD1', error })
  }
  return false
}

export function requestInfosPostgresV2(
  c: Context,
  platform: string,
  app_id: string,
  device_id: string,
  version_name: string,
  defaultChannel: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
) {
  const { versionAlias, channelDevicesAlias, channelAlias } = getAliasV2()

  const appVersions = drizzleCient
    .select({
      id: versionAlias.id,
    })
    .from(versionAlias)
    .where(or(eq(versionAlias.name, version_name), eq(versionAlias.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const channelDeviceQuery = drizzleCient
    .select({
      channel_devices: {
        device_id: channelDevicesAlias.device_id,
        app_id: sql<string>`${channelDevicesAlias.app_id}`.as('cd_app_id'),
      },
      version: {
        id: sql<number>`${versionAlias.id}`.as('vid'),
        name: sql<string>`${versionAlias.name}`.as('vname'),
        checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
        session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
      },
      channels: {
        id: channelAlias.id,
        name: channelAlias.name,
        app_id: channelAlias.app_id,
        allow_dev: channelAlias.allow_dev,
        allow_emulator: channelAlias.allow_emulator,
        disable_auto_update_under_native: channelAlias.disable_auto_update_under_native,
        disable_auto_update: channelAlias.disable_auto_update,
        ios: channelAlias.ios,
        android: channelAlias.android,
        allow_device_self_set: channelAlias.allow_device_self_set,
        public: channelAlias.public,
      },
      manifestEntries: sql<{ file_name: string, file_hash: string, s3_path: string }[]>`json_group_array(json_object(
        'file_name', ${schemaV2.manifest.file_name},
        'file_hash', ${schemaV2.manifest.file_hash},
        's3_path', ${schemaV2.manifest.s3_path}
      ))`,
    },
    )
    .from(channelDevicesAlias)
    .innerJoin(channelAlias, eq(channelDevicesAlias.channel_id, channelAlias.id))
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(schemaV2.manifest, eq(schemaV2.manifest.app_version_id, versionAlias.id))
    .where(and(eq(channelDevicesAlias.device_id, device_id), eq(channelDevicesAlias.app_id, app_id)))
    .groupBy(channelDevicesAlias.device_id, channelDevicesAlias.app_id, channelAlias.id, versionAlias.id)
    .limit(1)

  cloudlog({ requestId: c.get('requestId'), message: 'channelDevice Query:', channelDeviceQuery: channelDeviceQuery.toSQL() })
  const channelDevice = channelDeviceQuery.then((data) => {
    cloudlog({ requestId: c.get('requestId'), message: 'channelDevice data:', data })
    return parseManifestEntries(c, data, 'channelDevice')
  })

  const platformQuery = platform === 'android' ? channelAlias.android : channelAlias.ios
  const channelQuery = drizzleCient
    .select({
      version: {
        id: sql<number>`${versionAlias.id}`.as('vid'),
        name: sql<string>`${versionAlias.name}`.as('vname'),
        checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
        session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
      },
      channels: {
        id: channelAlias.id,
        name: channelAlias.name,
        app_id: channelAlias.app_id,
        allow_dev: channelAlias.allow_dev,
        allow_emulator: channelAlias.allow_emulator,
        disable_auto_update_under_native: channelAlias.disable_auto_update_under_native,
        disable_auto_update: channelAlias.disable_auto_update,
        ios: channelAlias.ios,
        android: channelAlias.android,
        allow_device_self_set: channelAlias.allow_device_self_set,
        public: channelAlias.public,
      },
      manifestEntries: sql<{ file_name: string, file_hash: string, s3_path: string }[]>`json_group_array(json_object(
        'file_name', ${schemaV2.manifest.file_name},
        'file_hash', ${schemaV2.manifest.file_hash},
        's3_path', ${schemaV2.manifest.s3_path}
      ))`,
    })
    .from(channelAlias)
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(schemaV2.manifest, eq(schemaV2.manifest.app_version_id, versionAlias.id))
    .where(!defaultChannel
      ? and(
          eq(channelAlias.public, true),
          eq(channelAlias.app_id, app_id),
          eq(platformQuery, true),
        )
      : and (
          eq(channelAlias.app_id, app_id),
          eq(channelAlias.name, defaultChannel),
        ),
    )
    .groupBy(channelAlias.id, versionAlias.id)
    .limit(1)

  cloudlog({ requestId: c.get('requestId'), message: 'channel Query:', channelQuery: channelQuery.toSQL() })
  const channel = channelQuery.then((data) => {
    cloudlog({ requestId: c.get('requestId'), message: 'channel data:', data })
    return parseManifestEntries(c, data, 'channel')
  })

  return Promise.all([channelDevice, channel, appVersions])
    .then(([channelOverride, channelData, versionData]) => {
      const responseData = { versionData, channelData, channelOverride }
      cloudlog({ requestId: c.get('requestId'), message: 'Final response data:', responseData })
      return responseData
    })
    .catch((e) => {
      throw e
    })
}

export async function getAppOwnerPostgresV2(
  c: Context,
  appId: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
): Promise<{ owner_org: string, orgs: { created_by: string, id: string } } | null> {
  try {
    cloudlog({ requestId: c.get('requestId'), message: 'appOwner', appId })
    const appOwner = await drizzleCient
      .select({
        owner_org: schemaV2.apps.owner_org,
        orgs: {
          created_by: schemaV2.orgs.created_by,
          id: schemaV2.orgs.id,
        },
      })
      .from(schemaV2.apps)
      .where(eq(schemaV2.apps.app_id, appId))
      .innerJoin(aliasV2(schemaV2.orgs, 'orgs'), eq(schemaV2.apps.owner_org, schemaV2.orgs.id))
      .limit(1)
      .then(data => data[0])
    cloudlog({ requestId: c.get('requestId'), message: 'appOwner result', appOwner })
    return appOwner
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getAppOwnerPostgres', error: e })
    return null
  }
}

export async function getAppVersionPostgresV2(c: Context, appId: string, versionName: string, allowedDeleted: boolean | undefined, drizzleCient: ReturnType<typeof getDrizzleClientD1Session>): Promise<{ id: number, owner_org: string } | null> {
  try {
    cloudlog({ requestId: c.get('requestId'), message: 'getAppVersionPostgresV2', appId, versionName })
    const appVersion = await drizzleCient
      .select({
        id: schemaV2.app_versions.id,
        owner_org: schemaV2.app_versions.owner_org,
      })
      .from(schemaV2.app_versions)
      .where(and(
        eq(schemaV2.app_versions.app_id, appId),
        eq(schemaV2.app_versions.name, versionName),
        ...(allowedDeleted !== undefined ? [eq(schemaV2.app_versions.deleted, allowedDeleted)] : []),
      ))
      .limit(1)
      .then(data => data[0])
    cloudlog({ requestId: c.get('requestId'), message: 'getAppVersionPostgresV2 result', appVersion })
    return appVersion
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getAppVersionPostgresV2', error: e })
    return null
  }
}

export async function getAppVersionsByAppIdD1(
  c: Context,
  appId: string,
  versionName: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
): Promise<{ id: number, owner_org: string, name: string }[]> {
  try {
    const versions = await drizzleCient
      .select({
        id: schemaV2.app_versions.id,
        owner_org: schemaV2.app_versions.owner_org,
        name: schemaV2.app_versions.name,
      })
      .from(schemaV2.app_versions)
      .where(and(
        eq(schemaV2.app_versions.app_id, appId),
        or(eq(schemaV2.app_versions.name, versionName), eq(schemaV2.app_versions.name, 'builtin')),
      ))
      .limit(2)
    return versions
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getAppVersionsByAppIdD1', error: e })
    return []
  }
}

export async function getChannelDeviceOverrideD1(
  c: Context,
  appId: string,
  deviceId: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
): Promise<{ app_id: string, device_id: string, channel_id: { id: number, allow_device_self_set: boolean, name: string } } | null> {
  try {
    const result = await drizzleCient
      .select({
        app_id: schemaV2.channel_devices.app_id,
        device_id: schemaV2.channel_devices.device_id,
        channel_id: schemaV2.channels.id,
        allow_device_self_set: schemaV2.channels.allow_device_self_set,
        name: schemaV2.channels.name,
      })
      .from(schemaV2.channel_devices)
      .leftJoin(schemaV2.channels, eq(schemaV2.channel_devices.channel_id, schemaV2.channels.id))
      .where(and(
        eq(schemaV2.channel_devices.app_id, appId),
        eq(schemaV2.channel_devices.device_id, deviceId),
      ))
      .limit(1)
      .then(data => data[0])

    if (!result)
      return null

    // If channel_devices exists but channel doesn't, return null (orphaned record)
    if (!result.channel_id || result.allow_device_self_set === null || !result.name)
      return null

    return {
      app_id: result.app_id,
      device_id: result.device_id,
      channel_id: {
        id: result.channel_id,
        allow_device_self_set: result.allow_device_self_set!,
        name: result.name,
      },
    }
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getChannelDeviceOverrideD1', error: e })
    return null
  }
}

export async function getChannelByNameD1(
  c: Context,
  appId: string,
  channelName: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
): Promise<{ id: number, name: string, allow_device_self_set: boolean, owner_org: string } | null> {
  try {
    const channel = await drizzleCient
      .select({
        id: schemaV2.channels.id,
        name: schemaV2.channels.name,
        allow_device_self_set: schemaV2.channels.allow_device_self_set,
        owner_org: schemaV2.channels.owner_org,
      })
      .from(schemaV2.channels)
      .where(and(
        eq(schemaV2.channels.app_id, appId),
        eq(schemaV2.channels.name, channelName),
      ))
      .limit(1)
      .then(data => data[0])
    return channel
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getChannelByNameD1', error: e })
    return null
  }
}

export async function getMainChannelsD1(
  c: Context,
  appId: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
): Promise<{ name: string, ios: boolean, android: boolean }[]> {
  try {
    const channels = await drizzleCient
      .select({
        name: schemaV2.channels.name,
        ios: schemaV2.channels.ios,
        android: schemaV2.channels.android,
      })
      .from(schemaV2.channels)
      .where(and(
        eq(schemaV2.channels.app_id, appId),
        eq(schemaV2.channels.public, true),
      ))
    return channels
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getMainChannelsD1', error: e })
    return []
  }
}

export async function getChannelsD1(
  c: Context,
  appId: string,
  condition: { defaultChannel?: string } | { public: boolean },
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
): Promise<{ id: number, name: string, ios: boolean, android: boolean, public: boolean }[]> {
  try {
    const whereConditions = [eq(schemaV2.channels.app_id, appId)]

    if ('defaultChannel' in condition && condition.defaultChannel) {
      whereConditions.push(eq(schemaV2.channels.name, condition.defaultChannel))
    }
    else if ('public' in condition) {
      whereConditions.push(eq(schemaV2.channels.public, condition.public))
    }

    const channels = await drizzleCient
      .select({
        id: schemaV2.channels.id,
        name: schemaV2.channels.name,
        ios: schemaV2.channels.ios,
        android: schemaV2.channels.android,
        public: schemaV2.channels.public,
      })
      .from(schemaV2.channels)
      .where(and(...whereConditions))
    return channels
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getChannelsD1', error: e })
    return []
  }
}

export async function getAppByIdD1(
  c: Context,
  appId: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
): Promise<{ owner_org: string } | null> {
  try {
    const app = await drizzleCient
      .select({
        owner_org: schemaV2.apps.owner_org,
      })
      .from(schemaV2.apps)
      .where(eq(schemaV2.apps.app_id, appId))
      .limit(1)
      .then(data => data[0])
    return app
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getAppByIdD1', error: e })
    return null
  }
}

export async function getCompatibleChannelsD1(
  c: Context,
  appId: string,
  platform: 'ios' | 'android',
  isEmulator: boolean,
  isProd: boolean,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
): Promise<{ id: number, name: string, allow_device_self_set: boolean, allow_emulator: boolean, allow_dev: boolean, ios: boolean, android: boolean, public: boolean }[]> {
  try {
    const channels = await drizzleCient
      .select({
        id: schemaV2.channels.id,
        name: schemaV2.channels.name,
        allow_device_self_set: schemaV2.channels.allow_device_self_set,
        allow_emulator: schemaV2.channels.allow_emulator,
        allow_dev: schemaV2.channels.allow_dev,
        ios: schemaV2.channels.ios,
        android: schemaV2.channels.android,
        public: schemaV2.channels.public,
      })
      .from(schemaV2.channels)
      .where(and(
        eq(schemaV2.channels.app_id, appId),
        eq(schemaV2.channels.allow_device_self_set, true),
        eq(schemaV2.channels.allow_emulator, isEmulator),
        eq(schemaV2.channels.allow_dev, isProd),
        eq(platform === 'ios' ? schemaV2.channels.ios : schemaV2.channels.android, true),
      ))
    return channels
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getCompatibleChannelsD1', error: e })
    return []
  }
}
