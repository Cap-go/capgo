import { describe, expect, it } from 'vitest'
import { readReplicaSchemaCompatibilityIssues } from '../read_replicate/schema_compatibility.ts'

function catalog() {
  return {
    version: 1,
    tables: [{ name: 'apps', kind: 'r', reloptions: [] }],
    columns: [
      { table: 'apps', name: 'id', position: 1, type: 'uuid', notNull: true, default: 'gen_random_uuid()', identity: 'd', generated: '' },
      { table: 'apps', name: 'name', position: 2, type: 'text', notNull: false, default: null, identity: '', generated: '' },
    ],
    constraints: [
      { table: 'apps', name: 'apps_pkey', type: 'p', definition: 'PRIMARY KEY (id)', valid: true },
      { table: 'apps', name: 'apps_name_check', type: 'c', definition: 'CHECK (name <> \'\')', valid: true },
    ],
    indexes: [
      {
        table: 'apps',
        name: 'apps_pkey',
        definition: 'CREATE UNIQUE INDEX apps_pkey ON public.apps USING btree (id)',
        valid: true,
        constraintOwned: true,
      },
      {
        table: 'apps',
        name: 'apps_name_idx',
        definition: 'CREATE INDEX apps_name_idx ON public.apps USING btree (name)',
        valid: true,
        constraintOwned: false,
      },
    ],
    types: [{ name: 'status', kind: 'e', definition: ['active', 'disabled'] }],
    sequences: [{
      name: 'apps_id_seq',
      type: 'bigint',
      start: '1',
      increment: '1',
      min: '1',
      max: '9223372036854775807',
      cache: '1',
      cycle: false,
      ownedTable: 'apps' as string | null,
      ownedColumn: 'id' as string | null,
      lastValue: '1',
    }],
    functions: [
      { name: 'helper', arguments: '', definition: 'CREATE FUNCTION helper() RETURNS text AS $$ SELECT \'old\' $$ LANGUAGE sql' },
      { name: 'helper', arguments: 'value text', definition: 'CREATE FUNCTION helper(value text) RETURNS text AS $$ SELECT value $$ LANGUAGE sql' },
    ],
  }
}

describe('read-replica schema compatibility', () => {
  it.concurrent('accepts the same selected structural catalog while ignoring runtime and out-of-scope metadata', () => {
    const expected = catalog()
    const actual = catalog()
    actual.sequences[0].lastValue = '999'

    const actualWithOutOfScope = actual as Record<string, unknown>
    actualWithOutOfScope.foreignKeys = [{ table: 'apps', name: 'apps_org_id_fkey' }]
    actualWithOutOfScope.triggers = [{ table: 'apps', name: 'apps_audit' }]
    actualWithOutOfScope.rls = [{ table: 'apps', enabled: true }]

    expect(readReplicaSchemaCompatibilityIssues(expected, actual)).toEqual([])
  })

  it.concurrent('rejects structural drift across selected schema objects', () => {
    const expected = catalog()
    const actual = catalog()
    actual.columns[1] = {
      ...actual.columns[1],
      position: 3,
      type: 'integer',
      notNull: true,
      default: '0',
      identity: 'a',
      generated: 's',
    }
    actual.constraints[0] = {
      ...actual.constraints[0],
      type: 'u',
      definition: 'UNIQUE (id)',
      valid: false,
    }
    actual.indexes[0] = {
      ...actual.indexes[0],
      definition: 'CREATE UNIQUE INDEX apps_pkey ON public.apps USING btree (name)',
      valid: false,
      constraintOwned: false,
    }
    actual.types[0].definition.push('replica_only')
    actual.sequences[0].increment = '2'
    actual.sequences[0].ownedColumn = 'name'
    actual.functions[1].definition = 'changed function'

    expect(readReplicaSchemaCompatibilityIssues(expected, actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'column', object: 'apps.name', reason: 'expected position 2, found 3' }),
      expect.objectContaining({ kind: 'column', object: 'apps.name', reason: 'expected type text, found integer' }),
      expect.objectContaining({ kind: 'column', object: 'apps.name', reason: 'subscriber is NOT NULL while publisher accepts NULL' }),
      expect.objectContaining({ kind: 'column', object: 'apps.name', reason: 'expected default null, found 0' }),
      expect.objectContaining({ kind: 'column', object: 'apps.name', reason: 'expected identity kind none, found a' }),
      expect.objectContaining({ kind: 'column', object: 'apps.name', reason: 'expected generated kind none, found s' }),
      expect.objectContaining({ kind: 'constraint', object: 'apps.apps_pkey', reason: 'expected type p, found u' }),
      expect.objectContaining({ kind: 'constraint', object: 'apps.apps_pkey', reason: 'constraint definition differs' }),
      expect.objectContaining({ kind: 'constraint', object: 'apps.apps_pkey', reason: 'expected valid true, found false' }),
      expect.objectContaining({ kind: 'index', object: 'apps_pkey', reason: 'index definition differs' }),
      expect.objectContaining({ kind: 'index', object: 'apps_pkey', reason: 'index is invalid' }),
      expect.objectContaining({ kind: 'index', object: 'apps_pkey', reason: 'expected constraintOwned true, found false' }),
      expect.objectContaining({ kind: 'type', object: 'status', reason: 'type definition differs' }),
      expect.objectContaining({ kind: 'sequence', object: 'apps_id_seq', reason: 'expected increment 1, found 2' }),
      expect.objectContaining({ kind: 'sequence', object: 'apps_id_seq', reason: 'expected owned column id, found name' }),
      expect.objectContaining({ kind: 'function', object: 'helper(value text)', reason: 'function definition differs' }),
    ]))
  })

  it.concurrent('keys functions by overload', () => {
    const expected = catalog()
    const actual = catalog()
    actual.functions = [{ ...actual.functions[1], definition: 'changed function' }]

    expect(readReplicaSchemaCompatibilityIssues(expected, actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'function', object: 'helper()', reason: 'missing required function overload' }),
      expect.objectContaining({ kind: 'function', object: 'helper(value text)', reason: 'function definition differs' }),
    ]))
  })

  it.concurrent('rejects unexpected objects in the selected catalog', () => {
    const expected = catalog()
    const actual = catalog()
    actual.tables.push({ name: 'replica_only', kind: 'r', reloptions: [] })
    actual.columns.push({
      table: 'apps',
      name: 'replica_only',
      position: 3,
      type: 'text',
      notNull: false,
      default: null,
      identity: '',
      generated: '',
    })
    actual.constraints.push({ table: 'apps', name: 'apps_replica_only_check', type: 'c', definition: 'CHECK (true)', valid: true })
    actual.indexes.push({
      table: 'apps',
      name: 'apps_replica_only_idx',
      definition: 'CREATE INDEX apps_replica_only_idx ON public.apps USING btree (name)',
      valid: true,
      constraintOwned: false,
    })
    actual.types.push({ name: 'replica_only_type', kind: 'e', definition: ['value'] })
    actual.sequences.push({
      name: 'replica_only_seq',
      type: 'bigint',
      start: '1',
      increment: '1',
      min: '1',
      max: '9223372036854775807',
      cache: '1',
      cycle: false,
      ownedTable: null,
      ownedColumn: null,
      lastValue: '1',
    })
    actual.functions.push({ name: 'replica_only', arguments: '', definition: 'CREATE FUNCTION replica_only() RETURNS void AS $$ SELECT $$ LANGUAGE sql' })

    expect(readReplicaSchemaCompatibilityIssues(expected, actual)).toEqual(expect.arrayContaining([
      { kind: 'table', object: 'replica_only', reason: 'unexpected table' },
      { kind: 'column', object: 'apps.replica_only', reason: 'unexpected column' },
      { kind: 'constraint', object: 'apps.apps_replica_only_check', reason: 'unexpected constraint' },
      { kind: 'index', object: 'apps_replica_only_idx', reason: 'unexpected index adds storage and write cost' },
      { kind: 'type', object: 'replica_only_type', reason: 'unexpected type' },
      { kind: 'sequence', object: 'replica_only_seq', reason: 'unexpected sequence' },
      { kind: 'function', object: 'replica_only()', reason: 'unexpected function overload' },
    ]))
  })
})
