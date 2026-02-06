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
  const customerIdSubquery = sql<string | null>`(
    SELECT ${schema.orgs.customer_id}
    FROM ${schema.orgs}
    WHERE ${schema.orgs.id} = ${ownerColumn}
  )`
  // IMPORTANT: read replicas replicate table data but not views/functions.
  // Keep this expression replica-safe by relying on a replicated org flag.
  //
  // Semantics note: this flag means "org uses credits/top-up billing", not
  // "org currently has a positive balance". This avoids plugin read-path
  // depending on credit ledger tables/views which are not present on replicas.
  //
  // Backward compatibility for replicas that haven't replicated the column yet:
  // read via `to_jsonb(row)->>'has_usage_credits'` so the query still parses
  // even if the column doesn't exist.
  const hasCreditsExpression = sql`EXISTS (
    SELECT 1
    FROM ${schema.orgs}
    WHERE ${schema.orgs.id} = ${ownerColumn}
      AND COALESCE((to_jsonb(orgs) ->> 'has_usage_credits')::boolean, false) = true
  )`
  return sql<boolean>`(${hasCreditsExpression}) OR EXISTS (
    SELECT 1
    FROM ${schema.stripe_info}
    WHERE ${schema.stripe_info.customer_id} = (
      ${customerIdSubquery}
    )
    AND (
      (${schema.stripe_info.trial_at}::date > CURRENT_DATE)
      OR (
        ${schema.stripe_info.status} = 'succeeded'
        AND ${schema.stripe_info.is_good_plan} = true
        ${sql.raw(extraConditions)}
      )
    )
  ) OR (${customerIdSubquery} IS NULL)`
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
  safeSetResponseHeader(c, 'X-Replication-Lag', status.status)
  if (status.max_lag_seconds !== null) {
    safeSetResponseHeader(c, 'X-Replication-Lag-Seconds', String(Math.round(status.max_lag_seconds)))
  }
}

function safeSetResponseHeader(c: Context, name: string, value: string): void {
  // In Cloudflare Workers, we run some tasks via `waitUntil()` after the response
  // has started streaming. Hono's `c.header()` clones the Response using the
  // current body stream, which can be "disturbed"/locked at that point.
  try {
    const res = c.res
    if (res?.bodyUsed)
      return
    const body = res?.body as unknown as { locked?: boolean } | null
    if (body?.locked)
      return
  }
  catch {
    return
  }

  try {
    c.header(name, value)
  }
  catch {
    // Best-effort only: avoid crashing background tasks due to header mutation.
  }
}

function setDatabaseSource(c: Context, source: string): void {
  try {
    c.set('databaseSource', source)
  }
  catch {
    // Ignore: mostly useful for logging in request-scoped context.
  }
  safeSetResponseHeader(c, 'X-Database-Source', source)
}

export function getDatabaseURL(c: Context, readOnly = false): string {
  const dbRegion = getClientDbRegionSB(c)

  // For read-only queries, use region to avoid Network latency
  if (readOnly) {
    // Hyperdrive main read replica regional routing in Cloudflare Workers
    // When using Hyperdrive we use session databases directly to avoid supabase pooler overhead and allow prepared statements
    // Asia region - Japan
    if (c.env.HYPERDRIVE_CAPGO_PS_AS_JAPAN && dbRegion === 'AS_JAPAN') {
      setDatabaseSource(c, 'HYPERDRIVE_CAPGO_PLANETSCALE_AS_JAPAN')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_AS_JAPAN for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_AS_JAPAN.connectionString
    }
    // Asia region - India
    if (c.env.HYPERDRIVE_CAPGO_PS_AS_INDIA && dbRegion === 'AS_INDIA') {
      setDatabaseSource(c, 'HYPERDRIVE_CAPGO_PLANETSCALE_AS_INDIA')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_AS_INDIA for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_AS_INDIA.connectionString
    }
    // // US region
    if (c.env.HYPERDRIVE_CAPGO_PS_NA && dbRegion === 'NA') {
      setDatabaseSource(c, 'HYPERDRIVE_CAPGO_PLANETSCALE_NA')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_NA for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_NA.connectionString
    }
    // // EU region
    if (c.env.HYPERDRIVE_CAPGO_PS_EU && dbRegion === 'EU') {
      setDatabaseSource(c, 'HYPERDRIVE_CAPGO_PLANETSCALE_EU')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_EU for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_EU.connectionString
    }
    // // OC region
    if (c.env.HYPERDRIVE_CAPGO_PS_OC && dbRegion === 'OC') {
      setDatabaseSource(c, 'HYPERDRIVE_CAPGO_PLANETSCALE_OC')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_OC for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_OC.connectionString
    }
    // // SA region
    if (c.env.HYPERDRIVE_CAPGO_PS_SA && dbRegion === 'SA') {
      setDatabaseSource(c, 'HYPERDRIVE_CAPGO_PLANETSCALE_SA')
      cloudlog({ requestId: c.get('requestId'), message: 'Using HYPERDRIVE_CAPGO_PLANETSCALE_SA for read-only' })
      return c.env.HYPERDRIVE_CAPGO_PS_SA.connectionString
    }
  }

  // Fallback to single Hyperdrive if available
  if (c.env.HYPERDRIVE_CAPGO_DIRECT_EU) {
    setDatabaseSource(c, 'HYPERDRIVE_CAPGO_DIRECT_EU')
    cloudlog({ requestId: c.get('requestId'), message: `Using HYPERDRIVE_CAPGO_DIRECT_EU for ${readOnly ? 'read-only' : 'read-write'}` })
    return c.env.HYPERDRIVE_CAPGO_DIRECT_EU.connectionString
  }

  // Main DB write poller EU region in supabase
  if (existInEnv(c, 'MAIN_SUPABASE_DB_URL')) {
    setDatabaseSource(c, 'sb_pooler_main')
    cloudlog({ requestId: c.get('requestId'), message: 'Using MAIN_SUPABASE_DB_URL for read-write' })
    return getEnv(c, 'MAIN_SUPABASE_DB_URL')
  }

  // Default Supabase direct connection used for testing or if no other option is available
  setDatabaseSource(c, 'direct')
  cloudlog({ requestId: c.get('requestId'), message: 'Using Direct Supabase for read-write' })
  return fixSupabaseHost(getEnv(c, 'SUPABASE_DB_URL'))
}

export function getPgClient(c: Context, readOnly = false) {
  const dbUrl = getDatabaseURL(c, readOnly)
  const requestId = c.get('requestId')
  const appName = c.res.headers.get('X-Worker-Source') ?? 'unknown source'
  const dbName = String(c.get('databaseSource') ?? c.res.headers.get('X-Database-Source') ?? 'unknown source')
  cloudlog({ requestId, message: 'SUPABASE_DB_URL selected', dbName, appName, readOnly })

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
    .where(
      !defaultChannel
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
    : Promise.resolve(undefined)
        .then(() => {
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

export async function ensurePlaceholderVersions(c: Context, appId: string) {
  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    await pgClient.query(
      `INSERT INTO public.app_versions (name, app_id, storage_provider)
       VALUES ('builtin', $1, 'r2'), ('unknown', $1, 'r2')
       ON CONFLICT (name, app_id) DO NOTHING`,
      [appId],
    )
  }
  catch (e: unknown) {
    logPgError(c, 'ensurePlaceholderVersions', e)
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
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
  upgraded_orgs: number
  mrr: number
  total_revenue: number
  revenue_solo: number
  revenue_maker: number
  revenue_team: number
  revenue_enterprise: number
  builds_total: number
  builds_ios: number
  builds_android: number
  builds_success_total: number
  builds_success_ios: number
  builds_success_android: number
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
        COALESCE(upgraded_orgs, 0)::int AS upgraded_orgs,
        mrr::float,
        total_revenue::float,
        revenue_solo::float,
        revenue_maker::float,
        revenue_team::float,
        revenue_enterprise::float,
        COALESCE(builds_total, 0)::int AS builds_total,
        COALESCE(builds_ios, 0)::int AS builds_ios,
        COALESCE(builds_android, 0)::int AS builds_android,
        COALESCE(builds_success_total, 0)::int AS builds_success_total,
        COALESCE(builds_success_ios, 0)::int AS builds_success_ios,
        COALESCE(builds_success_android, 0)::int AS builds_success_android,
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
      upgraded_orgs: Number(row.upgraded_orgs) || 0,
      mrr: Number(row.mrr) || 0,
      total_revenue: Number(row.total_revenue) || 0,
      revenue_solo: Number(row.revenue_solo) || 0,
      revenue_maker: Number(row.revenue_maker) || 0,
      revenue_team: Number(row.revenue_team) || 0,
      revenue_enterprise: Number(row.revenue_enterprise) || 0,
      builds_total: Number(row.builds_total) || 0,
      builds_ios: Number(row.builds_ios) || 0,
      builds_android: Number(row.builds_android) || 0,
      builds_success_total: Number(row.builds_success_total) || 0,
      builds_success_ios: Number(row.builds_success_ios) || 0,
      builds_success_android: Number(row.builds_success_android) || 0,
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

// Admin Cancelled Organizations List
export interface AdminCancelledOrganizationRow {
  org_id: string
  org_name: string
  management_email: string
  canceled_at: string
  customer_id: string
  subscription_id: string | null
}

export interface AdminCancelledOrganizationsResult {
  organizations: AdminCancelledOrganizationRow[]
  total: number
}

/**
 * Fetches organizations that recently canceled, ordered by most recent cancellation.
 */
export async function getAdminCancelledOrganizations(
  c: Context,
  start_date?: string,
  end_date?: string,
  limit: number = 20,
  offset: number = 0,
): Promise<AdminCancelledOrganizationsResult> {
  try {
    const pgClient = getPgClient(c, true)
    const drizzleClient = getDrizzleClient(pgClient)

    const dateFilter = start_date && end_date
      ? sql`AND si.canceled_at >= ${start_date}::timestamp AND si.canceled_at < ${end_date}::timestamp`
      : sql``

    const query = sql`
      SELECT
        o.id AS org_id,
        o.name AS org_name,
        o.management_email,
        si.canceled_at,
        si.customer_id,
        si.subscription_id
      FROM orgs o
      INNER JOIN stripe_info si ON si.customer_id = o.customer_id
      WHERE si.canceled_at IS NOT NULL
        ${dateFilter}
      ORDER BY si.canceled_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    const countQuery = sql`
      SELECT COUNT(*)::int AS total
      FROM orgs o
      INNER JOIN stripe_info si ON si.customer_id = o.customer_id
      WHERE si.canceled_at IS NOT NULL
        ${dateFilter}
    `

    const [result, countResult] = await Promise.all([
      drizzleClient.execute(query),
      drizzleClient.execute(countQuery),
    ])

    const organizations: AdminCancelledOrganizationRow[] = result.rows.map((row: any) => ({
      org_id: row.org_id,
      org_name: row.org_name,
      management_email: row.management_email,
      canceled_at: row.canceled_at instanceof Date ? row.canceled_at.toISOString() : row.canceled_at,
      customer_id: row.customer_id,
      subscription_id: row.subscription_id,
    }))

    const total = Number((countResult.rows[0] as any)?.total) || 0

    cloudlog({ requestId: c.get('requestId'), message: 'getAdminCancelledOrganizations result', resultCount: organizations.length, total })

    return { organizations, total }
  }
  catch (e: unknown) {
    logPgError(c, 'getAdminCancelledOrganizations', e)
    return { organizations: [], total: 0 }
  }
}

export interface AdminTrialOrganization {
  org_id: string
  org_name: string
  management_email: string
  trial_end_date: string
  days_remaining: number
  created_at: string
}

export interface AdminTrialOrganizationsResult {
  organizations: AdminTrialOrganization[]
  total: number
}

/**
 * Fetches organizations currently in their trial period for the admin dashboard.
 * Returns a paginated list of trial organizations ordered by days remaining (ascending),
 * so organizations expiring soon appear first.
 *
 * Trial organizations are those where:
 * - trial_at date is today or in the future (>= CURRENT_DATE)
 * - status is NULL (new org, no payment attempted) or not 'succeeded' (no active subscription)
 */
export async function getAdminTrialOrganizations(
  c: Context,
  limit: number = 20,
  offset: number = 0,
): Promise<AdminTrialOrganizationsResult> {
  try {
    const pgClient = getPgClient(c, true) // Read-only query
    const drizzleClient = getDrizzleClient(pgClient)

    // Query to get trial organizations ordered by days remaining (ascending - expiring soon first)
    // Filter logic:
    // - trial_at >= CURRENT_DATE: includes trials expiring today (days_remaining = 0)
    // - status IS NULL: new organizations that haven't attempted payment yet
    // - status != 'succeeded': organizations without an active paid subscription
    const query = sql`
      SELECT
        o.id AS org_id,
        o.name AS org_name,
        o.management_email,
        si.trial_at AS trial_end_date,
        GREATEST(0, (si.trial_at::date - CURRENT_DATE)) AS days_remaining,
        o.created_at
      FROM orgs o
      INNER JOIN stripe_info si ON si.customer_id = o.customer_id
      WHERE si.trial_at::date >= CURRENT_DATE
        AND (si.status IS NULL OR si.status != 'succeeded')
      ORDER BY days_remaining ASC, o.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    // Count query for pagination
    const countQuery = sql`
      SELECT COUNT(*)::int AS total
      FROM orgs o
      INNER JOIN stripe_info si ON si.customer_id = o.customer_id
      WHERE si.trial_at::date >= CURRENT_DATE
        AND (si.status IS NULL OR si.status != 'succeeded')
    `

    const [result, countResult] = await Promise.all([
      drizzleClient.execute(query),
      drizzleClient.execute(countQuery),
    ])

    const organizations: AdminTrialOrganization[] = result.rows.map((row: any) => ({
      org_id: row.org_id,
      org_name: row.org_name,
      management_email: row.management_email,
      trial_end_date: row.trial_end_date,
      days_remaining: Number(row.days_remaining),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }))

    const total = Number((countResult.rows[0] as any)?.total) || 0

    cloudlog({ requestId: c.get('requestId'), message: 'getAdminTrialOrganizations result', resultCount: organizations.length, total })

    return { organizations, total }
  }
  catch (e: unknown) {
    logPgError(c, 'getAdminTrialOrganizations', e)
    return { organizations: [], total: 0 }
  }
}

// Admin Onboarding Funnel
export interface AdminOnboardingFunnel {
  total_orgs: number
  orgs_with_app: number
  orgs_with_channel: number
  orgs_with_bundle: number
  // Conversion rates
  app_conversion_rate: number
  channel_conversion_rate: number
  bundle_conversion_rate: number
  // Trend data
  trend: Array<{
    date: string
    new_orgs: number
    orgs_created_app: number
    orgs_created_channel: number
    orgs_created_bundle: number
  }>
}

export async function getAdminOnboardingFunnel(
  c: Context,
  start_date: string,
  end_date: string,
): Promise<AdminOnboardingFunnel> {
  try {
    // Read replicas don't include org/app/channel data, so use primary DB.
    const pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)

    // Get total funnel counts for orgs created in the date range
    const funnelQuery = sql`
      WITH orgs_in_range AS (
        SELECT id, created_at::date as created_date
        FROM orgs
        WHERE created_at >= ${start_date}::timestamp
          AND created_at < ${end_date}::timestamp
      ),
      orgs_with_apps AS (
        SELECT DISTINCT o.id, o.created_date
        FROM orgs_in_range o
        INNER JOIN apps a ON a.owner_org = o.id
      ),
      orgs_with_channels AS (
        SELECT DISTINCT o.id, o.created_date
        FROM orgs_in_range o
        INNER JOIN apps a ON a.owner_org = o.id
        INNER JOIN channels c ON c.app_id = a.app_id
      ),
      orgs_with_bundles AS (
        SELECT DISTINCT o.id, o.created_date
        FROM orgs_in_range o
        INNER JOIN apps a ON a.owner_org = o.id
        INNER JOIN channels c ON c.app_id = a.app_id
        INNER JOIN app_versions av ON av.id = c.version AND av.name != 'builtin'
      )
      SELECT
        (SELECT COUNT(*)::int FROM orgs_in_range) as total_orgs,
        (SELECT COUNT(*)::int FROM orgs_with_apps) as orgs_with_app,
        (SELECT COUNT(*)::int FROM orgs_with_channels) as orgs_with_channel,
        (SELECT COUNT(*)::int FROM orgs_with_bundles) as orgs_with_bundle
    `

    const funnelResult = await drizzleClient.execute(funnelQuery)
    const funnelRow = funnelResult.rows[0] as any || {}

    const totalOrgs = Number(funnelRow.total_orgs) || 0
    const orgsWithApp = Number(funnelRow.orgs_with_app) || 0
    const orgsWithChannel = Number(funnelRow.orgs_with_channel) || 0
    const orgsWithBundle = Number(funnelRow.orgs_with_bundle) || 0

    // Get daily trend data
    const trendQuery = sql`
      WITH date_series AS (
        SELECT generate_series(
          ${start_date}::timestamptz::date,
          (${end_date}::timestamptz::date - 1),
          '1 day'::interval
        )::date as date
      ),
      daily_orgs AS (
        SELECT created_at::date as date, COUNT(*)::int as new_orgs
        FROM orgs
        WHERE created_at >= ${start_date}::timestamp
          AND created_at < ${end_date}::timestamp
        GROUP BY created_at::date
      ),
      daily_apps AS (
        SELECT o.created_at::date as date, COUNT(DISTINCT o.id)::int as orgs_created_app
        FROM orgs o
        INNER JOIN apps a ON a.owner_org = o.id
        WHERE o.created_at >= ${start_date}::timestamp
          AND o.created_at < ${end_date}::timestamp
          AND a.created_at >= o.created_at
          AND a.created_at < o.created_at + interval '7 days'
        GROUP BY o.created_at::date
      ),
      daily_channels AS (
        SELECT o.created_at::date as date, COUNT(DISTINCT o.id)::int as orgs_created_channel
        FROM orgs o
        INNER JOIN apps a ON a.owner_org = o.id
        INNER JOIN channels c ON c.app_id = a.app_id
        WHERE o.created_at >= ${start_date}::timestamp
          AND o.created_at < ${end_date}::timestamp
          AND c.created_at >= o.created_at
          AND c.created_at < o.created_at + interval '7 days'
        GROUP BY o.created_at::date
      ),
      daily_bundles AS (
        SELECT o.created_at::date as date, COUNT(DISTINCT o.id)::int as orgs_created_bundle
        FROM orgs o
        INNER JOIN apps a ON a.owner_org = o.id
        INNER JOIN channels c ON c.app_id = a.app_id
        INNER JOIN app_versions av ON av.id = c.version AND av.name != 'builtin'
        WHERE o.created_at >= ${start_date}::timestamp
          AND o.created_at < ${end_date}::timestamp
          AND av.created_at >= o.created_at
          AND av.created_at < o.created_at + interval '7 days'
        GROUP BY o.created_at::date
      )
      SELECT
        ds.date,
        COALESCE(dorgs.new_orgs, 0) as new_orgs,
        COALESCE(dapps.orgs_created_app, 0) as orgs_created_app,
        COALESCE(dchannels.orgs_created_channel, 0) as orgs_created_channel,
        COALESCE(dbundles.orgs_created_bundle, 0) as orgs_created_bundle
      FROM date_series ds
      LEFT JOIN daily_orgs dorgs ON dorgs.date = ds.date
      LEFT JOIN daily_apps dapps ON dapps.date = ds.date
      LEFT JOIN daily_channels dchannels ON dchannels.date = ds.date
      LEFT JOIN daily_bundles dbundles ON dbundles.date = ds.date
      ORDER BY ds.date ASC
    `

    const trendResult = await drizzleClient.execute(trendQuery)
    const trend = trendResult.rows.map((row: any) => ({
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
      new_orgs: Number(row.new_orgs) || 0,
      orgs_created_app: Number(row.orgs_created_app) || 0,
      orgs_created_channel: Number(row.orgs_created_channel) || 0,
      orgs_created_bundle: Number(row.orgs_created_bundle) || 0,
    }))

    const result: AdminOnboardingFunnel = {
      total_orgs: totalOrgs,
      orgs_with_app: orgsWithApp,
      orgs_with_channel: orgsWithChannel,
      orgs_with_bundle: orgsWithBundle,
      app_conversion_rate: totalOrgs > 0 ? (orgsWithApp / totalOrgs) * 100 : 0,
      channel_conversion_rate: orgsWithApp > 0 ? (orgsWithChannel / orgsWithApp) * 100 : 0,
      bundle_conversion_rate: orgsWithChannel > 0 ? (orgsWithBundle / orgsWithChannel) * 100 : 0,
      trend,
    }

    cloudlog({ requestId: c.get('requestId'), message: 'getAdminOnboardingFunnel result', result })

    return result
  }
  catch (e: unknown) {
    logPgError(c, 'getAdminOnboardingFunnel', e)
    return {
      total_orgs: 0,
      orgs_with_app: 0,
      orgs_with_channel: 0,
      orgs_with_bundle: 0,
      app_conversion_rate: 0,
      channel_conversion_rate: 0,
      bundle_conversion_rate: 0,
      trend: [],
    }
  }
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
