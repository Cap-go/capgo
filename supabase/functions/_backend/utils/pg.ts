import type { Context } from '@hono/hono'
import { and, eq, or, sql } from 'drizzle-orm'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { alias } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { alias as aliasV2 } from 'drizzle-orm/sqlite-core'
import { getRuntimeKey } from 'hono/adapter'
// import { drizzle } from 'drizzle-orm/neon-http';
import postgres from 'postgres'
import * as schema from './postgress_schema.ts'
import * as schemaV2 from './sqlite_schema.ts'
import { existInEnv, getEnv } from './utils.ts'

export function getDatabaseURL(c: Context): string {
  // TODO: uncomment when we enable back replicate
  // const clientContinent = (c.req.raw as any)?.cf?.continent
  // console.log({ requestId: c.get('requestId'), context: 'clientContinent', clientContinent })
  let DEFAULT_DB_URL = getEnv(c, 'SUPABASE_DB_URL')
  if (existInEnv(c, 'CUSTOM_SUPABASE_DB_URL'))
    DEFAULT_DB_URL = getEnv(c, 'CUSTOM_SUPABASE_DB_URL')

  // if (!clientContinent)
  //   return DEFAULT_DB_URL

  // // European countries or Africa or Antarctica
  // if ((clientContinent === 'EU' || clientContinent === 'AF' || clientContinent === 'AN')) {
  //   return DEFAULT_DB_URL
  // }

  // // Asian and Oceanian countries
  // if ((clientContinent === 'AS' || clientContinent === 'OC') && existInEnv(c, 'SG_SUPABASE_DB_URL')) {
  //   return getEnv(c, 'SG_SUPABASE_DB_URL')
  // }

  // // North and South American countries
  // if ((clientContinent === 'NA' || clientContinent === 'SA') && existInEnv(c, 'GK_SUPABASE_DB_URL')) {
  //   return getEnv(c, 'GK_SUPABASE_DB_URL')
  // }

  // // Default to Germany for any other cases
  return DEFAULT_DB_URL
}

export function getPgClient(c: Context) {
  const dbUrl = getDatabaseURL(c)
  console.log({ requestId: c.get('requestId'), context: 'SUPABASE_DB_URL', dbUrl })
  return postgres(dbUrl, { prepare: false, idle_timeout: 2 })
}

export function getDrizzleClient(client: ReturnType<typeof getPgClient>) {
  return drizzle(client as any, { logger: true })
}

export function getDrizzleClientD1(c: Context) {
  if (!existInEnv(c, 'DB_REPLICATE')) {
    throw new Error('DB_REPLICATE is not set')
  }
  return drizzleD1(c.env.DB_REPLICATE)
}

export function getDrizzleClientD1Session(c: Context) {
  // TODO: try when available in Cloudflare
  const token = c.req.raw.headers.get('x-d1-token') ?? 'first-unconditional'
  const session = c.env.DB_REPLICATE.withSession(token)
  return drizzleD1(session)
}

export function closeClient(c: Context, client: ReturnType<typeof getPgClient>) {
  // c.executionCtx.waitUntil(Promise.resolve())
  // console.log(c.get('requestId'), 'Closing client', client)
  if (getRuntimeKey() === 'workerd')
    c.executionCtx.waitUntil(client.end())
  else
    client.end()
}

export async function isAllowedActionOrgPg(c: Context, drizzleCient: ReturnType<typeof getDrizzleClient>, orgId: string): Promise<boolean> {
  try {
    // Assuming you have a way to get your database connection string

    const result = await drizzleCient.execute<{ is_allowed: boolean }>(
      sql`SELECT is_allowed_action_org(${orgId}) AS is_allowed`,
    )

    return result[0]?.is_allowed || false
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'isAllowedActionOrg', error })
  }
  return false
}

function getAlias() {
  const versionAlias = alias(schema.app_versions, 'version')
  const secondVersionAlias = alias(schema.app_versions, 'second_version')
  const devicesOverrideAlias = alias(schema.devices_override, 'devices_override')
  const channelDevicesAlias = alias(schema.channel_devices, 'channel_devices')
  const channelAlias = alias(schema.channels, 'channels')
  return { versionAlias, secondVersionAlias, devicesOverrideAlias, channelDevicesAlias, channelAlias }
}
function getAliasV2() {
  const versionAlias = aliasV2(schemaV2.app_versions, 'version')
  const secondVersionAlias = aliasV2(schemaV2.app_versions, 'second_version')
  const devicesOverrideAlias = aliasV2(schemaV2.devices_override, 'devices_override')
  const channelDevicesAlias = aliasV2(schemaV2.channel_devices, 'channel_devices')
  const channelAlias = aliasV2(schemaV2.channels, 'channels')
  return { versionAlias, secondVersionAlias, devicesOverrideAlias, channelDevicesAlias, channelAlias }
}
export async function requestInfosPostgres(
  platform: string,
  app_id: string,
  device_id: string,
  version_name: string,
  defaultChannel: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
) {
  const { versionAlias, secondVersionAlias, devicesOverrideAlias, channelDevicesAlias, channelAlias } = getAlias()

  const appVersions = drizzleCient
    .select({
      id: versionAlias.id,
    })
    .from(versionAlias)
    .where(or(eq(versionAlias.name, version_name), eq(versionAlias.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const deviceOverwrite = drizzleCient
    .select({
      device_id: devicesOverrideAlias.device_id,
      app_id: devicesOverrideAlias.app_id,
      version: {
        id: versionAlias.id,
        name: versionAlias.name,
        checksum: versionAlias.checksum,
        session_key: versionAlias.session_key,
        bucket_id: versionAlias.bucket_id,
        storage_provider: versionAlias.storage_provider,
        external_url: versionAlias.external_url,
        min_update_version: versionAlias.min_update_version,
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
    })
    .from(devicesOverrideAlias)
    .innerJoin(versionAlias, eq(devicesOverrideAlias.version, versionAlias.id))
    .where(and(eq(devicesOverrideAlias.device_id, device_id), eq(devicesOverrideAlias.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const channelDevice = drizzleCient
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
        bucket_id: sql<string | null>`${versionAlias.bucket_id}`.as('vbucket_id'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
      secondVersion: {
        id: sql<number>`${secondVersionAlias.id}`.as('svid'),
        name: sql<string>`${secondVersionAlias.name}`.as('svname'),
        checksum: sql<string | null>`${secondVersionAlias.checksum}`.as('svchecksum'),
        session_key: sql<string | null>`${secondVersionAlias.session_key}`.as('svsession_key'),
        bucket_id: sql<string | null>`${secondVersionAlias.bucket_id}`.as('svbucket_id'),
        storage_provider: sql<string>`${secondVersionAlias.storage_provider}`.as('svstorage_provider'),
        external_url: sql<string | null>`${secondVersionAlias.external_url}`.as('svexternal_url'),
        min_update_version: sql<string | null>`${secondVersionAlias.min_update_version}`.as('svminUpdateVersion'),
        r2_path: sql`${secondVersionAlias.r2_path}`.mapWith(secondVersionAlias.r2_path).as('svr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('svmanifest'),
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
        secondary_version_percentage: channelAlias.secondary_version_percentage,
        enable_progressive_deploy: channelAlias.enable_progressive_deploy,
        enable_ab_testing: channelAlias.enable_ab_testing,
        allow_device_self_set: channelAlias.allow_device_self_set,
        public: channelAlias.public,
      },
    },
    )
    .from(channelDevicesAlias)
    .innerJoin(channelAlias, eq(channelDevicesAlias.channel_id, channelAlias.id))
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(channelAlias.second_version, secondVersionAlias.id))
    .where(and(eq(channelDevicesAlias.device_id, device_id), eq(channelDevicesAlias.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  // v => version
  // sv => secondversion
  const channel = drizzleCient
    .select({
      version: {
        id: sql<number>`${versionAlias.id}`.as('vid'),
        name: sql<string>`${versionAlias.name}`.as('vname'),
        checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
        session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
        bucket_id: sql<string | null>`${versionAlias.bucket_id}`.as('vbucket_id'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
      secondVersion: {
        id: sql<number>`${secondVersionAlias.id}`.as('svid'),
        name: sql<string>`${secondVersionAlias.name}`.as('svname'),
        checksum: sql<string | null>`${secondVersionAlias.checksum}`.as('svchecksum'),
        session_key: sql<string | null>`${secondVersionAlias.session_key}`.as('svsession_key'),
        bucket_id: sql<string | null>`${secondVersionAlias.bucket_id}`.as('svbucket_id'),
        storage_provider: sql<string>`${secondVersionAlias.storage_provider}`.as('svstorage_provider'),
        external_url: sql<string | null>`${secondVersionAlias.external_url}`.as('svexternal_url'),
        min_update_version: sql<string | null>`${secondVersionAlias.min_update_version}`.as('svminUpdateVersion'),
        r2_path: sql`${secondVersionAlias.r2_path}`.mapWith(secondVersionAlias.r2_path).as('svr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('svmanifest'),
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
        secondary_version_percentage: channelAlias.secondary_version_percentage,
        enable_progressive_deploy: channelAlias.enable_progressive_deploy,
        enable_ab_testing: channelAlias.enable_ab_testing,
        allow_device_self_set: channelAlias.allow_device_self_set,
        public: channelAlias.public,
      },
    })
    .from(channelAlias)
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(channelAlias.second_version, secondVersionAlias.id))
    .where(!defaultChannel
      ? and(
        eq(channelAlias.public, true),
        eq(channelAlias.app_id, app_id),
        eq(platform === 'android' ? channelAlias.android : channelAlias.ios, true),
      )
      : and (
        eq(channelAlias.app_id, app_id),
        eq(channelAlias.name, defaultChannel),
      ),
    )
    .limit(1)
    .then(data => data.at(0))

  // promise all
  const [devicesOverride, channelOverride, channelData, versionData] = await Promise.all([deviceOverwrite, channelDevice, channel, appVersions])
  return { versionData, channelData, channelOverride, devicesOverride }
}

export async function requestInfosPostgresV2(
  platform: string,
  app_id: string,
  device_id: string,
  version_name: string,
  defaultChannel: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
) {
  const { versionAlias, secondVersionAlias, devicesOverrideAlias, channelDevicesAlias, channelAlias } = getAliasV2()

  const appVersions = drizzleCient
    .select({
      id: versionAlias.id,
    })
    .from(versionAlias)
    .where(or(eq(versionAlias.name, version_name), eq(versionAlias.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))
  console.error({ context: 'requestInfosPostgresV2 appVersions', appVersions })

  const deviceOverwrite = drizzleCient
    .select({
      device_id: devicesOverrideAlias.device_id,
      app_id: devicesOverrideAlias.app_id,
      version: {
        id: versionAlias.id,
        name: versionAlias.name,
        checksum: versionAlias.checksum,
        session_key: versionAlias.session_key,
        bucket_id: versionAlias.bucket_id,
        storage_provider: versionAlias.storage_provider,
        external_url: versionAlias.external_url,
        min_update_version: versionAlias.min_update_version,
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
    })
    .from(devicesOverrideAlias)
    .innerJoin(versionAlias, eq(devicesOverrideAlias.version, versionAlias.id))
    .where(and(eq(devicesOverrideAlias.device_id, device_id), eq(devicesOverrideAlias.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const channelDevice = drizzleCient
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
        bucket_id: sql<string | null>`${versionAlias.bucket_id}`.as('vbucket_id'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
      secondVersion: {
        id: sql<number>`${secondVersionAlias.id}`.as('svid'),
        name: sql<string>`${secondVersionAlias.name}`.as('svname'),
        checksum: sql<string | null>`${secondVersionAlias.checksum}`.as('svchecksum'),
        session_key: sql<string | null>`${secondVersionAlias.session_key}`.as('svsession_key'),
        bucket_id: sql<string | null>`${secondVersionAlias.bucket_id}`.as('svbucket_id'),
        storage_provider: sql<string>`${secondVersionAlias.storage_provider}`.as('svstorage_provider'),
        external_url: sql<string | null>`${secondVersionAlias.external_url}`.as('svexternal_url'),
        min_update_version: sql<string | null>`${secondVersionAlias.min_update_version}`.as('svminUpdateVersion'),
        r2_path: sql`${secondVersionAlias.r2_path}`.mapWith(secondVersionAlias.r2_path).as('svr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('svmanifest'),
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
        secondary_version_percentage: channelAlias.secondary_version_percentage,
        enable_progressive_deploy: channelAlias.enable_progressive_deploy,
        enable_ab_testing: channelAlias.enable_ab_testing,
        allow_device_self_set: channelAlias.allow_device_self_set,
        public: channelAlias.public,
      },
    },
    )
    .from(channelDevicesAlias)
    .innerJoin(channelAlias, eq(channelDevicesAlias.channel_id, channelAlias.id))
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(channelAlias.second_version, secondVersionAlias.id))
    .where(and(eq(channelDevicesAlias.device_id, device_id), eq(channelDevicesAlias.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  // v => version
  // sv => secondversion
  const channel = drizzleCient
    .select({
      version: {
        id: sql<number>`${versionAlias.id}`.as('vid'),
        name: sql<string>`${versionAlias.name}`.as('vname'),
        checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
        session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
        bucket_id: sql<string | null>`${versionAlias.bucket_id}`.as('vbucket_id'),
        storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
        external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
        min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
        r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('vmanifest'),
      },
      secondVersion: {
        id: sql<number>`${secondVersionAlias.id}`.as('svid'),
        name: sql<string>`${secondVersionAlias.name}`.as('svname'),
        checksum: sql<string | null>`${secondVersionAlias.checksum}`.as('svchecksum'),
        session_key: sql<string | null>`${secondVersionAlias.session_key}`.as('svsession_key'),
        bucket_id: sql<string | null>`${secondVersionAlias.bucket_id}`.as('svbucket_id'),
        storage_provider: sql<string>`${secondVersionAlias.storage_provider}`.as('svstorage_provider'),
        external_url: sql<string | null>`${secondVersionAlias.external_url}`.as('svexternal_url'),
        min_update_version: sql<string | null>`${secondVersionAlias.min_update_version}`.as('svminUpdateVersion'),
        r2_path: sql`${secondVersionAlias.r2_path}`.mapWith(secondVersionAlias.r2_path).as('svr2_path'),
        manifest: sql`${versionAlias.manifest}`.mapWith(versionAlias.manifest).as('svmanifest'),
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
        secondary_version_percentage: channelAlias.secondary_version_percentage,
        enable_progressive_deploy: channelAlias.enable_progressive_deploy,
        enable_ab_testing: channelAlias.enable_ab_testing,
        allow_device_self_set: channelAlias.allow_device_self_set,
        public: channelAlias.public,
      },
    })
    .from(channelAlias)
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(channelAlias.second_version, secondVersionAlias.id))
    .where(!defaultChannel
      ? and(
        eq(channelAlias.public, true),
        eq(channelAlias.app_id, app_id),
        eq(platform === 'android' ? channelAlias.android : channelAlias.ios, true),
      )
      : and (
        eq(channelAlias.app_id, app_id),
        eq(channelAlias.name, defaultChannel),
      ),
    )
    .limit(1)
    .then(data => data.at(0))

  // promise all
  const [devicesOverride, channelOverride, channelData, versionData] = await Promise.all([deviceOverwrite, channelDevice, channel, appVersions])
  console.error({ context: 'requestInfosPostgresV2 rres', devicesOverride, channelOverride, channelData, versionData })
  return { versionData, channelData, channelOverride, devicesOverride }
}

export async function getAppOwnerPostgresV2(
  c: Context,
  appId: string,
  drizzleCient: ReturnType<typeof getDrizzleClientD1>,
): Promise<{ owner_org: string, orgs: { created_by: string, id: string } } | null> {
  try {
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

    return appOwner
  }
  catch (e: any) {
    console.error({ requestId: c.get('requestId'), context: 'getAppOwnerPostgres', error: e })
    return null
  }
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
    console.error({ requestId: c.get('requestId'), context: 'getAppOwnerPostgres', error: e })
    return null
  }
}
