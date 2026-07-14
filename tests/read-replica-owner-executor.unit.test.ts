import { readFile } from 'node:fs/promises'
import { createPgliteEngine, Database } from 'tinbase'
import { describe, expect, it } from 'vitest'
import {
  READ_REPLICA_SCHEMA_CATALOG_SQL,
  REPLICA_TABLES,
} from '../read_replicate/schema_catalog.ts'
import {
  assertGoogleDataApiCatalogQuery,
  assertGoogleReadReplicaExecutorState,
  renderReadReplicaExecutorPreflightSql,
  renderReadReplicaOwnerExecutorSql,
  renderReadReplicaOwnerExecutorTransaction,
} from '../scripts/sync-read-replica-schema.ts'

const ownerExecutorUrl = new URL(
  '../read_replicate/cloud_sql_owner_executor.sql',
  import.meta.url,
)

const addInviteOperation = {
  action: 'add_column' as const,
  table: 'org_users',
  column: 'is_invite',
  expectedType: 'boolean',
  defaultLiteral: 'false',
  notNull: true,
}

const ciDatabaseUser = 'capgo-read-replica-ci@capgo-394818.iam'

describe('read-replica Cloud SQL owner executor', () => {
  it.concurrent('renders only reviewed owner-function calls in one transaction', () => {
    const addInviteSql = 'SELECT capgo_internal.add_read_replica_column(\'org_users\', \'is_invite\', \'boolean\', \'false\', TRUE)'
    expect(renderReadReplicaOwnerExecutorSql(addInviteOperation)).toBe(addInviteSql)
    expect(renderReadReplicaOwnerExecutorTransaction([addInviteOperation])).toBe(
      `BEGIN;\n${addInviteSql};\nCOMMIT;`,
    )
    expect(() => assertGoogleDataApiCatalogQuery(
      READ_REPLICA_SCHEMA_CATALOG_SQL,
    )).not.toThrow()
    expect(() => assertGoogleDataApiCatalogQuery(
      'ALTER TABLE public.org_users ADD COLUMN unsafe text',
    )).toThrow('only permits selected-schema catalog reads')
    const preflightSql = renderReadReplicaExecutorPreflightSql()
    expect(preflightSql).toContain('pg_catalog.pg_has_role(session_user, \'cloudsqlsuperuser\', \'member\')')
    expect(preflightSql).toContain('pg_catalog.has_function_privilege')
    expect(preflightSql).toContain('pg_catalog.has_table_privilege')
    expect(() => assertGoogleReadReplicaExecutorState([{
      session_user: ciDatabaseUser,
      executor_member: 'true',
      no_cloudsqlsuperuser: 'true',
      schema_usage: 'true',
      add_column_execute: 'true',
      no_table_access: 'true',
    }])).not.toThrow()
    expect(() => assertGoogleReadReplicaExecutorState([{
      session_user: ciDatabaseUser,
      executor_member: 'true',
      no_cloudsqlsuperuser: 'false',
      schema_usage: 'true',
      add_column_execute: 'true',
      no_table_access: 'true',
    }])).toThrow('replace cloudsqlsuperuser')
    expect(() => assertGoogleReadReplicaExecutorState([{
      session_user: ciDatabaseUser,
      executor_member: 'true',
      no_cloudsqlsuperuser: 'true',
      schema_usage: 'true',
      add_column_execute: 'true',
      no_table_access: 'false',
    }])).toThrow('owner-executor access only')
  })

  it.concurrent('keeps the owner executor private and least-privileged', async () => {
    const sql = await readFile(ownerExecutorUrl, 'utf8')

    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = \'\'')
    expect(sql).toContain(`session_user <> '${ciDatabaseUser}'`)
    expect(sql).toContain('pg_catalog.pg_has_role(session_user, \'cloudsqlsuperuser\', \'member\')')
    expect(sql).toContain('REVOKE ALL ON SCHEMA capgo_internal FROM PUBLIC;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION capgo_internal.add_read_replica_column(')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION capgo_internal.add_read_replica_column(')
    expect(sql).toContain('TO capgo_read_replica_schema_executor;')
    expect(sql).toContain('pg_catalog.format_type')
    expect(sql).toContain('\' DEFAULT %L::%s\'')
    expect(sql).toContain('DROP FUNCTION IF EXISTS capgo_internal.set_read_replica_column_not_null(')
    expect(sql).not.toContain('ALTER COLUMN')
    expect(sql).not.toContain('DROP DEFAULT')
    expect(sql).not.toContain('GRANT SELECT')
    expect(sql).not.toContain('GRANT INSERT')
    expect(sql).not.toContain('GRANT UPDATE')
    expect(sql).not.toContain('GRANT EXECUTE ON FUNCTION capgo_internal.set_read_replica_column_not_null(')

    for (const table of REPLICA_TABLES)
      expect(sql).toContain(`'${table}'`)
  })

  it.concurrent(
    'atomically adds the selected column, retains its replication default, and denies direct table access',
    async () => {
      const database = await Database.create(await createPgliteEngine())
      try {
        await database.exec(await readFile(ownerExecutorUrl, 'utf8'))
        const otherReplicaTableSql = REPLICA_TABLES
          .filter(table => table !== 'org_users')
          .map(table => `CREATE TABLE public.${table} (id bigint);`)
          .join('\n')
        await database.exec(`
          CREATE TABLE public.org_users (
            id bigint,
            existing_boolean boolean
          );
          ${otherReplicaTableSql}
          CREATE ROLE cloudsqlsuperuser NOLOGIN;
          CREATE ROLE "${ciDatabaseUser}" LOGIN;
          GRANT capgo_read_replica_schema_executor TO "${ciDatabaseUser}";
          SET SESSION AUTHORIZATION '${ciDatabaseUser}';
        `)

        const preflight = await database.query(renderReadReplicaExecutorPreflightSql())
        expect(preflight.rows).toEqual([{
          session_user: ciDatabaseUser,
          executor_member: true,
          no_cloudsqlsuperuser: true,
          schema_usage: true,
          add_column_execute: true,
          no_table_access: true,
        }])

        await database.exec(
          renderReadReplicaOwnerExecutorTransaction([addInviteOperation]),
        )
        await expect(database.query(
          'SELECT * FROM public.org_users',
        )).rejects.toThrow('permission denied')

        const metadata = await database.query(`
          SELECT attribute.attnotnull, pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) AS column_default
          FROM pg_catalog.pg_attribute AS attribute
          JOIN pg_catalog.pg_class AS relation
            ON relation.oid = attribute.attrelid
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          LEFT JOIN pg_catalog.pg_attrdef AS default_value
            ON default_value.adrelid = attribute.attrelid
            AND default_value.adnum = attribute.attnum
          WHERE namespace.nspname = 'public'
            AND relation.relname = 'org_users'
            AND attribute.attname = 'is_invite'
        `)
        expect(metadata.rows).toEqual([{
          attnotnull: true,
          column_default: 'false',
        }])

        await expect(database.exec(renderReadReplicaOwnerExecutorTransaction([
          {
            ...addInviteOperation,
            column: 'rollback_probe',
          },
          {
            ...addInviteOperation,
            column: 'rejected_type',
            expectedType: 'not_a_real_type',
          },
        ]))).rejects.toThrow('rejected the column type')
        await database.exec('ROLLBACK')
        const rolledBack = await database.query(`
          SELECT 1
          FROM pg_catalog.pg_attribute AS attribute
          JOIN pg_catalog.pg_class AS relation
            ON relation.oid = attribute.attrelid
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname = 'org_users'
            AND attribute.attname = 'rollback_probe'
            AND NOT attribute.attisdropped
        `)
        expect(rolledBack.rows).toEqual([])
      }
      finally {
        await database.close()
      }
    },
  )
})
