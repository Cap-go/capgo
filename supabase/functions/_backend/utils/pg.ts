import { and, eq, or, sql } from 'drizzle-orm'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { alias } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { alias as aliasV2 } from 'drizzle-orm/sqlite-core'
import { getRuntimeKey } from 'hono/adapter'
// import { drizzle } from 'drizzle-orm/neon-http';
import postgres from 'postgres'
import type { Context } from '@hono/hono'
import * as schema from './postgress_schema.ts'
import * as schemaV2 from './sqlite_schema.ts'
import { existInEnv, getEnv } from './utils.ts'

export function getBestDatabaseURL(c: Context): string {
  // TODO: use it when we deployed replicate of database
  // Use replicate i

  // const clientContinent = null
  const clientContinent = (c.req.raw as any)?.cf?.continent
  console.log({ requestId: c.get('requestId'), context: 'clientContinent', clientContinent })
  let DEFAULT_DB_URL = getEnv(c, 'SUPABASE_DB_URL')
  if (existInEnv(c, 'CUSTOM_SUPABASE_DB_URL'))
    DEFAULT_DB_URL = getEnv(c, 'CUSTOM_SUPABASE_DB_URL')

  // TODO: uncomment when we enable back replicate
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
  const dbUrl = getBestDatabaseURL(c)
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
  return drizzleD1(c.env.DB_REPLICATE, { logger: true })
}

export function getDrizzleClientD1Session(c: Context) {
  // TODO: find why it doesn't work
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

export async function requestInfosPostgres(
  platform: string,
  app_id: string,
  device_id: string,
  version_name: string,
  defaultChannel: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
) {
  const appVersions = drizzleCient
    .select({
      id: schema.app_versions.id,
    })
    .from(schema.app_versions)
    .where(or(eq(schema.app_versions.name, version_name), eq(schema.app_versions.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const versionAlias = alias(schema.app_versions, 'version')
  const secondVersionAlias = alias(schema.app_versions, 'second_version')

  const deviceOverwrite = drizzleCient
    .select({
      device_id: schema.devices_override.device_id,
      app_id: schema.devices_override.app_id,
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
    .from(schema.devices_override)
    .innerJoin(versionAlias, eq(schema.devices_override.version, versionAlias.id))
    .where(and(eq(schema.devices_override.device_id, device_id), eq(schema.devices_override.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const channelDeviceReq = drizzleCient
    .select({
      channel_devices: {
        device_id: schema.channel_devices.device_id,
        app_id: sql<string>`${schema.channel_devices.app_id}`.as('cd_app_id'),
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
        id: schema.channels.id,
        name: schema.channels.name,
        app_id: schema.channels.app_id,
        allow_dev: schema.channels.allow_dev,
        allow_emulator: schema.channels.allow_emulator,
        disable_auto_update_under_native: schema.channels.disable_auto_update_under_native,
        disable_auto_update: schema.channels.disable_auto_update,
        ios: schema.channels.ios,
        android: schema.channels.android,
        secondary_version_percentage: schema.channels.secondary_version_percentage,
        enable_progressive_deploy: schema.channels.enable_progressive_deploy,
        enable_ab_testing: schema.channels.enable_ab_testing,
        allow_device_self_set: schema.channels.allow_device_self_set,
        public: schema.channels.public,
      },
    },
    )
    .from(schema.channel_devices)
    .innerJoin(schema.channels, eq(schema.channel_devices.channel_id, schema.channels.id))
    .innerJoin(versionAlias, eq(schema.channels.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(schema.channels.second_version, secondVersionAlias.id))
    .where(and(eq(schema.channel_devices.device_id, device_id), eq(schema.channel_devices.app_id, app_id)))
  const channelDevice = channelDeviceReq
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
        id: schema.channels.id,
        name: schema.channels.name,
        app_id: schema.channels.app_id,
        allow_dev: schema.channels.allow_dev,
        allow_emulator: schema.channels.allow_emulator,
        disable_auto_update_under_native: schema.channels.disable_auto_update_under_native,
        disable_auto_update: schema.channels.disable_auto_update,
        ios: schema.channels.ios,
        android: schema.channels.android,
        secondary_version_percentage: schema.channels.secondary_version_percentage,
        enable_progressive_deploy: schema.channels.enable_progressive_deploy,
        enable_ab_testing: schema.channels.enable_ab_testing,
        allow_device_self_set: schema.channels.allow_device_self_set,
        public: schema.channels.public,
      },
    })
    .from(schema.channels)
    .innerJoin(versionAlias, eq(schema.channels.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(schema.channels.second_version, secondVersionAlias.id))
    .where(!defaultChannel
      ? and(
        eq(schema.channels.public, true),
        eq(schema.channels.app_id, app_id),
        eq(platform === 'android' ? schema.channels.android : schema.channels.ios, true),
      )
      : and (
        eq(schema.channels.app_id, app_id),
        eq(schema.channels.name, defaultChannel),
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
  const appVersions = drizzleCient
    .select({
      id: schemaV2.app_versions.id,
    })
    .from(schemaV2.app_versions)
    .where(or(eq(schemaV2.app_versions.name, version_name), eq(schemaV2.app_versions.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const versionAlias = aliasV2(schemaV2.app_versions, 'version')
  const secondVersionAlias = aliasV2(schemaV2.app_versions, 'second_version')

  const deviceOverwrite = drizzleCient
    .select({
      device_id: schemaV2.devices_override.device_id,
      app_id: schemaV2.devices_override.app_id,
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
    .from(schemaV2.devices_override)
    .innerJoin(versionAlias, eq(schemaV2.devices_override.version, versionAlias.id))
    .where(and(eq(schemaV2.devices_override.device_id, device_id), eq(schemaV2.devices_override.app_id, app_id)))
    .limit(1)
    .then(data => data.at(0))

  const channelDeviceReq = drizzleCient
    .select({
      channel_devices: {
        device_id: schemaV2.channel_devices.device_id,
        app_id: sql<string>`${schemaV2.channel_devices.app_id}`.as('cd_app_id'),
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
        id: schemaV2.channels.id,
        name: schemaV2.channels.name,
        app_id: schemaV2.channels.app_id,
        allow_dev: schemaV2.channels.allow_dev,
        allow_emulator: schemaV2.channels.allow_emulator,
        disable_auto_update_under_native: schemaV2.channels.disable_auto_update_under_native,
        disable_auto_update: schemaV2.channels.disable_auto_update,
        ios: schemaV2.channels.ios,
        android: schemaV2.channels.android,
        secondary_version_percentage: schemaV2.channels.secondary_version_percentage,
        enable_progressive_deploy: schemaV2.channels.enable_progressive_deploy,
        enable_ab_testing: schemaV2.channels.enable_ab_testing,
        allow_device_self_set: schemaV2.channels.allow_device_self_set,
        public: schemaV2.channels.public,
      },
    },
    )
    .from(schemaV2.channel_devices)
    .innerJoin(schemaV2.channels, eq(schemaV2.channel_devices.channel_id, schemaV2.channels.id))
    .innerJoin(versionAlias, eq(schemaV2.channels.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(schemaV2.channels.second_version, secondVersionAlias.id))
    .where(and(eq(schemaV2.channel_devices.device_id, device_id), eq(schemaV2.channel_devices.app_id, app_id)))
  const channelDevice = channelDeviceReq
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
        id: schemaV2.channels.id,
        name: schemaV2.channels.name,
        app_id: schemaV2.channels.app_id,
        allow_dev: schemaV2.channels.allow_dev,
        allow_emulator: schemaV2.channels.allow_emulator,
        disable_auto_update_under_native: schemaV2.channels.disable_auto_update_under_native,
        disable_auto_update: schemaV2.channels.disable_auto_update,
        ios: schemaV2.channels.ios,
        android: schemaV2.channels.android,
        secondary_version_percentage: schemaV2.channels.secondary_version_percentage,
        enable_progressive_deploy: schemaV2.channels.enable_progressive_deploy,
        enable_ab_testing: schemaV2.channels.enable_ab_testing,
        allow_device_self_set: schemaV2.channels.allow_device_self_set,
        public: schemaV2.channels.public,
      },
    })
    .from(schemaV2.channels)
    .innerJoin(versionAlias, eq(schemaV2.channels.version, versionAlias.id))
    .leftJoin(secondVersionAlias, eq(schemaV2.channels.second_version, secondVersionAlias.id))
    .where(!defaultChannel
      ? and(
        eq(schemaV2.channels.public, true),
        eq(schemaV2.channels.app_id, app_id),
        eq(platform === 'android' ? schemaV2.channels.android : schemaV2.channels.ios, true),
      )
      : and (
        eq(schemaV2.channels.app_id, app_id),
        eq(schemaV2.channels.name, defaultChannel),
      ),
    )
    .limit(1)
    .then(data => data.at(0))

  // promise all
  const [devicesOverride, channelOverride, channelData, versionData] = await Promise.all([deviceOverwrite, channelDevice, channel, appVersions])
  return { versionData, channelData, channelOverride, devicesOverride } as any as ReturnType<typeof requestInfosPostgres>
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
