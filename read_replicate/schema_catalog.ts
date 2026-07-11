export const REPLICA_TABLES = [
  'orgs',
  'stripe_info',
  'org_users',
  'apps',
  'app_versions',
  'channels',
  'channel_devices',
  'manifest',
  'notifications',
  'onboarding_demo_data',
] as const

export const REPLICA_TYPES = [
  'disable_update',
  'manifest_entry',
  'stripe_status',
] as const

const REPLICA_SEQUENCES = [
  'app_versions_id_seq',
  'channel_devices_id_seq',
  'channel_id_seq',
  'manifest_id_seq',
  'org_users_id_seq',
  'stripe_info_id_seq',
] as const

export const REPLICA_FUNCTIONS = [
  'one_month_ahead',
] as const

export const REPLICA_EXCLUDED_INDEXES = [
  // replicate_prepare.sh intentionally omits this source-only customer lookup index from the replica DDL.
  'idx_stripe_info_customer_id',
] as const

export function replicaConfigPattern(values: readonly string[]): string {
  return values.map(escapeRegex).join('|')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

export interface Queryable {
  query: (queryText: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>
}

// The release checker reads this catalog before and after schema DDL. The explicit
// CURRENT_TIMESTAMP predicate makes Hyperdrive treat the verification read as
// non-cacheable, so it observes DDL from the same release run.
export const READ_REPLICA_SCHEMA_CATALOG_SQL = `
WITH replica_tables(table_name) AS (
  SELECT unnest($1::text[])
),
replica_types(type_name) AS (
  SELECT unnest($2::text[])
),
replica_sequences(sequence_name) AS (
  SELECT unnest($3::text[])
),
replica_functions(function_name) AS (
  SELECT unnest($4::text[])
),
replica_excluded_indexes(index_name) AS (
  SELECT unnest($5::text[])
),
tables AS (
  SELECT
    c.oid AS table_oid,
    c.relname AS table_name,
    c.relkind,
    COALESCE((
      SELECT jsonb_agg(option ORDER BY option)
      FROM unnest(c.reloptions) AS option
    ), '[]'::jsonb) AS reloptions
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN replica_tables rt ON rt.table_name = c.relname
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
),
columns AS (
  SELECT
    t.table_name,
    row_number() OVER (PARTITION BY t.table_name ORDER BY a.attnum)::int AS position,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull AS not_null,
    a.attidentity AS identity_kind,
    a.attgenerated AS generated_kind,
    pg_get_expr(d.adbin, d.adrelid) AS default_expr
  FROM tables t
  JOIN pg_attribute a ON a.attrelid = t.table_oid
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0
    AND NOT a.attisdropped
),
constraints AS (
  SELECT
    t.table_name,
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    pg_get_constraintdef(con.oid, true) AS definition
  FROM tables t
  JOIN pg_constraint con ON con.conrelid = t.table_oid
  WHERE con.contype IN ('p', 'u', 'c')
),
indexes AS (
  SELECT
    t.table_name,
    idx.relname AS index_name,
    pg_get_indexdef(idx.oid) AS definition,
    ix.indisvalid AS is_valid
  FROM tables t
  JOIN pg_index ix ON ix.indrelid = t.table_oid
  JOIN pg_class idx ON idx.oid = ix.indexrelid
  WHERE NOT EXISTS (
    SELECT 1
    FROM replica_excluded_indexes rei
    WHERE rei.index_name = idx.relname
  )
),
types AS (
  SELECT
    typ.typname AS type_name,
    typ.typtype AS type_kind,
    CASE
      WHEN typ.typtype = 'e' THEN (
        SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
        FROM pg_enum e
        WHERE e.enumtypid = typ.oid
      )
      WHEN typ.typtype = 'c' THEN (
        SELECT jsonb_agg(
          jsonb_build_object(
            'position', a.attnum,
            'name', a.attname,
            'type', pg_catalog.format_type(a.atttypid, a.atttypmod)
          )
          ORDER BY a.attnum
        )
        FROM pg_attribute a
        WHERE a.attrelid = typ.typrelid
          AND a.attnum > 0
          AND NOT a.attisdropped
      )
      ELSE NULL
    END AS definition
  FROM pg_type typ
  JOIN pg_namespace n ON n.oid = typ.typnamespace
  JOIN replica_types rt ON rt.type_name = typ.typname
  WHERE n.nspname = 'public'
),
sequences AS (
  SELECT
    seq.relname AS sequence_name,
    pg_catalog.format_type(s.seqtypid, NULL) AS data_type,
    s.seqstart::text AS start_value,
    s.seqincrement::text AS increment_by,
    s.seqmin::text AS min_value,
    s.seqmax::text AS max_value,
    s.seqcache::text AS cache_size,
    s.seqcycle AS cycle,
    owned_table.relname AS owned_table,
    owned_attr.attname AS owned_column
  FROM pg_class seq
  JOIN pg_namespace n ON n.oid = seq.relnamespace
  JOIN pg_sequence s ON s.seqrelid = seq.oid
  JOIN replica_sequences rs ON rs.sequence_name = seq.relname
  LEFT JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype = 'a'
  LEFT JOIN pg_class owned_table ON owned_table.oid = dep.refobjid
  LEFT JOIN pg_attribute owned_attr ON owned_attr.attrelid = dep.refobjid AND owned_attr.attnum = dep.refobjsubid
  WHERE n.nspname = 'public'
    AND seq.relkind = 'S'
),
functions AS (
  SELECT
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN replica_functions rf ON rf.function_name = p.proname
  WHERE n.nspname = 'public'
)
SELECT jsonb_build_object(
  'version', 1,
  'tables', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', table_name,
      'kind', relkind,
      'reloptions', reloptions
    ) ORDER BY table_name)
    FROM tables
  ), '[]'::jsonb),
  'columns', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table', table_name,
      'position', position,
      'name', column_name,
      'type', data_type,
      'notNull', not_null,
      'default', default_expr,
      'identity', identity_kind,
      'generated', generated_kind
    ) ORDER BY table_name, position)
    FROM columns
  ), '[]'::jsonb),
  'constraints', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table', table_name,
      'name', constraint_name,
      'type', constraint_type,
      'definition', definition
    ) ORDER BY table_name, constraint_name)
    FROM constraints
  ), '[]'::jsonb),
  'indexes', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table', table_name,
      'name', index_name,
      'definition', definition,
      'valid', is_valid
    ) ORDER BY table_name, index_name)
    FROM indexes
  ), '[]'::jsonb),
  'types', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', type_name,
      'kind', type_kind,
      'definition', definition
    ) ORDER BY type_name)
    FROM types
  ), '[]'::jsonb),
  'sequences', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', sequence_name,
      'type', data_type,
      'start', start_value,
      'increment', increment_by,
      'min', min_value,
      'max', max_value,
      'cache', cache_size,
      'cycle', cycle,
      'ownedTable', owned_table,
      'ownedColumn', owned_column
    ) ORDER BY sequence_name)
    FROM sequences
  ), '[]'::jsonb),
  'functions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', function_name,
      'arguments', arguments,
      'definition', definition
    ) ORDER BY function_name, arguments)
    FROM functions
  ), '[]'::jsonb)
) AS catalog
FROM (SELECT CURRENT_TIMESTAMP AS checked_at) AS fresh_catalog_read
WHERE fresh_catalog_read.checked_at IS NOT NULL
`

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2)
}

export async function readReplicaSchemaCatalog(client: Queryable): Promise<unknown> {
  const result = await client.query(READ_REPLICA_SCHEMA_CATALOG_SQL, [
    REPLICA_TABLES,
    REPLICA_TYPES,
    REPLICA_SEQUENCES,
    REPLICA_FUNCTIONS,
    REPLICA_EXCLUDED_INDEXES,
  ])
  const catalog = result.rows[0]?.catalog
  if (!catalog)
    throw new Error('Read-replica schema catalog query returned no rows')

  return sortJson(catalog)
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sortJson)

  if (!value || typeof value !== 'object')
    return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortJson(child)]),
  )
}
