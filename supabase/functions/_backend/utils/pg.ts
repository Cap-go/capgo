import type { Context } from 'hono'
import { and, eq, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { alias } from 'drizzle-orm/pg-core'
import { getRuntimeKey } from 'hono/adapter'
// @ts-types="npm:@types/pg"
import { Pool } from 'pg'
import { backgroundTask, existInEnv, getEnv } from '../utils/utils.ts'
import { getClientDbRegionSB } from './geolocation.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import * as schema from './postgres_schema.ts'
import { withOptionalManifestSelect } from './queryHelpers.ts'

const PLAN_EXCEEDED_COLUMNS: Record<'mau' | 'storage' | 'bandwidth', string> = {
  mau: 'mau_exceeded',
  storage: 'storage_exceeded',
  bandwidth: 'bandwidth_exceeded',
}

function buildPlanValidationExpression(
  actions: ('mau' | 'storage' | 'bandwidth')[],
  ownerColumn: typeof schema.app_versions.owner_org | typeof schema.apps.owner_org,
) {
  const extraConditions = actions.map(action => ` AND ${PLAN_EXCEEDED_COLUMNS[action]} = false`).join('')
  return sql<boolean>`EXISTS (
    SELECT 1
    FROM ${schema.stripe_info}
    WHERE ${schema.stripe_info.customer_id} = (
      SELECT ${schema.orgs.customer_id}
      FROM ${schema.orgs}
      WHERE ${schema.orgs.id} = ${ownerColumn}
    )
    AND (
      (${schema.stripe_info.trial_at}::date > CURRENT_DATE)
      OR (
        ${schema.stripe_info.status} = 'succeeded'
        AND ${schema.stripe_info.is_good_plan} = true
        ${sql.raw(extraConditions)}
      )
    )
  )`
}

export function selectOne(drizzleClient: ReturnType<typeof getDrizzleClient>) {
  return drizzleClient.execute(sql`select 1`)
}

function fixSupabaseHost(host: string): string {
  if (host.includes('postgres:postgres@supabase_db_')) {
  // Supabase adds a prefix to the hostname that breaks connection in local docker
  // e.g. "supabase_db_NAME:5432" -> "db:5432"
    const url = URL.parse(host)!
    url.hostname = url.hostname.split('_')[1]
    return url.href
  }
  return host
}

export function getDatabaseURL(c: Context, readOnly = false): string {
  const dbRegion = getClientDbRegionSB(c)

  // For read-only queries, use region to avoid Network latency
  if (readOnly) {
    // Hyperdrive main read replica regional routing in Cloudflare Workers
    // When using Hyperdrive we use session databases directly to avoid supabase pooler overhead and allow prepared statements
    // Asia region
    if (c.env.HYPERDRIVE_CAPGO_DIRECT_AS && dbRegion === 'AS') {
      c.header('X-Database-Source', 'HYPERDRIVE_CAPGO_DIRECT_AS')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_DIRECT_AS for read-only' })
      return c.env.HYPERDRIVE_CAPGO_DIRECT_AS.connectionString
    }
    // US region
    if (c.env.HYPERDRIVE_CAPGO_DIRECT_NA && dbRegion === 'NA') {
      c.header('X-Database-Source', 'HYPERDRIVE_CAPGO_DIRECT_NA')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_DIRECT_NA for read-only' })
      return c.env.HYPERDRIVE_CAPGO_DIRECT_NA.connectionString
    }

    // Custom Supabase Region Read replicate Poolers
    // Asia region
    if (existInEnv(c, 'READ_SUPABASE_DB_URL_AS') && dbRegion === 'AS') {
      c.header('X-Database-Source', 'read_pooler_as')
      cloudlog({ requestId: c.get('requestId'), message: 'Using READ_SUPABASE_DB_URL_AS for read-only' })
      return getEnv(c, 'READ_SUPABASE_DB_URL_AS')
    }

    // NA region
    if (existInEnv(c, 'READ_SUPABASE_DB_URL_NA') && dbRegion === 'NA') {
      c.header('X-Database-Source', 'read_pooler_na')
      cloudlog({ requestId: c.get('requestId'), message: 'Using READ_SUPABASE_DB_URL_NA for read-only' })
      return getEnv(c, 'READ_SUPABASE_DB_URL_NA')
    }
  }

  // Fallback to single Hyperdrive if available
  if (c.env.HYPERDRIVE_CAPGO_DIRECT_EU) {
    c.header('X-Database-Source', 'HYPERDRIVE_CAPGO_DIRECT_EU')
    cloudlog({ requestId: c.get('requestId'), message: `Using HYPERDRIVE_CAPGO_DIRECT_EU for ${readOnly ? 'read-only' : 'read-write'}` })
    return c.env.HYPERDRIVE_CAPGO_DIRECT_EU.connectionString
  }

  // Main DB write poller EU region in supabase
  if (existInEnv(c, 'MAIN_SUPABASE_DB_URL')) {
    c.header('X-Database-Source', 'sb_pooler_main')
    cloudlog({ requestId: c.get('requestId'), message: 'Using MAIN_SUPABASE_DB_URL for read-write' })
    return getEnv(c, 'MAIN_SUPABASE_DB_URL')
  }

  // Default Supabase direct connection used for testing or if no other option is available
  c.header('X-Database-Source', 'direct')
  cloudlog({ requestId: c.get('requestId'), message: 'Using Direct Supabase for read-write' })
  return fixSupabaseHost(getEnv(c, 'SUPABASE_DB_URL'))
}

export function getPgClient(c: Context, readOnly = false) {
  const dbUrl = getDatabaseURL(c, readOnly)
  const requestId = c.get('requestId')
  const appName = c.res.headers.get('X-Worker-Source') ?? 'unknown source'
  const dbName = c.res.headers.get('X-Database-Source') ?? 'unknown source'
  cloudlog({ requestId, message: 'SUPABASE_DB_URL', dbUrl, dbName, appName })

  const options = {
    prepare: true,
    connectionString: dbUrl,
    max: 4,
    application_name: `${appName}-${dbName}`,
    idleTimeoutMillis: 20000, // Increase from 2 to 20 seconds
    connectionTimeoutMillis: 10000, // Add explicit connect timeout
    maxLifetimeMillis: 30 * 60 * 1000, // 30 minutes
  }

  const pool = new Pool(options)

  // Hook to log when connections are removed from the pool
  pool.on('remove', () => {
    cloudlog({ requestId, message: 'PG Connection Removed from Pool' })
  })

  pool.on('error', (err: Error) => {
    cloudlogErr({ requestId, message: 'PG Pool Error', error: err })
  })

  return pool
}

export function getDrizzleClient(db: ReturnType<typeof getPgClient>) {
  return drizzle(db, { schema, logger: true })
}

// Helper to extract detailed error information from pg errors
export function logPgError(c: Context, functionName: string, error: unknown) {
  const e = error as Error & {
    code?: string
    errno?: number
    syscall?: string
    address?: string
    port?: number
    severity?: string
    detail?: string
    hint?: string
    position?: string
    routine?: string
    file?: string
    line?: string
    column?: string
  }

  cloudlogErr({
    requestId: c.get('requestId'),
    message: `${functionName} - PostgreSQL Error`,
    error: {
      // Basic error info
      message: e.message,
      name: e.name,
      stack: e.stack,

      // PostgreSQL-specific error codes
      code: e.code, // e.g., '57P01' for connection termination, 'ECONNREFUSED', 'ETIMEDOUT'
      severity: e.severity,
      detail: e.detail,
      hint: e.hint,

      // Network-level errors
      errno: e.errno, // System error number
      syscall: e.syscall, // System call that failed (e.g., 'connect', 'read', 'write')
      address: e.address, // IP address
      port: e.port, // Port number

      // Query position info
      position: e.position,
      routine: e.routine,

      // File info for debugging
      file: e.file,
      line: e.line,
      column: e.column,
    },
  })
}

export function closeClient(c: Context, db: ReturnType<typeof getPgClient>) {
  // cloudlog(c.get('requestId'), 'Closing client', client)
  if (getRuntimeKey() !== 'workerd')
    return backgroundTask(c, db.end())
  return undefined
}

export function getAlias() {
  const versionAlias = alias(schema.app_versions, 'version')
  const channelDevicesAlias = alias(schema.channel_devices, 'channel_devices')
  const channelAlias = alias(schema.channels, 'channels')
  return { versionAlias, channelDevicesAlias, channelAlias }
}

function getSchemaUpdatesAlias() {
  const { versionAlias, channelDevicesAlias, channelAlias } = getAlias()

  const versionSelect = {
    id: sql<number>`${versionAlias.id}`.as('vid'),
    name: sql<string>`${versionAlias.name}`.as('vname'),
    checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
    session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
    storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
    external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
    min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
    r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
  }
  const channelSelect = {
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
  }
  const manifestSelect = sql<{ file_name: string, file_hash: string, s3_path: string }[]>`COALESCE(json_agg(
        json_build_object(
          'file_name', ${schema.manifest.file_name},
          'file_hash', ${schema.manifest.file_hash},
          's3_path', ${schema.manifest.s3_path}
        )
      ) FILTER (WHERE ${schema.manifest.file_name} IS NOT NULL), '[]'::json)`
  return { versionSelect, channelDevicesAlias, channelAlias, channelSelect, manifestSelect, versionAlias }
}

export function requestInfosChannelDevicePostgres(
  c: Context,
  app_id: string,
  device_id: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  includeManifest: boolean,
) {
  const { versionSelect, channelDevicesAlias, channelAlias, channelSelect, manifestSelect, versionAlias } = getSchemaUpdatesAlias()
  const baseSelect = {
    channel_devices: {
      device_id: channelDevicesAlias.device_id,
      app_id: sql<string>`${channelDevicesAlias.app_id}`.as('cd_app_id'),
    },
    version: versionSelect,
    channels: channelSelect,
  }
  const selectShape = withOptionalManifestSelect(baseSelect, includeManifest, manifestSelect)

  const baseQuery = drizzleClient
    .select(selectShape)
    .from(channelDevicesAlias)
    .innerJoin(channelAlias, eq(channelDevicesAlias.channel_id, channelAlias.id))
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))

  const channelDevice = (includeManifest
    ? baseQuery.leftJoin(schema.manifest, eq(schema.manifest.app_version_id, versionAlias.id))
    : baseQuery)
    .where(and(eq(channelDevicesAlias.device_id, device_id), eq(channelDevicesAlias.app_id, app_id)))
    .groupBy(channelDevicesAlias.device_id, channelDevicesAlias.app_id, channelAlias.id, versionAlias.id)
    .limit(1)
  cloudlog({ requestId: c.get('requestId'), message: 'channelDevice Query:', channelDeviceQuery: channelDevice.toSQL() })

  return channelDevice.then(data => data.at(0))
}

export function requestInfosChannelPostgres(
  c: Context,
  platform: string,
  app_id: string,
  defaultChannel: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  includeManifest: boolean,
) {
  const { versionSelect, channelAlias, channelSelect, manifestSelect, versionAlias } = getSchemaUpdatesAlias()
  const platformQuery = platform === 'android' ? channelAlias.android : channelAlias.ios
  const baseSelect = {
    version: versionSelect,
    channels: channelSelect,
  }
  const selectShape = withOptionalManifestSelect(baseSelect, includeManifest, manifestSelect)

  const baseQuery = drizzleClient
    .select(selectShape)
    .from(channelAlias)
    .innerJoin(versionAlias, eq(channelAlias.version, versionAlias.id))

  const channelQuery = (includeManifest
    ? baseQuery.leftJoin(schema.manifest, eq(schema.manifest.app_version_id, versionAlias.id))
    : baseQuery)
    .where(!defaultChannel
      ? and(
          eq(channelAlias.public, true),
          eq(channelAlias.app_id, app_id),
          eq(platformQuery, true),
        )
      : and(
          eq(channelAlias.app_id, app_id),
          eq(channelAlias.name, defaultChannel),
        ),
    )
    .groupBy(channelAlias.id, versionAlias.id)
    .limit(1)
  cloudlog({ requestId: c.get('requestId'), message: 'channel Query:', channelQuery: channelQuery.toSQL() })
  const channel = channelQuery.then(data => data.at(0))

  return channel
}

export function requestInfosPostgres(
  c: Context,
  platform: string,
  app_id: string,
  device_id: string,
  defaultChannel: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  channelDeviceCount?: number | null,
  manifestBundleCount?: number | null,
) {
  const shouldQueryChannelOverride = channelDeviceCount === undefined || channelDeviceCount === null ? true : channelDeviceCount > 0
  const shouldFetchManifest = manifestBundleCount === undefined || manifestBundleCount === null ? true : manifestBundleCount > 0

  const channelDevice = shouldQueryChannelOverride
    ? requestInfosChannelDevicePostgres(c, app_id, device_id, drizzleClient, shouldFetchManifest)
    : Promise.resolve(undefined).then(() => {
        cloudlog({ requestId: c.get('requestId'), message: 'Skipping channel device override query' })
        return null
      })
  const channel = requestInfosChannelPostgres(c, platform, app_id, defaultChannel, drizzleClient, shouldFetchManifest)

  return Promise.all([channelDevice, channel])
    .then(([channelOverride, channelData]) => ({ channelData, channelOverride }))
    .catch((e) => {
      logPgError(c, 'requestInfosPostgres', e)
      throw e
    })
}

export async function getAppOwnerPostgres(
  c: Context,
  appId: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  actions: ('mau' | 'storage' | 'bandwidth')[] = [],
): Promise<{ owner_org: string, orgs: { created_by: string, id: string }, plan_valid: boolean, channel_device_count: number, manifest_bundle_count: number } | null> {
  try {
    if (actions.length === 0)
      return null
    const orgAlias = alias(schema.orgs, 'orgs')
    const planExpression = buildPlanValidationExpression(actions, schema.apps.owner_org)

    const appOwner = await drizzleClient
      .select({
        owner_org: schema.apps.owner_org,
        plan_valid: planExpression,
        channel_device_count: schema.apps.channel_device_count,
        manifest_bundle_count: schema.apps.manifest_bundle_count,
        orgs: {
          created_by: orgAlias.created_by,
          id: orgAlias.id,
        },
      })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, appId))
      .innerJoin(orgAlias, eq(schema.apps.owner_org, orgAlias.id))
      .limit(1)
      .then(data => data[0])

    return appOwner
  }
  catch (e: unknown) {
    logPgError(c, 'getAppOwnerPostgres', e)
    return null
  }
}

export async function getAppVersionPostgres(
  c: Context,
  appId: string,
  versionName: string,
  allowedDeleted: boolean | undefined,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, owner_org: string } | null> {
  try {
    const appVersion = await drizzleClient
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
  catch (e: unknown) {
    logPgError(c, 'getAppVersionPostgres', e)
    return null
  }
}

export async function getAppVersionsByAppIdPg(
  c: Context,
  appId: string,
  versionName: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  actions: ('mau' | 'storage' | 'bandwidth')[] = [],
): Promise<{ id: number, owner_org: string, name: string, plan_valid: boolean }[]> {
  try {
    if (actions.length === 0)
      return []
    const planExpression = buildPlanValidationExpression(actions, schema.app_versions.owner_org)
    const versions = await drizzleClient
      .select({
        id: schema.app_versions.id,
        owner_org: schema.app_versions.owner_org,
        name: schema.app_versions.name,
        plan_valid: planExpression,
      })
      .from(schema.app_versions)
      .where(and(
        eq(schema.app_versions.app_id, appId),
        or(eq(schema.app_versions.name, versionName), eq(schema.app_versions.name, 'builtin')),
      ))
      .limit(2)
    return versions
  }
  catch (e: unknown) {
    logPgError(c, 'getAppVersionsByAppIdPg', e)
    return []
  }
}

export async function getChannelDeviceOverridePg(
  c: Context,
  appId: string,
  deviceId: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<{ app_id: string, device_id: string, channel_id: { id: number, allow_device_self_set: boolean, name: string } } | null> {
  try {
    const result = await drizzleClient
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
  catch (e: unknown) {
    logPgError(c, 'getChannelDeviceOverridePg', e)
    return null
  }
}

export async function getChannelByNamePg(
  c: Context,
  appId: string,
  channelName: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, name: string, allow_device_self_set: boolean, owner_org: string } | null> {
  try {
    const channel = await drizzleClient
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
  catch (e: unknown) {
    logPgError(c, 'getChannelByNamePg', e)
    return null
  }
}

export async function getMainChannelsPg(
  c: Context,
  appId: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<{ name: string, ios: boolean, android: boolean }[]> {
  try {
    const channels = await drizzleClient
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
  catch (e: unknown) {
    logPgError(c, 'getMainChannelsPg', e)
    return []
  }
}

export async function deleteChannelDevicePg(
  c: Context,
  appId: string,
  deviceId: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<boolean> {
  try {
    await drizzleClient
      .delete(schema.channel_devices)
      .where(and(
        eq(schema.channel_devices.app_id, appId),
        eq(schema.channel_devices.device_id, deviceId),
      ))
    return true
  }
  catch (e: unknown) {
    logPgError(c, 'deleteChannelDevicePg', e)
    return false
  }
}

export async function upsertChannelDevicePg(
  c: Context,
  data: { device_id: string, channel_id: number, app_id: string, owner_org: string },
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<boolean> {
  try {
    await drizzleClient
      .insert(schema.channel_devices)
      .values({
        device_id: data.device_id,
        channel_id: data.channel_id,
        app_id: data.app_id,
        owner_org: data.owner_org,
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
  catch (e: unknown) {
    logPgError(c, 'upsertChannelDevicePg', e)
    return false
  }
}

export async function getChannelsPg(
  c: Context,
  appId: string,
  condition: { defaultChannel?: string } | { public: boolean },
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, name: string, ios: boolean, android: boolean, public: boolean }[]> {
  try {
    const whereConditions = [eq(schema.channels.app_id, appId)]

    if ('defaultChannel' in condition && condition.defaultChannel) {
      whereConditions.push(eq(schema.channels.name, condition.defaultChannel))
    }
    else if ('public' in condition) {
      whereConditions.push(eq(schema.channels.public, condition.public))
    }

    const channels = await drizzleClient
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
  catch (e: unknown) {
    logPgError(c, 'getChannelsPg', e)
    return []
  }
}

export async function getAppByIdPg(
  c: Context,
  appId: string,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
  actions: ('mau' | 'storage' | 'bandwidth')[] = [],
): Promise<{ owner_org: string, plan_valid: boolean } | null> {
  try {
    if (actions.length === 0)
      return null
    const planExpression = buildPlanValidationExpression(actions, schema.apps.owner_org)
    const app = await drizzleClient
      .select({
        owner_org: schema.apps.owner_org,
        plan_valid: planExpression,
      })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, appId))
      .limit(1)
      .then(data => data[0])
    return app
  }
  catch (e: unknown) {
    logPgError(c, 'getAppByIdPg', e)
    return null
  }
}

export async function getCompatibleChannelsPg(
  c: Context,
  appId: string,
  platform: 'ios' | 'android',
  isEmulator: boolean,
  isProd: boolean,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, name: string, allow_device_self_set: boolean, allow_emulator: boolean, allow_dev: boolean, ios: boolean, android: boolean, public: boolean }[]> {
  try {
    const channels = await drizzleClient
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
  catch (e: unknown) {
    logPgError(c, 'getCompatibleChannelsPg', e)
    return []
  }
}
