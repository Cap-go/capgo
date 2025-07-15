import type { Context } from 'hono'
import { and, eq, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { backgroundTask, existInEnv, getEnv } from '../utils/utils.ts'
import { cloudlog, cloudlogErr } from './loggin.ts'
import * as schema from './postgress_schema.ts'

export function getDatabaseURL(c: Context): string {
  // TODO: uncomment when we enable back replicate
  // const clientContinent = (c.req.raw as any)?.cf?.continent
  // cloudlog({ requestId: c.get('requestId'), message: 'clientContinent', clientContinent  })
  let DEFAULT_DB_URL = getEnv(c, 'SUPABASE_DB_URL')
  if (existInEnv(c, 'CUSTOM_SUPABASE_DB_URL'))
    DEFAULT_DB_URL = getEnv(c, 'CUSTOM_SUPABASE_DB_URL')

  if (existInEnv(c, 'HYPERDRIVE_DB'))
    return (getEnv(c, 'HYPERDRIVE_DB') as any as Hyperdrive).connectionString

  // // Default to Germany for any other cases
  return DEFAULT_DB_URL
}

export function getPgClient(c: Context) {
  const dbUrl = getDatabaseURL(c)
  cloudlog({ requestId: c.get('requestId'), message: 'SUPABASE_DB_URL', dbUrl })
  return postgres(dbUrl, { prepare: false, idle_timeout: 2 })
}

export function getDrizzleClient(client: ReturnType<typeof getPgClient>) {
  return drizzle(client as any, { logger: true })
}

export function closeClient(c: Context, client: ReturnType<typeof getPgClient>) {
  // cloudlog(c.get('requestId'), 'Closing client', client)
  return backgroundTask(c, client.end())
}

export async function isAllowedActionOrgActionPg(c: Context, drizzleCient: ReturnType<typeof getDrizzleClient>, orgId: string, actions: ('mau' | 'storage' | 'bandwidth')[]): Promise<boolean> {
  try {
    const sqls = [sql`SELECT is_allowed_action_org_action(${orgId}, ARRAY[`]
    actions.forEach((action, index) => index !== actions.length - 1 ? sqls.push(sql`${action},`) : sqls.push(sql`${action}`))
    sqls.push(sql`]::action_type[]) AS is_allowed`)

    const result = await drizzleCient.execute<{ is_allowed: boolean }>(
      sql.join(sqls),
    )
    return result[0]?.is_allowed ?? false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isAllowedActionOrg', error })
  }
  return false
}

export async function isAllowedActionOrgPg(c: Context, drizzleCient: ReturnType<typeof getDrizzleClient>, orgId: string): Promise<boolean> {
  try {
    // Assuming you have a way to get your database connection string

    const result = await drizzleCient.execute<{ is_allowed: boolean }>(
      sql`SELECT is_allowed_action_org(${orgId}) AS is_allowed`,
    )

    return result[0]?.is_allowed ?? false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'isAllowedActionOrg', error })
  }
  return false
}

export function getAlias() {
  const versionAlias = alias(schema.app_versions, 'version')
  const channelDevicesAlias = alias(schema.channel_devices, 'channel_devices')
  const channelAlias = alias(schema.channels, 'channels')
  return { versionAlias, channelDevicesAlias, channelAlias }
}

export function requestInfosPostgres(
  c: Context,
  platform: string,
  app_id: string,
  device_id: string,
  version_name: string,
  defaultChannel: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
) {
  const { versionAlias, channelDevicesAlias, channelAlias } = getAlias()

  const appVersionsQuery = drizzleCient
    .select({
      id: versionAlias.id,
    })
    .from(versionAlias)
    .where(or(eq(versionAlias.name, version_name), eq(versionAlias.app_id, app_id)))
    .limit(1)
  cloudlog({ requestId: c.get('requestId'), message: 'appVersions Query:', appVersionsQuery: appVersionsQuery.toSQL() })
  const appVersions = appVersionsQuery.then(data => data.at(0))

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
      manifestEntries: sql<{ file_name: string, file_hash: string, s3_path: string }[]>`array_agg(json_build_object(
        'file_name', ${schema.manifest.file_name},
        'file_hash', ${schema.manifest.file_hash},
        's3_path', ${schema.manifest.s3_path}
      ))`,
    },
    )
    .from(channelDevicesAlias)
    .innerJoin(channelAlias, eq(channelDevicesAlias.channel_id, channelAlias.id))
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(schema.manifest, eq(schema.manifest.app_version_id, versionAlias.id))
    .where(and(eq(channelDevicesAlias.device_id, device_id), eq(channelDevicesAlias.app_id, app_id)))
    .groupBy(channelDevicesAlias.device_id, channelDevicesAlias.app_id, channelAlias.id, versionAlias.id)
    .limit(1)
  cloudlog({ requestId: c.get('requestId'), message: 'channelDevice Query:', channelDeviceQuery: channelDeviceQuery.toSQL() })
  const channelDevice = channelDeviceQuery.then(data => data.at(0))

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
      manifestEntries: sql<{ file_name: string, file_hash: string, s3_path: string }[]>`array_agg(json_build_object(
        'file_name', ${schema.manifest.file_name},
        'file_hash', ${schema.manifest.file_hash},
        's3_path', ${schema.manifest.s3_path}
      ))`,
    })
    .from(channelAlias)
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(schema.manifest, eq(schema.manifest.app_version_id, versionAlias.id))
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
  const channel = channelQuery.then(data => data.at(0))

  return Promise.all([channelDevice, channel, appVersions])
    .then(([channelOverride, channelData, versionData]) => ({ versionData, channelData, channelOverride }))
    .catch((e) => {
      throw e
    })
}

export async function getAppOwnerPostgres(
  c: Context,
  appId: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ owner_org: string, orgs: { created_by: string, id: string } } | null> {
  try {
    const appOwner = await drizzleCient
      .select({
        owner_org: schema.apps.owner_org,
        orgs: {
          created_by: schema.orgs.created_by,
          id: schema.orgs.id,
        },
      })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, appId))
      .innerJoin(alias(schema.orgs, 'orgs'), eq(schema.apps.owner_org, schema.orgs.id))
      .limit(1)
      .then(data => data[0])

    return appOwner
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getAppOwnerPostgres', error: e })
    return null
  }
}

export async function getAppVersionPostgres(
  c: Context,
  appId: string,
  versionName: string,
  allowedDeleted: boolean | undefined,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, owner_org: string } | null> {
  try {
    const appVersion = await drizzleCient
      .select({
        id: schema.app_versions.id,
        owner_org: schema.app_versions.owner_org,
      })
      .from(schema.app_versions)
      .where(and(
        eq(schema.app_versions.app_id, appId),
        eq(schema.app_versions.name, versionName),
        ...(allowedDeleted !== undefined ? [eq(schema.app_versions.deleted, allowedDeleted)] : []),
      ))
      .limit(1)
      .then(data => data[0])
    return appVersion
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getAppVersionPostgres', error: e })
    return null
  }
}

export async function getAppVersionsByAppIdPg(
  c: Context,
  appId: string,
  versionName: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, owner_org: string, name: string }[]> {
  try {
    const versions = await drizzleCient
      .select({
        id: schema.app_versions.id,
        owner_org: schema.app_versions.owner_org,
        name: schema.app_versions.name,
      })
      .from(schema.app_versions)
      .where(and(
        eq(schema.app_versions.app_id, appId),
        or(eq(schema.app_versions.name, versionName), eq(schema.app_versions.name, 'builtin')),
      ))
      .limit(2)
    return versions
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getAppVersionsByAppIdPg', error: e })
    return []
  }
}

export async function getChannelDeviceOverridePg(
  c: Context,
  appId: string,
  deviceId: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ app_id: string, device_id: string, channel_id: { id: number, allow_device_self_set: boolean, name: string } } | null> {
  try {
    const result = await drizzleCient
      .select({
        app_id: schema.channel_devices.app_id,
        device_id: schema.channel_devices.device_id,
        channel_id: schema.channels.id,
        allow_device_self_set: schema.channels.allow_device_self_set,
        name: schema.channels.name,
      })
      .from(schema.channel_devices)
      .leftJoin(schema.channels, eq(schema.channel_devices.channel_id, schema.channels.id))
      .where(and(
        eq(schema.channel_devices.app_id, appId),
        eq(schema.channel_devices.device_id, deviceId),
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
    cloudlogErr({ requestId: c.get('requestId'), message: 'getChannelDeviceOverridePg', error: e })
    return null
  }
}

export async function getChannelByNamePg(
  c: Context,
  appId: string,
  channelName: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, name: string, allow_device_self_set: boolean, owner_org: string } | null> {
  try {
    const channel = await drizzleCient
      .select({
        id: schema.channels.id,
        name: schema.channels.name,
        allow_device_self_set: schema.channels.allow_device_self_set,
        owner_org: schema.channels.owner_org,
      })
      .from(schema.channels)
      .where(and(
        eq(schema.channels.app_id, appId),
        eq(schema.channels.name, channelName),
      ))
      .limit(1)
      .then(data => data[0])
    return channel
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getChannelByNamePg', error: e })
    return null
  }
}

export async function getMainChannelsPg(
  c: Context,
  appId: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ name: string, ios: boolean, android: boolean }[]> {
  try {
    const channels = await drizzleCient
      .select({
        name: schema.channels.name,
        ios: schema.channels.ios,
        android: schema.channels.android,
      })
      .from(schema.channels)
      .where(and(
        eq(schema.channels.app_id, appId),
        eq(schema.channels.public, true),
      ))
    return channels
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getMainChannelsPg', error: e })
    return []
  }
}

export async function deleteChannelDevicePg(
  c: Context,
  appId: string,
  deviceId: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<boolean> {
  try {
    await drizzleCient
      .delete(schema.channel_devices)
      .where(and(
        eq(schema.channel_devices.app_id, appId),
        eq(schema.channel_devices.device_id, deviceId),
      ))
    return true
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'deleteChannelDevicePg', error: e })
    return false
  }
}

export async function upsertChannelDevicePg(
  c: Context,
  data: { device_id: string, channel_id: number, app_id: string, owner_org: string },
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<boolean> {
  try {
    await drizzleCient
      .insert(schema.channel_devices)
      .values({
        device_id: data.device_id,
        channel_id: data.channel_id,
        app_id: data.app_id,
      })
      .onConflictDoUpdate({
        target: [schema.channel_devices.device_id, schema.channel_devices.app_id],
        set: {
          channel_id: data.channel_id,
          updated_at: new Date(),
        },
      })
    return true
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'upsertChannelDevicePg', error: e })
    return false
  }
}

export async function getChannelsPg(
  c: Context,
  appId: string,
  condition: { defaultChannel?: string } | { public: boolean },
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, name: string, ios: boolean, android: boolean, public: boolean }[]> {
  try {
    const whereConditions = [eq(schema.channels.app_id, appId)]

    if ('defaultChannel' in condition && condition.defaultChannel) {
      whereConditions.push(eq(schema.channels.name, condition.defaultChannel))
    }
    else if ('public' in condition) {
      whereConditions.push(eq(schema.channels.public, condition.public))
    }

    const channels = await drizzleCient
      .select({
        id: schema.channels.id,
        name: schema.channels.name,
        ios: schema.channels.ios,
        android: schema.channels.android,
        public: schema.channels.public,
      })
      .from(schema.channels)
      .where(and(...whereConditions))
    return channels
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getChannelsPg', error: e })
    return []
  }
}

export async function getAppByIdPg(
  c: Context,
  appId: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ owner_org: string } | null> {
  try {
    const app = await drizzleCient
      .select({
        owner_org: schema.apps.owner_org,
      })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, appId))
      .limit(1)
      .then(data => data[0])
    return app
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getAppByIdPg', error: e })
    return null
  }
}

export async function getCompatibleChannelsPg(
  c: Context,
  appId: string,
  platform: 'ios' | 'android',
  isEmulator: boolean,
  isProd: boolean,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, name: string, allow_device_self_set: boolean, allow_emulator: boolean, allow_dev: boolean, ios: boolean, android: boolean, public: boolean }[]> {
  try {
    const channels = await drizzleCient
      .select({
        id: schema.channels.id,
        name: schema.channels.name,
        allow_device_self_set: schema.channels.allow_device_self_set,
        allow_emulator: schema.channels.allow_emulator,
        allow_dev: schema.channels.allow_dev,
        ios: schema.channels.ios,
        android: schema.channels.android,
        public: schema.channels.public,
      })
      .from(schema.channels)
      .where(and(
        eq(schema.channels.app_id, appId),
        eq(schema.channels.allow_device_self_set, true),
        eq(schema.channels.allow_emulator, isEmulator),
        eq(schema.channels.allow_dev, isProd),
        eq(platform === 'ios' ? schema.channels.ios : schema.channels.android, true),
      ))
    return channels
  }
  catch (e: any) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getCompatibleChannelsPg', error: e })
    return []
  }
}
