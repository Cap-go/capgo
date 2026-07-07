// Single source of truth for the Cloudflare-embedded read replica (D1).
// The replicator worker derives the SQLite DDL, upsert and delete statements
// from these specs, and the reader relies on the same column kinds to map
// SQLite values back to the shapes the Postgres read path returns.
//
// Keep table list in sync with:
// - supabase/migrations/20260707150000_edge_replica_outbox.sql (triggers)
// - read_replicate/schema_replicate.sql (legacy Cloud SQL replica)

export type EdgeColumnKind = 'text' | 'int' | 'real' | 'bool' | 'json' | 'timestamp'

export interface EdgeTableSpec {
  // Replica primary key, used for upserts and delete replay.
  pk: string[]
  columns: Record<string, EdgeColumnKind>
  indexes?: string[][]
}

export const EDGE_REPLICA_SCHEMA_VERSION = 1

export const EDGE_REPLICA_TABLES: Record<string, EdgeTableSpec> = {
  apps: {
    pk: ['app_id'],
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
      transfer_history: 'json',
      channel_device_count: 'int',
      manifest_bundle_count: 'int',
      expose_metadata: 'bool',
      allow_preview: 'bool',
      allow_device_custom_id: 'bool',
      need_onboarding: 'bool',
      existing_app: 'bool',
      ios_store_url: 'text',
      android_store_url: 'text',
      stats_updated_at: 'timestamp',
      stats_refresh_requested_at: 'timestamp',
      build_timeout_seconds: 'int',
      build_timeout_updated_at: 'timestamp',
      block_provider_infra_requests: 'bool',
      rollout_channel_count: 'int',
      rollout_paused_version_names: 'json',
    },
    indexes: [['owner_org']],
  },
  app_versions: {
    pk: ['id'],
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
      native_packages: 'json',
      owner_org: 'text',
      user_id: 'text',
      r2_path: 'text',
      manifest: 'json',
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
      rbac_id: 'text',
      electron: 'bool',
      rollout_version: 'int',
      rollout_percentage_bps: 'int',
      rollout_enabled: 'bool',
      rollout_id: 'text',
      rollout_paused_at: 'timestamp',
      rollout_pause_reason: 'text',
      rollout_cache_ttl_seconds: 'int',
      auto_pause_enabled: 'bool',
      auto_pause_window_minutes: 'int',
      auto_pause_failure_rate_bps: 'int',
      auto_pause_confidence: 'real',
      auto_pause_min_attempts: 'int',
      auto_pause_min_failures: 'int',
      auto_pause_action: 'text',
      auto_pause_cooldown_minutes: 'int',
      auto_pause_last_triggered_at: 'timestamp',
      auto_pause_last_checked_at: 'timestamp',
    },
    indexes: [['app_id', 'name'], ['app_id', 'public']],
  },
  manifest: {
    pk: ['id'],
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
  notifications: {
    pk: ['owner_org', 'event', 'uniq_id'],
    columns: {
      created_at: 'timestamp',
      updated_at: 'timestamp',
      last_send_at: 'timestamp',
      total_send: 'int',
      owner_org: 'text',
      event: 'text',
      uniq_id: 'text',
    },
  },
  onboarding_demo_data: {
    pk: ['id'],
    columns: {
      id: 'text',
      created_at: 'timestamp',
      app_id: 'text',
      owner_org: 'text',
      relation_name: 'text',
      row_key: 'text',
      seed_id: 'text',
    },
    indexes: [['app_id']],
  },
  org_users: {
    pk: ['id'],
    columns: {
      id: 'int',
      created_at: 'timestamp',
      updated_at: 'timestamp',
      user_id: 'text',
      org_id: 'text',
      app_id: 'text',
      channel_id: 'int',
      user_right: 'text',
      rbac_role_name: 'text',
    },
    indexes: [['org_id']],
  },
  orgs: {
    pk: ['id'],
    columns: {
      id: 'text',
      created_by: 'text',
      created_at: 'timestamp',
      updated_at: 'timestamp',
      logo: 'text',
      name: 'text',
      management_email: 'text',
      customer_id: 'text',
      stats_updated_at: 'timestamp',
      last_stats_updated_at: 'timestamp',
      use_new_rbac: 'bool',
      enforcing_2fa: 'bool',
      email_preferences: 'json',
      enforce_hashed_api_keys: 'bool',
      require_apikey_expiration: 'bool',
      max_apikey_expiration_days: 'int',
      password_policy_config: 'json',
      enforce_encrypted_bundles: 'bool',
      required_encryption_key: 'text',
      has_usage_credits: 'bool',
      website: 'text',
      stats_refresh_requested_at: 'timestamp',
      onboarding: 'json',
    },
    indexes: [['customer_id']],
  },
  stripe_info: {
    pk: ['customer_id'],
    columns: {
      created_at: 'timestamp',
      updated_at: 'timestamp',
      subscription_id: 'text',
      customer_id: 'text',
      status: 'text',
      product_id: 'text',
      trial_at: 'timestamp',
      price_id: 'text',
      is_good_plan: 'bool',
      plan_usage: 'int',
      subscription_anchor_start: 'timestamp',
      subscription_anchor_end: 'timestamp',
      canceled_at: 'timestamp',
      mau_exceeded: 'bool',
      storage_exceeded: 'bool',
      bandwidth_exceeded: 'bool',
      id: 'int',
      plan_calculated_at: 'timestamp',
      build_time_exceeded: 'bool',
      upgraded_at: 'timestamp',
      paid_at: 'timestamp',
      customer_country: 'text',
      last_stripe_event_at: 'timestamp',
      past_due_at: 'timestamp',
      churn_reason: 'text',
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

// DDL applied by the replicator on /init and before seeding. Everything is
// IF NOT EXISTS so re-running is always safe.
export function buildEdgeReplicaDDL(): string[] {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS replication_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
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
