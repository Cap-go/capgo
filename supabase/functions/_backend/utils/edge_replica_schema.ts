// Single source of truth for the Cloudflare-embedded read replica
// (per-app Durable Objects with SQLite storage).
//
// The replicator worker derives the SQLite DDL, upsert/delete statements and
// the per-app seed queries from these specs; the AppReplica DO runs the
// hot-path queries built here; the reader maps the resulting rows back to
// the exact shapes the Postgres read path returns.
//
// Keep table list in sync with:
// - supabase/migrations/20260707150000_edge_replica_outbox.sql (triggers)

export type EdgeColumnKind = 'text' | 'int' | 'real' | 'bool' | 'json' | 'timestamp'

export interface EdgeTableSpec {
  // Replica primary key, used for upserts and delete replay.
  pk: string[]
  // 'app' rows are routed/seeded by app_id, 'org' rows by owner_org.
  scope: 'app' | 'org'
  columns: Record<string, EdgeColumnKind>
  indexes?: string[][]
}

export const EDGE_REPLICA_SCHEMA_VERSION = 2

// Only the tables the update hot path needs. Each per-app replica holds the
// app's slice of the app-scoped tables plus its owning org's org-scoped rows.
export const EDGE_REPLICA_TABLES: Record<string, EdgeTableSpec> = {
  apps: {
    pk: ['app_id'],
    scope: 'app',
    columns: {
      created_at: 'timestamp',
      app_id: 'text',
      icon_url: 'text',
      user_id: 'text',
      name: 'text',
      last_version: 'text',
      updated_at: 'timestamp',
      id: 'text',
      retention: 'int',
      owner_org: 'text',
      default_upload_channel: 'text',
      channel_device_count: 'int',
      manifest_bundle_count: 'int',
      expose_metadata: 'bool',
      allow_preview: 'bool',
      allow_device_custom_id: 'bool',
      ios_store_url: 'text',
      android_store_url: 'text',
      block_provider_infra_requests: 'bool',
      rollout_channel_count: 'int',
      rollout_paused_version_names: 'json',
    },
  },
  app_versions: {
    pk: ['id'],
    scope: 'app',
    columns: {
      id: 'int',
      created_at: 'timestamp',
      app_id: 'text',
      name: 'text',
      updated_at: 'timestamp',
      deleted: 'bool',
      external_url: 'text',
      checksum: 'text',
      session_key: 'text',
      storage_provider: 'text',
      min_update_version: 'text',
      owner_org: 'text',
      r2_path: 'text',
      link: 'text',
      comment: 'text',
      manifest_count: 'int',
      key_id: 'text',
      cli_version: 'text',
      deleted_at: 'timestamp',
    },
    indexes: [['app_id', 'name']],
  },
  channel_devices: {
    pk: ['id'],
    scope: 'app',
    columns: {
      created_at: 'timestamp',
      channel_id: 'int',
      app_id: 'text',
      updated_at: 'timestamp',
      device_id: 'text',
      id: 'int',
      owner_org: 'text',
    },
    indexes: [['app_id', 'device_id']],
  },
  channels: {
    pk: ['id'],
    scope: 'app',
    columns: {
      id: 'int',
      created_at: 'timestamp',
      name: 'text',
      app_id: 'text',
      version: 'int',
      updated_at: 'timestamp',
      public: 'bool',
      disable_auto_update_under_native: 'bool',
      ios: 'bool',
      android: 'bool',
      allow_device_self_set: 'bool',
      allow_emulator: 'bool',
      allow_device: 'bool',
      allow_dev: 'bool',
      allow_prod: 'bool',
      disable_auto_update: 'text',
      owner_org: 'text',
      created_by: 'text',
      electron: 'bool',
      rollout_version: 'int',
      rollout_percentage_bps: 'int',
      rollout_enabled: 'bool',
      rollout_id: 'text',
      rollout_paused_at: 'timestamp',
      rollout_pause_reason: 'text',
      rollout_cache_ttl_seconds: 'int',
    },
    indexes: [['app_id', 'name'], ['app_id', 'public']],
  },
  manifest: {
    pk: ['id'],
    scope: 'app',
    columns: {
      id: 'int',
      app_version_id: 'int',
      file_name: 'text',
      s3_path: 'text',
      file_hash: 'text',
      file_size: 'int',
    },
    indexes: [['app_version_id']],
  },
  orgs: {
    pk: ['id'],
    scope: 'org',
    columns: {
      id: 'text',
      created_by: 'text',
      created_at: 'timestamp',
      updated_at: 'timestamp',
      name: 'text',
      management_email: 'text',
      customer_id: 'text',
      has_usage_credits: 'bool',
    },
  },
  stripe_info: {
    pk: ['customer_id'],
    scope: 'org',
    columns: {
      created_at: 'timestamp',
      updated_at: 'timestamp',
      customer_id: 'text',
      status: 'text',
      product_id: 'text',
      trial_at: 'timestamp',
      is_good_plan: 'bool',
      mau_exceeded: 'bool',
      storage_exceeded: 'bool',
      bandwidth_exceeded: 'bool',
      build_time_exceeded: 'bool',
      canceled_at: 'timestamp',
      past_due_at: 'timestamp',
    },
  },
}

function sqliteType(kind: EdgeColumnKind): string {
  switch (kind) {
    case 'int':
    case 'bool':
      return 'INTEGER'
    case 'real':
      return 'REAL'
    default:
      // timestamps are ISO-8601 text so date() / strftime() work directly
      return 'TEXT'
  }
}

// DDL applied by each AppReplica DO on first use. Everything is
// IF NOT EXISTS so re-running is always safe.
export function buildEdgeReplicaDDL(): string[] {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS replica_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  ]
  for (const [table, spec] of Object.entries(EDGE_REPLICA_TABLES)) {
    const cols = Object.entries(spec.columns)
      .map(([name, kind]) => `"${name}" ${sqliteType(kind)}`)
      .join(', ')
    const pk = spec.pk.map(colName => `"${colName}"`).join(', ')
    statements.push(`CREATE TABLE IF NOT EXISTS "${table}" (${cols}, PRIMARY KEY (${pk}))`)
    for (const index of spec.indexes ?? []) {
      const indexName = `idx_${table}_${index.join('_')}`
      const indexCols = index.map(colName => `"${colName}"`).join(', ')
      statements.push(`CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" (${indexCols})`)
    }
  }
  return statements
}

export function convertPgJsonValue(kind: EdgeColumnKind, value: unknown): unknown {
  if (value === null || value === undefined)
    return null
  switch (kind) {
    case 'bool':
      return value ? 1 : 0
    case 'int':
    case 'real':
      return typeof value === 'number' ? value : Number(value)
    case 'json':
      return JSON.stringify(value)
    case 'timestamp':
    case 'text':
      return String(value)
  }
}

// Convert one row from the outbox (row_to_json output) into ordered SQLite
// bind values. Unknown JSON keys are dropped so adding a Postgres column never
// breaks replication; missing keys bind NULL so dropping one never does either.
export function pgJsonRowToSqliteValues(table: string, row: Record<string, unknown>): unknown[] {
  const spec = EDGE_REPLICA_TABLES[table]
  if (!spec)
    throw new Error(`edge replica: unknown table ${table}`)
  return Object.entries(spec.columns).map(([name, kind]) => convertPgJsonValue(kind, row[name]))
}

export function buildUpsertStatement(table: string): string {
  const spec = EDGE_REPLICA_TABLES[table]
  if (!spec)
    throw new Error(`edge replica: unknown table ${table}`)
  const columns = Object.keys(spec.columns)
  const cols = columns.map(colName => `"${colName}"`).join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  return `INSERT OR REPLACE INTO "${table}" (${cols}) VALUES (${placeholders})`
}

export function buildDeleteStatement(table: string): string {
  const spec = EDGE_REPLICA_TABLES[table]
  if (!spec)
    throw new Error(`edge replica: unknown table ${table}`)
  const where = spec.pk.map(colName => `"${colName}" = ?`).join(' AND ')
  return `DELETE FROM "${table}" WHERE ${where}`
}

export function pgJsonRowToPkValues(table: string, row: Record<string, unknown>): unknown[] {
  const spec = EDGE_REPLICA_TABLES[table]
  if (!spec)
    throw new Error(`edge replica: unknown table ${table}`)
  return spec.pk.map(colName => convertPgJsonValue(spec.columns[colName], row[colName]))
}

// ---------------------------------------------------------------------------
// Per-app seed queries (run against Postgres, never the main hot path).
// Each returns rows shaped as { r: <row_to_json> } for pgJsonRowToSqliteValues.
// Keyset pagination is on the replica pk of each table.
// ---------------------------------------------------------------------------

export interface SeedQuerySpec {
  table: string
  sql: string
  // Column used for keyset pagination, referenced as `keyset > $2`.
  keyset: string
  // 'app' binds [app_id], 'org' binds [owner_org] (before cursor values)
  binds: 'app' | 'org'
}

export function buildAppSeedQueries(): SeedQuerySpec[] {
  return [
    { table: 'apps', binds: 'app', keyset: 't."app_id"', sql: `SELECT row_to_json(t) AS r, t."app_id" AS k1 FROM public.apps t WHERE t.app_id = $1` },
    { table: 'orgs', binds: 'org', keyset: 't."id"::text', sql: `SELECT row_to_json(t) AS r, t."id"::text AS k1 FROM public.orgs t WHERE t.id = $1::uuid` },
    { table: 'stripe_info', binds: 'org', keyset: 't."customer_id"', sql: `SELECT row_to_json(t) AS r, t."customer_id" AS k1 FROM public.stripe_info t WHERE t.customer_id = (SELECT o.customer_id FROM public.orgs o WHERE o.id = $1::uuid)` },
    { table: 'channels', binds: 'app', keyset: 't."id"', sql: `SELECT row_to_json(t) AS r, t."id" AS k1 FROM public.channels t WHERE t.app_id = $1` },
    // Only versions the hot path can select (activeChannelVersionJoin).
    { table: 'app_versions', binds: 'app', keyset: 't."id"', sql: `SELECT row_to_json(t) AS r, t."id" AS k1 FROM public.app_versions t WHERE t.app_id = $1 AND (t.deleted = false OR t.name = 'builtin')` },
    { table: 'manifest', binds: 'app', keyset: 't."id"', sql: `SELECT row_to_json(t) AS r, t."id" AS k1 FROM public.manifest t WHERE t.app_version_id IN (SELECT av.id FROM public.app_versions av WHERE av.app_id = $1 AND av.deleted = false AND av.manifest_count > 0)` },
    { table: 'channel_devices', binds: 'app', keyset: 't."id"', sql: `SELECT row_to_json(t) AS r, t."id" AS k1 FROM public.channel_devices t WHERE t.app_id = $1` },
  ]
}

// ---------------------------------------------------------------------------
// RPC DTOs shared between the plugin workers (reader) and the replicator DOs.
// Keep this file free of runtime imports so both bundles stay independent.
// ---------------------------------------------------------------------------

export type EdgeReplicaRow = Record<string, unknown>

export interface EdgeQueryResult {
  status: 'ok' | 'unavailable'
  rows?: EdgeReplicaRow[]
  // Channel-override rows when queryInfos ran an override lookup.
  override?: EdgeReplicaRow[]
}

export interface EdgeInfosArgs {
  platform: string
  deviceId: string
  defaultChannel: string
  includeManifest: boolean
  includeMetadata: boolean
  rollout: boolean
  queryOverride: boolean
  channelSelfOverrideChannelId?: number | null
}

export interface EdgeApplyEntry {
  table: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  row: Record<string, unknown>
}

export interface EdgeApplyBatch {
  entries: EdgeApplyEntry[]
  leaseMs: number
}

export interface EdgeApplyResult {
  ok?: boolean
  unregister?: boolean
}

// RPC surface of the AppReplica DO as seen from the plugin workers.
export interface AppReplicaRpc {
  queryAppOwner: (appId: string, actions: PlanLimitAction[]) => Promise<EdgeQueryResult>
  queryBlockProvider: (appId: string) => Promise<EdgeQueryResult>
  queryInfos: (appId: string, args: EdgeInfosArgs) => Promise<EdgeQueryResult>
  queryManifest: (appId: string, versionId: number) => Promise<EdgeQueryResult>
}

// ---------------------------------------------------------------------------
// Hot-path queries, SQLite dialect, executed inside the AppReplica DO.
// They mirror the drizzle queries in pg.ts exactly (see the *Postgres
// functions of the same intent) and return flat rows the reader maps back to
// the Postgres shapes.
// ---------------------------------------------------------------------------

export type PlanLimitAction = 'mau' | 'storage' | 'bandwidth'

const PLAN_EXCEEDED_COLUMNS: Record<PlanLimitAction, string> = {
  mau: 'mau_exceeded',
  storage: 'storage_exceeded',
  bandwidth: 'bandwidth_exceeded',
}

export interface EdgeQuery {
  sql: string
  params: unknown[]
}

// Mirrors buildPlanValidationExpression in pg.ts.
function planValidSql(actions: PlanLimitAction[]): string {
  const extraConditions = actions.map(action => ` AND si.${PLAN_EXCEEDED_COLUMNS[action]} = 0`).join('')
  return `CASE WHEN (
    EXISTS (SELECT 1 FROM orgs oc WHERE oc.id = a.owner_org AND oc.has_usage_credits = 1)
    OR EXISTS (
      SELECT 1 FROM stripe_info si
      WHERE si.customer_id = (SELECT oi.customer_id FROM orgs oi WHERE oi.id = a.owner_org)
        AND (
          date(si.trial_at) > date('now')
          OR (si.status = 'succeeded'${extraConditions})
        )
    )
    OR (SELECT oi.customer_id FROM orgs oi WHERE oi.id = a.owner_org) IS NULL
  ) THEN 1 ELSE 0 END`
}

// Mirrors getAppOwnerPostgres (pg.ts).
export function buildAppOwnerQuery(appId: string, actions: PlanLimitAction[]): EdgeQuery {
  return {
    sql: `
      SELECT
        a.owner_org, a.channel_device_count, a.manifest_bundle_count, a.rollout_channel_count,
        a.rollout_paused_version_names, a.expose_metadata, a.allow_device_custom_id,
        a.block_provider_infra_requests,
        o.created_by AS org_created_by, o.id AS org_id, o.management_email AS org_management_email,
        ${planValidSql(actions)} AS plan_valid
      FROM apps a
      LEFT JOIN orgs o ON o.id = a.owner_org
      WHERE a.app_id = ?
      LIMIT 1`,
    params: [appId],
  }
}

export function buildBlockProviderQuery(appId: string): EdgeQuery {
  return {
    sql: 'SELECT block_provider_infra_requests FROM apps WHERE app_id = ? LIMIT 1',
    params: [appId],
  }
}

export const EDGE_CHANNEL_COLUMNS = [
  'id',
  'name',
  'app_id',
  'allow_dev',
  'allow_prod',
  'allow_emulator',
  'allow_device',
  'disable_auto_update_under_native',
  'disable_auto_update',
  'ios',
  'android',
  'electron',
  'allow_device_self_set',
  'public',
  'rollout_version',
  'rollout_percentage_bps',
  'rollout_enabled',
  'rollout_id',
  'rollout_paused_at',
  'rollout_pause_reason',
  'rollout_cache_ttl_seconds',
] as const

function channelSelect(): string {
  return EDGE_CHANNEL_COLUMNS.map(col => `ch."${col}" AS "c_${col}"`).join(', ')
}

// Mirrors getVersionSelect in pg.ts. `useBuiltinCase` matches the Postgres
// behavior where a channel without a linked version resolves to 'builtin'.
function versionSelect(aliasName: string, prefix: string, includeMetadata: boolean, useBuiltinCase: boolean): string {
  const name = useBuiltinCase
    ? `CASE WHEN ch.version IS NULL THEN 'builtin' ELSE ${aliasName}.name END`
    : `${aliasName}.name`
  const cols = [
    `${aliasName}.id AS "${prefix}_id"`,
    `${name} AS "${prefix}_name"`,
    `${aliasName}.checksum AS "${prefix}_checksum"`,
    `${aliasName}.session_key AS "${prefix}_session_key"`,
    `${aliasName}.key_id AS "${prefix}_key_id"`,
    `COALESCE(${aliasName}.storage_provider, 'r2') AS "${prefix}_storage_provider"`,
    `${aliasName}.external_url AS "${prefix}_external_url"`,
    `${aliasName}.min_update_version AS "${prefix}_min_update_version"`,
    `${aliasName}.manifest_count AS "${prefix}_manifest_count"`,
    `${aliasName}.r2_path AS "${prefix}_r2_path"`,
  ]
  if (includeMetadata) {
    cols.push(`${aliasName}.link AS "${prefix}_link"`)
    cols.push(`${aliasName}.comment AS "${prefix}_comment"`)
  }
  return cols.join(', ')
}

// Mirrors activeChannelVersionJoin in pg.ts.
function versionJoin(aliasName: string, channelVersionColumn: string, joinType: 'LEFT' | 'INNER', matchAppId: boolean): string {
  const appIdCondition = matchAppId ? ` AND ${aliasName}.app_id = ch.app_id` : ''
  return `${joinType} JOIN app_versions ${aliasName}
    ON ${channelVersionColumn} = ${aliasName}.id
    AND (${aliasName}.deleted = 0 OR ${aliasName}.name = 'builtin')${appIdCondition}`
}

// Mirrors the json_agg(...) FILTER manifest aggregation in pg.ts.
function manifestEntriesSelect(): string {
  return `(
    SELECT json_group_array(json_object('file_name', m.file_name, 'file_hash', m.file_hash, 's3_path', m.s3_path))
    FROM manifest m WHERE m.app_version_id = v.id
  ) AS "manifest_entries"`
}

export interface ChannelQueryOptions {
  includeManifest: boolean
  includeMetadata: boolean
  rollout: boolean
}

// Mirrors requestInfosChannelByIdPostgres / ...PostgresRollout.
export function buildChannelByIdQuery(appId: string, channelId: number, options: ChannelQueryOptions): EdgeQuery {
  const { includeManifest, includeMetadata, rollout } = options
  if (rollout) {
    return {
      sql: `
        SELECT ${channelSelect()}, ${versionSelect('v', 'v', includeMetadata, true)}, ${versionSelect('rv', 'rv', includeMetadata, false)}
        FROM channels ch
        ${versionJoin('v', 'ch.version', 'LEFT', false)}
        ${versionJoin('rv', 'ch.rollout_version', 'LEFT', true)}
        WHERE ch.app_id = ? AND ch.id = ? AND (ch.version IS NULL OR v.id IS NOT NULL)
        LIMIT 1`,
      params: [appId, channelId],
    }
  }
  const manifest = includeManifest ? `, ${manifestEntriesSelect()}` : ''
  // INNER JOIN mirrors requestInfosChannelByIdPostgres.
  return {
    sql: `
      SELECT ${channelSelect()}, ${versionSelect('v', 'v', includeMetadata, true)}${manifest}
      FROM channels ch
      ${versionJoin('v', 'ch.version', 'INNER', false)}
      WHERE ch.app_id = ? AND ch.id = ?
      LIMIT 1`,
    params: [appId, channelId],
  }
}

// Mirrors requestInfosChannelDevicePostgres / ...PostgresRollout.
export function buildChannelDeviceQuery(appId: string, deviceId: string, options: ChannelQueryOptions): EdgeQuery {
  const { includeManifest, includeMetadata, rollout } = options
  const rolloutSelect = rollout ? `, ${versionSelect('rv', 'rv', includeMetadata, false)}` : ''
  const rolloutJoin = rollout ? versionJoin('rv', 'ch.rollout_version', 'LEFT', true) : ''
  const manifest = !rollout && includeManifest ? `, ${manifestEntriesSelect()}` : ''
  return {
    sql: `
      SELECT cd.device_id AS cd_device_id, cd.app_id AS cd_app_id,
        ${channelSelect()}, ${versionSelect('v', 'v', includeMetadata, true)}${rolloutSelect}${manifest}
      FROM channel_devices cd
      INNER JOIN channels ch ON cd.channel_id = ch.id
      ${versionJoin('v', 'ch.version', 'LEFT', false)}
      ${rolloutJoin}
      WHERE cd.device_id = ? AND cd.app_id = ? AND (ch.version IS NULL OR v.id IS NOT NULL)
      LIMIT 1`,
    params: [deviceId, appId],
  }
}

// Mirrors requestInfosChannelPostgres / ...PostgresRollout.
export function buildChannelQuery(platform: string, appId: string, defaultChannel: string, options: ChannelQueryOptions): EdgeQuery {
  const { includeManifest, includeMetadata, rollout } = options
  const platformColumn = platform === 'android' ? 'ch.android' : platform === 'electron' ? 'ch.electron' : 'ch.ios'
  const rolloutSelect = rollout ? `, ${versionSelect('rv', 'rv', includeMetadata, false)}` : ''
  const rolloutJoin = rollout ? versionJoin('rv', 'ch.rollout_version', 'LEFT', true) : ''
  const manifest = !rollout && includeManifest ? `, ${manifestEntriesSelect()}` : ''
  const filter = defaultChannel
    ? `ch.app_id = ? AND ch.name = ? AND ${platformColumn} = 1 AND (ch.public = 1 OR ch.allow_device_self_set = 1)`
    : `ch.public = 1 AND ch.app_id = ? AND ${platformColumn} = 1`
  return {
    sql: `
      SELECT ${channelSelect()}, ${versionSelect('v', 'v', includeMetadata, true)}${rolloutSelect}${manifest}
      FROM channels ch
      ${versionJoin('v', 'ch.version', 'LEFT', false)}
      ${rolloutJoin}
      WHERE ${filter} AND (ch.version IS NULL OR v.id IS NOT NULL)
      ORDER BY ch.name, ch.id
      LIMIT 1`,
    params: defaultChannel ? [appId, defaultChannel] : [appId],
  }
}

// Mirrors requestManifestEntriesPostgres.
export function buildManifestQuery(versionId: number): EdgeQuery {
  return {
    sql: 'SELECT file_name, file_hash, s3_path FROM manifest WHERE app_version_id = ?',
    params: [versionId],
  }
}
