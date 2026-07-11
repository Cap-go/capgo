import { describe, expect, it } from 'vitest'
import { applyReadReplicaAdditiveSchemaSync } from '../read_replicate/schema_additive_sync.ts'
import { READ_REPLICA_SCHEMA_CATALOG_SQL } from '../read_replicate/schema_catalog.ts'

function catalogs() {
  const expected = {
    tables: [{ name: 'apps' }],
    columns: [
      { table: 'apps', name: 'id', type: 'uuid', notNull: true, default: null, identity: '', generated: '' },
      { table: 'apps', name: 'created_from_onboarding', type: 'boolean', notNull: true, default: 'false', identity: '', generated: '' },
    ],
    constraints: [],
    indexes: [{ table: 'apps', name: 'idx_apps_id', definition: 'CREATE INDEX idx_apps_id ON public.apps USING btree (id)', valid: true }],
  }
  const initial = {
    ...expected,
    columns: [expected.columns[0]],
    indexes: [] as typeof expected.indexes,
  }

  return { expected, initial }
}

describe('read-replica additive schema sync', () => {
  it.concurrent('fails instead of reporting applied objects when the post-DDL catalog is stale', async () => {
    const { expected, initial } = catalogs()
    const statements: string[] = []
    let catalogReads = 0
    const client = {
      query: async (text: string) => {
        if (text === READ_REPLICA_SCHEMA_CATALOG_SQL) {
          catalogReads += 1
          return { rows: [{ catalog: initial }] }
        }

        statements.push(text)
        return { rows: [] }
      },
    }

    await expect(applyReadReplicaAdditiveSchemaSync(client, expected)).rejects.toThrow('did not persist column apps.created_from_onboarding, index apps.idx_apps_id')
    expect(catalogReads).toBe(2)
    expect(statements).toEqual(expect.arrayContaining([
      'ALTER TABLE public."apps" ADD COLUMN IF NOT EXISTS "created_from_onboarding" boolean DEFAULT false NOT NULL',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_apps_id" ON public."apps" USING btree (id)',
    ]))
  })

  it.concurrent('fails when a created index remains invalid after the catalog refresh', async () => {
    const { expected } = catalogs()
    const current = {
      ...expected,
      indexes: [] as typeof expected.indexes,
    }
    const client = {
      query: async (text: string) => {
        if (text === READ_REPLICA_SCHEMA_CATALOG_SQL)
          return { rows: [{ catalog: current }] }

        if (text.startsWith('CREATE INDEX'))
          current.indexes.push({ ...expected.indexes[0], valid: false })
        return { rows: [] }
      },
    }

    await expect(applyReadReplicaAdditiveSchemaSync(client, expected)).rejects.toThrow('did not persist index apps.idx_apps_id')
  })

  it.concurrent('returns applied only after the post-DDL catalog contains every statement', async () => {
    const { expected, initial } = catalogs()
    const current = structuredClone(initial)
    let catalogReads = 0
    const client = {
      query: async (text: string) => {
        if (text === READ_REPLICA_SCHEMA_CATALOG_SQL) {
          catalogReads += 1
          return { rows: [{ catalog: current }] }
        }

        if (text.startsWith('ALTER TABLE'))
          current.columns.push(expected.columns[1])
        if (text.startsWith('CREATE INDEX'))
          current.indexes.push(expected.indexes[0])
        return { rows: [] }
      },
    }

    await expect(applyReadReplicaAdditiveSchemaSync(client, expected)).resolves.toEqual({
      applied: [
        { kind: 'column', table: 'apps', name: 'created_from_onboarding' },
        { kind: 'index', table: 'apps', name: 'idx_apps_id' },
      ],
      skipped: [],
    })
    expect(catalogReads).toBe(2)
  })
})
