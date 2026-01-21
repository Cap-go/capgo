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

// Replication lag threshold
const REPLICATION_LAG_THRESHOLD_SECONDS = 180 // 3 minutes threshold

type ReplicationStatus = 'ok' | 'lagging' | 'unknown'

interface ReplicationLagStatus {
  status: ReplicationStatus
  max_lag_seconds: number | null
}

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

export function selectOne(pgClient: ReturnType<typeof getPgClient>) {
  // Use pg Pool directly to avoid Drizzle's prepared statement handling
  // which doesn't work with Supabase pooler in transaction mode
  return pgClient.query('SELECT 1')
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

/**
 * Query replication lag from the REPLICA database using pg_stat_subscription.
 * Uses the existing pool - no new connections.
 */
async function queryReplicaLag(c: Context, pool: Pool): Promise<ReplicationLagStatus> {
  try {
    const query = `
      SELECT EXTRACT(EPOCH FROM (now() - last_msg_receipt_time)) AS lag_seconds
      FROM pg_stat_subscription
      WHERE subname LIKE 'planetscale_subscription_%'
      LIMIT 1
    `

    const result = await pool.query(query)
    const lagSeconds = result.rows[0]?.lag_seconds
      ? Number(result.rows[0].lag_seconds)
      : null

    let status: ReplicationStatus = 'unknown'
    if (lagSeconds !== null) {
      status = lagSeconds > REPLICATION_LAG_THRESHOLD_SECONDS ? 'lagging' : 'ok'
    }

    cloudlog({ requestId: c.get('requestId'), message: 'Replica lag queried', status, lagSeconds })

    return {
      status,
      max_lag_seconds: lagSeconds,
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Error querying replica lag', error })
    return {
      status: 'unknown',
      max_lag_seconds: null,
    }
  }
}

/**
 * Set replication lag header on the response.
 * Uses the provided pool to query pg_stat_subscription on the replica.
 */
export async function setReplicationLagHeader(c: Context, pool: Pool): Promise<void> {
  const status = await queryReplicaLag(c, pool)
  c.header('X-Replication-Lag', status.status)
  if (status.max_lag_seconds !== null) {
    c.header('X-Replication-Lag-Seconds', String(Math.round(status.max_lag_seconds)))
  }
}

export function getDatabaseURL(c: Context, readOnly = false): string {
  const dbRegion = getClientDbRegionSB(c)

  // For read-only queries, use region to avoid Network latency
  if (readOnly) {
    // Hyperdrive main read replica regional routing in Cloudflare Workers
    // When using Hyperdrive we use session databases directly to avoid supabase pooler overhead and allow prepared statements
    // Asia region - Japan
    if (c.env.HYPERDRIVE_CAPGO_PS_AS_JAPAN && dbRegion === 'AS_JAPAN') {
      c.header('X-Database-Source', 'HYPERDRIVE_CAPGO_PLANETSCALE_AS_JAPAN')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_AS_JAPAN for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_AS_JAPAN.connectionString
    }
    // Asia region - India
    if (c.env.HYPERDRIVE_CAPGO_PS_AS_INDIA && dbRegion === 'AS_INDIA') {
      c.header('X-Database-Source', 'HYPERDRIVE_CAPGO_PLANETSCALE_AS_INDIA')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_AS_INDIA for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_AS_INDIA.connectionString
    }
    // // US region
    if (c.env.HYPERDRIVE_CAPGO_PS_NA && dbRegion === 'NA') {
      c.header('X-Database-Source', 'HYPERDRIVE_CAPGO_PLANETSCALE_NA')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_NA for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_NA.connectionString
    }
    // // EU region
    if (c.env.HYPERDRIVE_CAPGO_PS_EU && dbRegion === 'EU') {
      c.header('X-Database-Source', 'HYPERDRIVE_CAPGO_PLANETSCALE_EU')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_EU for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_EU.connectionString
    }
    // // OC region
    if (c.env.HYPERDRIVE_CAPGO_PS_OC && dbRegion === 'OC') {
      c.header('X-Database-Source', 'HYPERDRIVE_CAPGO_PLANETSCALE_OC')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_OC for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_OC.connectionString
    }
    // // SA region
    if (c.env.HYPERDRIVE_CAPGO_PS_SA && dbRegion === 'SA') {
      c.header('X-Database-Source', 'HYPERDRIVE_CAPGO_PLANETSCALE_SA')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_SA for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_SA.connectionString
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

  const isPooler = dbName.startsWith('sb_pooler')
  const options = {
    connectionString: dbUrl,
    max: 4,
    application_name: `${appName}-${dbName}`,
    idleTimeoutMillis: 20000, // Increase from 2 to 20 seconds
    connectionTimeoutMillis: 10000, // Add explicit connect timeout
    maxLifetimeMillis: 30 * 60 * 1000, // 30 minutes
    // PgBouncer/Supabase pooler doesn't support the 'options' startup parameter
    options: readOnly && !isPooler ? '-c default_transaction_read_only=on' : undefined,
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

function getSchemaUpdatesAlias(includeMetadata = false) {
  const { versionAlias, channelDevicesAlias, channelAlias } = getAlias()

  const versionSelect: any = {
    id: sql<number>`${versionAlias.id}`.as('vid'),
    name: sql<string>`${versionAlias.name}`.as('vname'),
    checksum: sql<string | null>`${versionAlias.checksum}`.as('vchecksum'),
    session_key: sql<string | null>`${versionAlias.session_key}`.as('vsession_key'),
    key_id: sql<string | null>`${versionAlias.key_id}`.as('vkey_id'),
    storage_provider: sql<string>`${versionAlias.storage_provider}`.as('vstorage_provider'),
    external_url: sql<string | null>`${versionAlias.external_url}`.as('vexternal_url'),
    min_update_version: sql<string | null>`${versionAlias.min_update_version}`.as('vminUpdateVersion'),
    r2_path: sql`${versionAlias.r2_path}`.mapWith(versionAlias.r2_path).as('vr2_path'),
  }

  // Only include link and comment when needed (for plugin v7.35.0+ with expose_metadata enabled)
  if (includeMetadata) {
    versionSelect.link = sql<string | null>`${versionAlias.link}`.as('vlink')
    versionSelect.comment = sql<string | null>`${versionAlias.comment}`.as('vcomment')
  }
  const channelSelect = {
    id: channelAlias.id,
    name: channelAlias.name,
    app_id: channelAlias.app_id,
    allow_dev: channelAlias.allow_dev,
    allow_prod: channelAlias.allow_prod,
    allow_emulator: channelAlias.allow_emulator,
    allow_device: channelAlias.allow_device,
    disable_auto_update_under_native: channelAlias.disable_auto_update_under_native,
    disable_auto_update: channelAlias.disable_auto_update,
    ios: channelAlias.ios,
    android: channelAlias.android,
    electron: channelAlias.electron,
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
  includeMetadata = false,
) {
  const { versionSelect, channelDevicesAlias, channelAlias, channelSelect, manifestSelect, versionAlias } = getSchemaUpdatesAlias(includeMetadata)
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
  includeMetadata = false,
) {
  const { versionSelect, channelAlias, channelSelect, manifestSelect, versionAlias } = getSchemaUpdatesAlias(includeMetadata)
  const platformQuery = platform === 'android' ? channelAlias.android : platform === 'electron' ? channelAlias.electron : channelAlias.ios
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
  includeMetadata = false,
) {
  const shouldQueryChannelOverride = channelDeviceCount === undefined || channelDeviceCount === null ? true : channelDeviceCount > 0
  const shouldFetchManifest = manifestBundleCount === undefined || manifestBundleCount === null ? true : manifestBundleCount > 0

  const channelDevice = shouldQueryChannelOverride
    ? requestInfosChannelDevicePostgres(c, app_id, device_id, drizzleClient, shouldFetchManifest, includeMetadata)
    : Promise.resolve(undefined).then(() => {
        cloudlog({ requestId: c.get('requestId'), message: 'Skipping channel device override query' })
        return null
      })
  const channel = requestInfosChannelPostgres(c, platform, app_id, defaultChannel, drizzleClient, shouldFetchManifest, includeMetadata)

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
): Promise<{ owner_org: string, orgs: { created_by: string, id: string, management_email: string }, plan_valid: boolean, channel_device_count: number, manifest_bundle_count: number, expose_metadata: boolean } | null> {
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
        expose_metadata: schema.apps.expose_metadata,
        orgs: {
          created_by: orgAlias.created_by,
          id: orgAlias.id,
          management_email: orgAlias.management_email,
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
): Promise<{ id: number, name: string, allow_device_self_set: boolean, public: boolean, owner_org: string } | null> {
  try {
    const channel = await drizzleClient
      .select({
        id: schema.channels.id,
        name: schema.channels.name,
        allow_device_self_set: schema.channels.allow_device_self_set,
        public: schema.channels.public,
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
): Promise<{ name: string, ios: boolean, android: boolean, electron: boolean }[]> {
  try {
    const channels = await drizzleClient
      .select({
        name: schema.channels.name,
        ios: schema.channels.ios,
        android: schema.channels.android,
        electron: schema.channels.electron,
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
): Promise<{ id: number, name: string, ios: boolean, android: boolean, electron: boolean, public: boolean }[]> {
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
        electron: schema.channels.electron,
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
  platform: 'ios' | 'android' | 'electron',
  isEmulator: boolean,
  isProd: boolean,
  drizzleClient: ReturnType<typeof getDrizzleClient>,
): Promise<{ id: number, name: string, allow_device_self_set: boolean, allow_emulator: boolean, allow_device: boolean, allow_dev: boolean, allow_prod: boolean, ios: boolean, android: boolean, electron: boolean, public: boolean }[]> {
  try {
    const deviceCondition = isEmulator
      ? eq(schema.channels.allow_emulator, true)
      : eq(schema.channels.allow_device, true)
    const buildCondition = isProd
      ? eq(schema.channels.allow_prod, true)
      : eq(schema.channels.allow_dev, true)
    const platformColumn = platform === 'ios' ? schema.channels.ios : platform === 'electron' ? schema.channels.electron : schema.channels.android
    const channels = await drizzleClient
      .select({
        id: schema.channels.id,
        name: schema.channels.name,
        allow_device_self_set: schema.channels.allow_device_self_set,
        allow_emulator: schema.channels.allow_emulator,
        allow_device: schema.channels.allow_device,
        allow_dev: schema.channels.allow_dev,
        allow_prod: schema.channels.allow_prod,
        ios: schema.channels.ios,
        android: schema.channels.android,
        electron: schema.channels.electron,
        public: schema.channels.public,
      })
      .from(schema.channels)
      .where(and(
        eq(schema.channels.app_id, appId),
        or(eq(schema.channels.allow_device_self_set, true), eq(schema.channels.public, true)),
        deviceCondition,
        buildCondition,
        eq(platformColumn, true),
      ))
    return channels
  }
  catch (e: unknown) {
    logPgError(c, 'getCompatibleChannelsPg', e)
    return []
  }
}

// Admin Deployments Trend (from Supabase channel_devices table)
export interface AdminDeploymentsTrend {
  date: string
  deployments: number
}

export async function getAdminDeploymentsTrend(
  c: Context,
  start_date: string,
  end_date: string,
  app_id?: string,
): Promise<AdminDeploymentsTrend[]> {
  try {
    const pgClient = getPgClient(c, true) // Read-only query
    const drizzleClient = getDrizzleClient(pgClient)

    const appFilter = app_id ? sql`AND app_id = ${app_id}` : sql``

    const query = sql`
      SELECT
        DATE(created_at) AS date,
        COUNT(*)::int AS deployments
      FROM channel_devices
      WHERE created_at >= ${start_date}::timestamp
        AND created_at < ${end_date}::timestamp
        ${appFilter}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `

    const result = await drizzleClient.execute(query)

    const data: AdminDeploymentsTrend[] = result.rows.map((row: any) => ({
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
      deployments: Number(row.deployments),
    }))

    cloudlog({ requestId: c.get('requestId'), message: 'getAdminDeploymentsTrend result', resultCount: data.length })

    return data
  }
  catch (e: unknown) {
    logPgError(c, 'getAdminDeploymentsTrend', e)
    return []
  }
}

// Admin Global Stats Trend (from Supabase global_stats table)
export interface AdminGlobalStatsTrend {
  date: string
  apps: number
  apps_active: number
  users: number
  users_active: number
  paying: number
  trial: number
  not_paying: number
  updates: number
  updates_external: number
  success_rate: number
  bundle_storage_gb: number
  plan_solo: number
  plan_maker: number
  plan_team: number
  plan_enterprise: number
  registers_today: number
  devices_last_month: number
  devices_last_month_ios: number
  devices_last_month_android: number
  stars: number
  need_upgrade: number
  paying_yearly: number
  paying_monthly: number
  new_paying_orgs: number
  canceled_orgs: number
  mrr: number
  total_revenue: number
  revenue_solo: number
  revenue_maker: number
  revenue_team: number
  revenue_enterprise: number
  builds_total: number
  builds_ios: number
  builds_android: number
  builds_last_month: number
  builds_last_month_ios: number
  builds_last_month_android: number
}

export async function getAdminGlobalStatsTrend(
  c: Context,
  start_date: string,
  end_date: string,
): Promise<AdminGlobalStatsTrend[]> {
  try {
    const pgClient = getPgClient(c, true) // Read-only query
    const drizzleClient = getDrizzleClient(pgClient)

    // Extract just the date portion (YYYY-MM-DD) from ISO timestamps
    const startDateOnly = start_date.split('T')[0]
    const endDateOnly = end_date.split('T')[0]

    // Simple query - just SELECT all columns from global_stats
    // Revenue metrics are already calculated and stored by logsnag_insights cron job
    const query = sql`
      SELECT
        date_id AS date,
        apps::int,
        apps_active::int,
        users::int,
        users_active::int,
        paying::int,
        trial::int,
        not_paying::int,
        updates::int,
        updates_external::int,
        success_rate::float,
        bundle_storage_gb::float,
        plan_solo::int,
        plan_maker::int,
        plan_team::int,
        plan_enterprise::int,
        registers_today::int,
        devices_last_month::int,
        COALESCE(devices_last_month_ios, 0)::int AS devices_last_month_ios,
        COALESCE(devices_last_month_android, 0)::int AS devices_last_month_android,
        stars::int,
        need_upgrade::int,
        paying_yearly::int,
        paying_monthly::int,
        new_paying_orgs::int,
        canceled_orgs::int,
        mrr::float,
        total_revenue::float,
        revenue_solo::float,
        revenue_maker::float,
        revenue_team::float,
        revenue_enterprise::float,
        COALESCE(builds_total, 0)::int AS builds_total,
        COALESCE(builds_ios, 0)::int AS builds_ios,
        COALESCE(builds_android, 0)::int AS builds_android,
        COALESCE(builds_last_month, 0)::int AS builds_last_month,
        COALESCE(builds_last_month_ios, 0)::int AS builds_last_month_ios,
        COALESCE(builds_last_month_android, 0)::int AS builds_last_month_android
      FROM global_stats
      WHERE date_id >= ${startDateOnly}
        AND date_id <= ${endDateOnly}
      ORDER BY date_id ASC
    `

    const result = await drizzleClient.execute(query)

    const data: AdminGlobalStatsTrend[] = result.rows.map((row: any) => ({
      date: row.date,
      apps: Number(row.apps) || 0,
      apps_active: Number(row.apps_active) || 0,
      users: Number(row.users) || 0,
      users_active: Number(row.users_active) || 0,
      paying: Number(row.paying) || 0,
      trial: Number(row.trial) || 0,
      not_paying: Number(row.not_paying) || 0,
      updates: Number(row.updates) || 0,
      updates_external: Number(row.updates_external) || 0,
      success_rate: Number(row.success_rate) || 0,
      bundle_storage_gb: Number(row.bundle_storage_gb) || 0,
      plan_solo: Number(row.plan_solo) || 0,
      plan_maker: Number(row.plan_maker) || 0,
      plan_team: Number(row.plan_team) || 0,
      plan_enterprise: Number(row.plan_enterprise) || 0,
      registers_today: Number(row.registers_today) || 0,
      devices_last_month: Number(row.devices_last_month) || 0,
      devices_last_month_ios: Number(row.devices_last_month_ios) || 0,
      devices_last_month_android: Number(row.devices_last_month_android) || 0,
      stars: Number(row.stars) || 0,
      need_upgrade: Number(row.need_upgrade) || 0,
      paying_yearly: Number(row.paying_yearly) || 0,
      paying_monthly: Number(row.paying_monthly) || 0,
      new_paying_orgs: Number(row.new_paying_orgs) || 0,
      canceled_orgs: Number(row.canceled_orgs) || 0,
      mrr: Number(row.mrr) || 0,
      total_revenue: Number(row.total_revenue) || 0,
      revenue_solo: Number(row.revenue_solo) || 0,
      revenue_maker: Number(row.revenue_maker) || 0,
      revenue_team: Number(row.revenue_team) || 0,
      revenue_enterprise: Number(row.revenue_enterprise) || 0,
      builds_total: Number(row.builds_total) || 0,
      builds_ios: Number(row.builds_ios) || 0,
      builds_android: Number(row.builds_android) || 0,
      builds_last_month: Number(row.builds_last_month) || 0,
      builds_last_month_ios: Number(row.builds_last_month_ios) || 0,
      builds_last_month_android: Number(row.builds_last_month_android) || 0,
    }))

    cloudlog({ requestId: c.get('requestId'), message: 'getAdminGlobalStatsTrend result', resultCount: data.length })

    return data
  }
  catch (e: unknown) {
    logPgError(c, 'getAdminGlobalStatsTrend', e)
    return []
  }
}

export interface AdminPluginBreakdown {
  date: string | null
  devices_last_month: number
  devices_last_month_ios: number
  devices_last_month_android: number
  version_breakdown: Record<string, number>
  major_breakdown: Record<string, number>
}

function parseBreakdownJson(value: unknown): Record<string, number> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, number>
    }
    catch {
      return {}
    }
  }
  if (typeof value === 'object')
    return value as Record<string, number>
  return {}
}

export async function getAdminPluginBreakdown(
  c: Context,
  start_date: string,
  end_date: string,
): Promise<AdminPluginBreakdown> {
  try {
    const pgClient = getPgClient(c, true)
    const drizzleClient = getDrizzleClient(pgClient)

    const startDateOnly = start_date.split('T')[0]
    const endDateOnly = end_date.split('T')[0]

    const query = sql`
      SELECT
        date_id AS date,
        COALESCE(devices_last_month, 0)::int AS devices_last_month,
        COALESCE(devices_last_month_ios, 0)::int AS devices_last_month_ios,
        COALESCE(devices_last_month_android, 0)::int AS devices_last_month_android,
        plugin_version_breakdown,
        plugin_major_breakdown
      FROM global_stats
      WHERE date_id >= ${startDateOnly}
        AND date_id <= ${endDateOnly}
      ORDER BY date_id DESC
      LIMIT 1
    `

    const result = await drizzleClient.execute(query)
    const row = result.rows[0] as any | undefined

    if (!row) {
      return {
        date: null,
        devices_last_month: 0,
        devices_last_month_ios: 0,
        devices_last_month_android: 0,
        version_breakdown: {},
        major_breakdown: {},
      }
    }

    return {
      date: row.date ?? null,
      devices_last_month: Number(row.devices_last_month) || 0,
      devices_last_month_ios: Number(row.devices_last_month_ios) || 0,
      devices_last_month_android: Number(row.devices_last_month_android) || 0,
      version_breakdown: parseBreakdownJson(row.plugin_version_breakdown),
      major_breakdown: parseBreakdownJson(row.plugin_major_breakdown),
    }
  }
  catch (e: unknown) {
    logPgError(c, 'getAdminPluginBreakdown', e)
    return {
      date: null,
      devices_last_month: 0,
      devices_last_month_ios: 0,
      devices_last_month_android: 0,
      version_breakdown: {},
      major_breakdown: {},
    }
  }
}
