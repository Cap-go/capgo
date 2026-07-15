import type {
  ReadReplicaSchemaSyncPlan,
  ReadReplicaSchemaSyncStatement,
} from '../read_replicate/schema_additive_sync.ts'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  assertGoogleReadReplicaSchemaPlan,
  renderReadReplicaImportTransaction,
} from '../scripts/sync-read-replica-schema.ts'

const syncScriptUrl = new URL(
  '../scripts/sync-read-replica-schema.ts',
  import.meta.url,
)

const safeColumnStatement: ReadReplicaSchemaSyncStatement = {
  kind: 'column',
  table: 'apps',
  name: 'read_replica_import_unit',
  sql: 'ALTER TABLE public."apps" ADD COLUMN IF NOT EXISTS "read_replica_import_unit" boolean',
}

function plan(
  statements: ReadReplicaSchemaSyncStatement[],
): ReadReplicaSchemaSyncPlan {
  return { statements, skipped: [] }
}

describe('read-replica Cloud SQL server-side import', () => {
  it.concurrent('renders reviewed DDL as one postgres-owned atomic import transaction', () => {
    assertGoogleReadReplicaSchemaPlan(plan([safeColumnStatement]))

    expect(renderReadReplicaImportTransaction([safeColumnStatement])).toBe(
      [
        'BEGIN;',
        `${safeColumnStatement.sql};`,
        'COMMIT;',
      ].join('\n'),
    )
  })

  it.concurrent('rejects unsupported plans before they can become import input', () => {
    const unsupportedStatements: ReadReplicaSchemaSyncStatement[] = [
      {
        kind: 'index',
        table: 'apps',
        name: 'read_replica_import_unit_index',
        sql: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "read_replica_import_unit_index" ON public."apps" ("app_id")',
      },
      {
        kind: 'function',
        table: 'public',
        name: 'read_replica_import_unit_function()',
        sql: 'CREATE OR REPLACE FUNCTION public.read_replica_import_unit_function() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$',
      },
    ]

    for (const statement of unsupportedStatements) {
      expect(() => {
        assertGoogleReadReplicaSchemaPlan(plan([statement]))
      }).toThrow('cannot atomically apply')
      expect(() => {
        renderReadReplicaImportTransaction([statement])
      }).toThrow('cannot atomically apply')
    }
  })

  it.concurrent('uses only the server-side postgres import path without database-side machinery', async () => {
    const source = await readFile(syncScriptUrl, 'utf8')

    expect(source).toMatch(/['"]sql['"],\s*['"]import['"],\s*['"]sql['"]/)
    expect(source).toMatch(/--user=(?:postgres|\$\{POSTGRES_IMPORT_USER\})/)
    expect(source).toContain('BEGIN;')
    expect(source).toContain('COMMIT;')
    expect(source).not.toContain('capgo_read_replica_schema_owner')
    expect(source).not.toContain('bootstrap-read-replica-schema-owner')
    expect(source).not.toContain('CREATE ROLE')
    expect(source).not.toContain(' OWNER TO ')
    expect(source).not.toContain('SET LOCAL ROLE')
    expect(source).not.toContain('CREATE FUNCTION')
    expect(source).not.toContain('SECURITY DEFINER')
    expect(source).not.toContain('GRANT ')
    expect(source).not.toContain('REVOKE ')
  })
})
