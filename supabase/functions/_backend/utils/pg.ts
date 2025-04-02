import type { Context } from '@hono/hono'
import { and, eq, or, sql } from 'drizzle-orm'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { alias } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { alias as aliasV2 } from 'drizzle-orm/sqlite-core'
import postgres from 'postgres'
import { backgroundTask, existInEnv, getEnv } from '../utils/utils.ts'
import * as schema from './postgress_schema.ts'
import * as schemaV2 from './sqlite_schema.ts'

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
  // Hyperdrive test
  if (existInEnv(c, 'HYPERDRIVE_DB'))
    return (getEnv(c, 'HYPERDRIVE_DB') as any as Hyperdrive).connectionString

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
  // console.log(c.get('requestId'), 'Closing client', client)
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
    return result[0]?.is_allowed || false
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'isAllowedActionOrg', error })
  }
  return false
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
    return result[0]?.is_allowed || false
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'isAllowedActionOrgActionD1', error })
  }
  return false
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
  const channelDevicesAlias = alias(schema.channel_devices, 'channel_devices')
  const channelAlias = alias(schema.channels, 'channels')
  return { versionAlias, channelDevicesAlias, channelAlias }
}
function getAliasV2() {
  const versionAlias = aliasV2(schemaV2.app_versions, 'version')
  const channelDevicesAlias = aliasV2(schemaV2.channel_devices, 'channel_devices')
  const channelAlias = aliasV2(schemaV2.channels, 'channels')
  return { versionAlias, channelDevicesAlias, channelAlias }
}
export function requestInfosPostgres(
  platform: string,
  app_id: string,
  device_id: string,
  version_name: string,
  defaultChannel: string,
  drizzleCient: ReturnType<typeof getDrizzleClient>,
) {
  const { versionAlias, channelDevicesAlias, channelAlias } = getAlias()

  const appVersions = drizzleCient
    .select({
      id: versionAlias.id,
    })
    .from(versionAlias)
    .where(or(eq(versionAlias.name, version_name), eq(versionAlias.app_id, app_id)))
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
    .then(data => data.at(0))

  const channel = drizzleCient
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
          sql`(SELECT (apps.default_channel_android = ${channelAlias.id} OR apps.default_channel_ios = ${channelAlias.id}) FROM ${schema.apps} WHERE app_id = ${app_id}) = true`,
          eq(channelAlias.app_id, app_id),
          eq(platform === 'android' ? channelAlias.android : channelAlias.ios, true),
        )
      : and (
          eq(channelAlias.app_id, app_id),
          eq(channelAlias.name, defaultChannel),
        ),
    )
    .groupBy(channelAlias.id, versionAlias.id)
    .limit(1)
    .then(data => data.at(0))

  return Promise.all([channelDevice, channel, appVersions])
    .then(([channelOverride, channelData, versionData]) => ({ versionData, channelData, channelOverride }))
    .catch((e) => {
      throw e
    })
}

export function requestInfosPostgresV2(
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
    .then(data => data.at(0))

  const channel = drizzleCient
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
        's3_path', ${schemaV2.manifest.s3_path},
      ))`,
    })
    .from(channelAlias)
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))
    .leftJoin(schemaV2.manifest, eq(schemaV2.manifest.app_version_id, versionAlias.id))
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
    .groupBy(channelAlias.id, versionAlias.id)
    .limit(1)
    .then(data => data.at(0))

  return Promise.all([channelDevice, channel, appVersions])
    .then(([channelOverride, channelData, versionData]) => ({ versionData, channelData, channelOverride }))
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
