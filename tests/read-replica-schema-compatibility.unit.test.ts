import { describe, expect, it } from 'vitest'
import { readReplicaSchemaCompatibilityIssues } from '../read_replicate/schema_compatibility.ts'

function catalog() {
  return {
    version: 1,
    tables: [{ name: 'apps', kind: 'r', reloptions: [] }],
    columns: [
      { table: 'apps', name: 'id', type: 'uuid', notNull: true, default: 'gen_random_uuid()', identity: '', generated: '', position: 1 },
      { table: 'apps', name: 'name', type: 'text', notNull: false, default: null, identity: '', generated: '', position: 2 },
    ],
    constraints: [{ table: 'apps', name: 'apps_name_check', type: 'c', definition: 'CHECK (name <> \'\')' }],
    indexes: [{ table: 'apps', name: 'apps_pkey', definition: 'CREATE UNIQUE INDEX apps_pkey ON public.apps USING btree (id)', valid: true }],
    types: [{ name: 'status', kind: 'e', definition: ['active', 'disabled'] }],
    sequences: [{ name: 'apps_id_seq', start: '1' }],
    functions: [{ name: 'helper', arguments: '', definition: 'old' }],
  }
}

describe('read-replica schema compatibility', () => {
  it.concurrent('accepts metadata drift that does not prevent logical replication', () => {
    const expected = catalog()
    const actual = catalog()
    actual.columns = [
      { ...actual.columns[1], position: 1, default: '\'replica\'' },
      { ...actual.columns[0], position: 2, default: 'different_default()' },
    ]
    actual.constraints = []
    actual.sequences = []
    actual.functions = []
    actual.types[0].definition.push('replica_only')

    expect(readReplicaSchemaCompatibilityIssues(expected, actual)).toEqual([])
  })

  it.concurrent('rejects missing or incompatible replication objects', () => {
    const expected = catalog()
    const actual = catalog()
    actual.columns = [
      { ...actual.columns[1], type: 'integer', notNull: true },
      { ...actual.columns[1], name: 'replica_only', notNull: true, default: null },
    ]
    actual.indexes[0].valid = false
    actual.types[0].definition = ['active']

    expect(readReplicaSchemaCompatibilityIssues(expected, actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'column', object: 'apps.id', reason: 'missing required column' }),
      expect.objectContaining({ kind: 'column', object: 'apps.name', reason: 'expected type text, found integer' }),
      expect.objectContaining({ kind: 'column', object: 'apps.name', reason: 'subscriber is NOT NULL while publisher accepts NULL' }),
      expect.objectContaining({ kind: 'column', object: 'apps.replica_only', reason: 'subscriber-only NOT NULL column has no default' }),
      expect.objectContaining({ kind: 'index', object: 'apps_pkey', reason: 'index is invalid' }),
      expect.objectContaining({ kind: 'type', object: 'status', reason: 'subscriber enum is missing publisher values' }),
    ]))
  })

  it.concurrent('rejects unexpected indexes because they add storage and write cost', () => {
    const expected = catalog()
    const actual = catalog()
    actual.indexes.push({
      table: 'apps',
      name: 'replica_only_idx',
      definition: 'CREATE INDEX replica_only_idx ON public.apps USING btree (name)',
      valid: true,
    })

    expect(readReplicaSchemaCompatibilityIssues(expected, actual)).toContainEqual({
      kind: 'index',
      object: 'replica_only_idx',
      reason: 'unexpected index adds storage and write cost',
    })
  })
})
