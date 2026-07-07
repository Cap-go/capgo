import { describe, expect, it } from 'vitest'
import {
  buildAppOwnerQuery,
  buildAppSeedQueries,
  buildChannelDeviceQuery,
  buildChannelQuery,
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

  it.concurrent('generates one CREATE TABLE per table plus replica_meta', () => {
    const ddl = buildEdgeReplicaDDL()
    const createTables = ddl.filter(sql => sql.startsWith('CREATE TABLE'))
    expect(createTables).toHaveLength(Object.keys(EDGE_REPLICA_TABLES).length + 1)
    expect(ddl[0]).toContain('replica_meta')
    // hot path indexes
    expect(ddl.some(sql => sql.includes('idx_channels_app_id_name'))).toBe(true)
    expect(ddl.some(sql => sql.includes('idx_channel_devices_app_id_device_id'))).toBe(true)
    expect(ddl.some(sql => sql.includes('idx_manifest_app_version_id'))).toBe(true)
  })

  it.concurrent('has one seed query per table with matching scope binds', () => {
    const seeds = buildAppSeedQueries()
    expect(seeds.map(seed => seed.table).sort()).toEqual(Object.keys(EDGE_REPLICA_TABLES).sort())
    for (const seed of seeds) {
      expect(seed.binds).toBe(EDGE_REPLICA_TABLES[seed.table].scope)
      expect(seed.sql).toContain('row_to_json(t)')
      expect(seed.sql).toContain('AS k1')
    }
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
    expect(buildDeleteStatement('stripe_info')).toBe('DELETE FROM "stripe_info" WHERE "customer_id" = ?')
  })

  it.concurrent('extracts pk values in pk order', () => {
    expect(pgJsonRowToPkValues('channels', { name: 'production', id: 7 })).toEqual([7])
    expect(pgJsonRowToPkValues('apps', { app_id: 'com.demo.app', id: 'uuid' })).toEqual(['com.demo.app'])
  })
})

describe('edge replica hot-path queries', () => {
  it.concurrent('app owner query validates plan per requested action', () => {
    const query = buildAppOwnerQuery('com.demo.app', ['mau', 'bandwidth'])
    expect(query.params).toEqual(['com.demo.app'])
    expect(query.sql).toContain('si.mau_exceeded = 0')
    expect(query.sql).toContain('si.bandwidth_exceeded = 0')
    expect(query.sql).not.toContain('si.storage_exceeded = 0')
    expect(query.sql).toContain(`date(si.trial_at) > date('now')`)
  })

  it.concurrent('channel query filters platform and visibility like postgres', () => {
    const named = buildChannelQuery('android', 'com.demo.app', 'beta', { includeManifest: true, includeMetadata: false, rollout: false })
    expect(named.params).toEqual(['com.demo.app', 'beta'])
    expect(named.sql).toContain('ch.android = 1')
    expect(named.sql).toContain('ch.public = 1 OR ch.allow_device_self_set = 1')
    expect(named.sql).toContain('manifest_entries')

    const publicOnly = buildChannelQuery('ios', 'com.demo.app', '', { includeManifest: false, includeMetadata: false, rollout: true })
    expect(publicOnly.params).toEqual(['com.demo.app'])
    expect(publicOnly.sql).toContain('ch.public = 1')
    expect(publicOnly.sql).toContain('rv.id AS "rv_id"')
    expect(publicOnly.sql).not.toContain('manifest_entries')
  })

  it.concurrent('device override query keeps the builtin fallback semantics', () => {
    const query = buildChannelDeviceQuery('com.demo.app', 'device-1', { includeManifest: false, includeMetadata: true, rollout: false })
    expect(query.params).toEqual(['device-1', 'com.demo.app'])
    expect(query.sql).toContain(`CASE WHEN ch.version IS NULL THEN 'builtin' ELSE v.name END`)
    expect(query.sql).toContain('(ch.version IS NULL OR v.id IS NOT NULL)')
    expect(query.sql).toContain('v.link AS "v_link"')
  })
})
