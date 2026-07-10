import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { APIKEY_TEST_ALL, executeSQL, fetchWithRetry, getAuthHeaders, SUPABASE_ANON_KEY, SUPABASE_BASE_URL } from './test-utils.ts'

interface RestProbeRow {
  table_name: string
  probe_column: string
}

const restRelationProbeSql = `
WITH rest_relations AS (
  SELECT c.oid, c.relname AS table_name
  FROM pg_class c
  INNER JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
),
primary_key_columns AS (
  SELECT DISTINCT ON (i.indrelid) i.indrelid, a.attname
  FROM pg_index i
  INNER JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indisprimary
  ORDER BY i.indrelid, array_position(i.indkey, a.attnum)
),
first_columns AS (
  SELECT DISTINCT ON (attrelid) attrelid, attname
  FROM pg_attribute
  WHERE attnum > 0
    AND NOT attisdropped
  ORDER BY attrelid, attnum
)
SELECT rest_relations.table_name, COALESCE(primary_key_columns.attname, first_columns.attname) AS probe_column
FROM rest_relations
LEFT JOIN primary_key_columns ON primary_key_columns.indrelid = rest_relations.oid
LEFT JOIN first_columns ON first_columns.attrelid = rest_relations.oid
WHERE COALESCE(primary_key_columns.attname, first_columns.attname) IS NOT NULL
ORDER BY rest_relations.table_name
`

const coreUnfilteredRestTables = [
  'app_versions',
  'apps',
  'channels',
  'devices',
  'manifest',
  'org_users',
  'orgs',
]

const riskySelectPolicySql = `
SELECT
  c.relname AS table_name,
  p.polname AS policy_name,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr
FROM pg_policy p
INNER JOIN pg_class c ON c.oid = p.polrelid
INNER JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND p.polcmd IN ('r', '*')
  AND (
    has_table_privilege('anon', c.oid, 'SELECT')
    OR has_table_privilege('authenticated', c.oid, 'SELECT')
  )
  AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ~ $1
  AND NOT (
    c.relname = 'app_versions'
    AND p.polname = 'Allow for auth, api keys (read+)'
    AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ~ '\\mapp_versions_has_app_permission\\M'
    AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ~ '\\mapp_versions_readable_app_ids\\M'
    AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%request.method%'
  )
ORDER BY c.relname, p.polname
`

function getAnonHeaders() {
  if (!SUPABASE_BASE_URL || !SUPABASE_ANON_KEY)
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for unfiltered REST RLS tests')

  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  }
}

function getInvalidApiKeyHeaders() {
  return {
    ...getAnonHeaders(),
    capgkey: randomUUID(),
  }
}

function getValidApiKeyHeaders() {
  return {
    ...getAnonHeaders(),
    capgkey: APIKEY_TEST_ALL,
  }
}

async function getAuthenticatedHeaders() {
  return {
    ...getAnonHeaders(),
    ...await getAuthHeaders(),
  }
}

async function fetchRestProbe(probe: RestProbeRow, headers: Record<string, string>) {
  const params = new URLSearchParams({
    select: probe.probe_column,
    limit: '1',
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    return await fetchWithRetry(
      `${SUPABASE_BASE_URL}/rest/v1/${encodeURIComponent(probe.table_name)}?${params.toString()}`,
      { headers, signal: controller.signal },
      1,
    )
  }
  finally {
    clearTimeout(timeout)
  }
}

describe('public REST unfiltered RLS regression guard', () => {
  it('does not run direct per-row identity helpers in exposed SELECT policies', async () => {
    const riskyRows = await executeSQL(riskySelectPolicySql, [
      '\\m(check_min_rights|get_identity|get_identity_org_allowed|get_identity_org_appid|get_user_main_org_id_by_app_id|is_member_of_org|is_current_user_group_member|rbac_check_permission|app_versions_has_app_permission|is_user_org_admin|is_user_app_admin|user_has_role_in_app|user_has_app_update_user_roles)\\M',
    ])

    expect(riskyRows.map((row: any) => ({
      table: row.table_name,
      policy: row.policy_name,
      using: row.using_expr,
    }))).toEqual([])
  })

  it.concurrent('keeps app-version helpers stable for statement-level RLS', async () => {
    const rows = await executeSQL(`
      SELECT proname, provolatile
      FROM pg_proc
      WHERE oid IN (
        'public.app_versions_readable_app_ids()'::regprocedure,
        'public.readable_app_version_ids()'::regprocedure
      )
      ORDER BY proname
    `)

    expect(rows).toEqual([
      { proname: 'app_versions_readable_app_ids', provolatile: 's' },
      { proname: 'readable_app_version_ids', provolatile: 's' },
    ])
  })

  it('does not raise or timeout on unfiltered reads for every public REST relation', async () => {
    const probes = await executeSQL(restRelationProbeSql) as RestProbeRow[]
    const probedTables = new Set(probes.map(probe => probe.table_name))
    const missingCoreTables = coreUnfilteredRestTables.filter(table => !probedTables.has(table))

    expect(missingCoreTables).toEqual([])

    const scenarios = [
      { name: 'anonymous', headers: getAnonHeaders() },
      { name: 'invalid API key', headers: getInvalidApiKeyHeaders() },
      { name: 'authenticated', headers: await getAuthenticatedHeaders() },
      { name: 'valid API key', headers: getValidApiKeyHeaders() },
    ]
    const failures: string[] = []

    for (let index = 0; index < probes.length; index += 8) {
      const batch = probes.slice(index, index + 8)
      const results = await Promise.all(batch.flatMap(probe => scenarios.map(async (scenario) => {
        try {
          const response = await fetchRestProbe(probe, scenario.headers)
          const body = await response.text()

          if (response.status >= 500)
            return `${probe.table_name} ${scenario.name}: ${response.status} ${body}`
        }
        catch (error) {
          return `${probe.table_name} ${scenario.name}: ${(error as Error).message}`
        }

        return null
      })))

      failures.push(...results.filter((result): result is string => result !== null))
    }

    expect(failures).toEqual([])
  })
})
