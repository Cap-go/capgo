import { describe, expect, it } from 'vitest'
import {
  buildDeleteStatement,
  buildEdgeReplicaDDL,
  buildUpsertStatement,
  convertPgJsonValue,
  EDGE_REPLICA_TABLES,
  pgJsonRowToPkValues,
  pgJsonRowToSqliteValues,
} from '../supabase/functions/_backend/utils/edge_replica_schema.ts'

describe('edge replica schema specs', () => {
  it.concurrent('covers the same tables as the outbox migration', () => {
    expect(Object.keys(EDGE_REPLICA_TABLES).sort()).toEqual([
      'app_versions',
      'apps',
      'channel_devices',
      'channels',
      'manifest',
      'notifications',
      'onboarding_demo_data',
      'org_users',
      'orgs',
      'stripe_info',
    ])
  })

  it.concurrent('every pk column exists in the column spec', () => {
    for (const [table, spec] of Object.entries(EDGE_REPLICA_TABLES)) {
      for (const pk of spec.pk)
        expect(spec.columns[pk], `${table}.${pk}`).toBeDefined()
    }
  })

  it.concurrent('generates one CREATE TABLE per table plus replication_state', () => {
    const ddl = buildEdgeReplicaDDL()
    const createTables = ddl.filter(sql => sql.startsWith('CREATE TABLE'))
    expect(createTables).toHaveLength(Object.keys(EDGE_REPLICA_TABLES).length + 1)
    expect(ddl[0]).toContain('replication_state')
    // hot path indexes
    expect(ddl.some(sql => sql.includes('idx_channels_app_id_name'))).toBe(true)
    expect(ddl.some(sql => sql.includes('idx_channel_devices_app_id_device_id'))).toBe(true)
    expect(ddl.some(sql => sql.includes('idx_manifest_app_version_id'))).toBe(true)
  })
})

describe('edge replica value conversion', () => {
  it.concurrent('converts postgres json values to sqlite bindings', () => {
    expect(convertPgJsonValue('bool', true)).toBe(1)
    expect(convertPgJsonValue('bool', false)).toBe(0)
    expect(convertPgJsonValue('bool', null)).toBeNull()
    expect(convertPgJsonValue('int', 42)).toBe(42)
    expect(convertPgJsonValue('int', '9007199254740991')).toBe(9007199254740991)
    expect(convertPgJsonValue('real', 0.95)).toBe(0.95)
    expect(convertPgJsonValue('json', ['a', 'b'])).toBe('["a","b"]')
    expect(convertPgJsonValue('json', { intent: 'ota' })).toBe('{"intent":"ota"}')
    expect(convertPgJsonValue('timestamp', '2026-07-07T10:00:00.123+00:00')).toBe('2026-07-07T10:00:00.123+00:00')
    expect(convertPgJsonValue('text', 'production')).toBe('production')
    expect(convertPgJsonValue('text', undefined)).toBeNull()
  })

  it.concurrent('orders row values by the column spec and ignores unknown keys', () => {
    const values = pgJsonRowToSqliteValues('manifest', {
      file_size: 10,
      id: 7,
      app_version_id: 3,
      file_name: 'index.html',
      s3_path: 'orgs/x/index.html',
      file_hash: 'abc',
      some_future_column: 'ignored',
    })
    expect(values).toEqual([7, 3, 'index.html', 'orgs/x/index.html', 'abc', 10])
  })

  it.concurrent('binds NULL for columns missing from the payload', () => {
    const values = pgJsonRowToSqliteValues('manifest', { id: 1 })
    expect(values).toEqual([1, null, null, null, null, null])
  })

  it.concurrent('converts booleans and arrays for the apps hot columns', () => {
    const spec = EDGE_REPLICA_TABLES.apps
    const columns = Object.keys(spec.columns)
    const values = pgJsonRowToSqliteValues('apps', {
      app_id: 'com.demo.app',
      expose_metadata: false,
      allow_device_custom_id: true,
      block_provider_infra_requests: true,
      rollout_paused_version_names: ['1.0.0', '1.0.1'],
      channel_device_count: 12,
    })
    const value = (name: string) => values[columns.indexOf(name)]
    expect(value('app_id')).toBe('com.demo.app')
    expect(value('expose_metadata')).toBe(0)
    expect(value('allow_device_custom_id')).toBe(1)
    expect(value('block_provider_infra_requests')).toBe(1)
    expect(value('rollout_paused_version_names')).toBe('["1.0.0","1.0.1"]')
    expect(value('channel_device_count')).toBe(12)
  })

  it.concurrent('throws on unknown tables', () => {
    expect(() => pgJsonRowToSqliteValues('devices', {})).toThrow('unknown table')
  })
})

describe('edge replica statements', () => {
  it.concurrent('builds idempotent upserts with every column bound', () => {
    const sql = buildUpsertStatement('channels')
    expect(sql).toMatch(/^INSERT OR REPLACE INTO "channels" /)
    const placeholders = sql.match(/\?/g) ?? []
    expect(placeholders).toHaveLength(Object.keys(EDGE_REPLICA_TABLES.channels.columns).length)
  })

  it.concurrent('builds deletes on the replica primary key', () => {
    expect(buildDeleteStatement('apps')).toBe('DELETE FROM "apps" WHERE "app_id" = ?')
    expect(buildDeleteStatement('notifications')).toBe('DELETE FROM "notifications" WHERE "owner_org" = ? AND "event" = ? AND "uniq_id" = ?')
  })

  it.concurrent('extracts composite pk values in pk order', () => {
    const values = pgJsonRowToPkValues('notifications', {
      uniq_id: 'u1',
      event: 'org:missing_payment',
      owner_org: 'org-1',
      total_send: 3,
    })
    expect(values).toEqual(['org-1', 'org:missing_payment', 'u1'])
  })
})
