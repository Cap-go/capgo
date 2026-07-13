import { describe, expect, it } from 'vitest'
import {
  reconcileReadReplicaSchema,
} from '../read_replicate/schema_additive_sync.ts'
import { reconcileDirectReadReplicaSchema } from '../read_replicate/direct_schema_sync.ts'
import { READ_REPLICA_SCHEMA_CATALOG_SQL } from '../read_replicate/schema_catalog.ts'

describe('direct read-replica schema sync', () => {
  it.concurrent(
    'holds the direct subscriber advisory lock across live-primary reconciliation',
    async () => {
      const expected = {
        tables: [{ name: 'apps' }],
        columns: [
          {
            table: 'apps',
            name: 'created_from_onboarding',
            type: 'boolean',
            notNull: true,
            default: 'false',
            identity: '',
            generated: '',
          },
        ],
        constraints: [],
        indexes: [
          {
            table: 'apps',
            name: 'idx_apps_created_from_onboarding',
            definition:
              'CREATE INDEX idx_apps_created_from_onboarding ON public.apps USING btree (created_from_onboarding)',
            valid: true,
            constraintOwned: false,
          },
        ],
        sequences: [],
        functions: [],
        types: [],
      }
      const current = {
        ...structuredClone(expected),
        columns: [] as Array<(typeof expected.columns)[number]>,
        indexes: [] as Array<(typeof expected.indexes)[number]>,
      }
      const calls: string[] = []
      const master = {
        query: async (text: string) => {
          expect(text).toBe(READ_REPLICA_SCHEMA_CATALOG_SQL)
          return { rows: [{ catalog: expected }] }
        },
      }
      const replica = {
        query: async (text: string) => {
          calls.push(text)
          if (text === 'SELECT pg_try_advisory_lock($1::bigint) AS locked')
            return { rows: [{ locked: true }] }
          if (text === 'SELECT pg_advisory_unlock($1::bigint)')
            return { rows: [{ unlocked: true }] }
          if (text === READ_REPLICA_SCHEMA_CATALOG_SQL)
            return { rows: [{ catalog: current }] }
          if (text.startsWith('ALTER TABLE'))
            current.columns.push(expected.columns[0])
          if (text.startsWith('CREATE INDEX'))
            current.indexes.push(expected.indexes[0])
          return { rows: [] }
        },
      }

      await expect(
        reconcileDirectReadReplicaSchema(master, replica, {
          maxDurationMs: 60_000,
        }),
      ).resolves.toMatchObject({
        applied: [
          { kind: 'column', table: 'apps', name: 'created_from_onboarding' },
          {
            kind: 'index',
            table: 'apps',
            name: 'idx_apps_created_from_onboarding',
          },
        ],
        issues: [],
      })

      expect(calls[0]).toBe(
        'SELECT pg_try_advisory_lock($1::bigint) AS locked',
      )
      expect(calls.at(-1)).toBe('SELECT pg_advisory_unlock($1::bigint)')
    },
  )

  it.concurrent(
    'keeps the primary catalog reads inside the direct reconciliation deadline',
    async () => {
      let queried = false
      const client = {
        query: async () => {
          queried = true
          return { rows: [] }
        },
      }

      await expect(
        reconcileReadReplicaSchema(client, client, {
          deadline: Date.now() - 1,
        }),
      ).rejects.toThrow(
        'exceeded max duration before it could read the primary schema catalog',
      )
      expect(queried).toBe(false)
    },
  )
  it.concurrent(
    'releases the direct subscriber lock when primary catalog read fails',
    async () => {
      const calls: string[] = []
      const master = {
        query: async () => {
          throw new Error('primary catalog unavailable')
        },
      }
      const replica = {
        query: async (text: string) => {
          calls.push(text)
          if (text === 'SELECT pg_try_advisory_lock($1::bigint) AS locked')
            return { rows: [{ locked: true }] }
          if (text === 'SELECT pg_advisory_unlock($1::bigint)')
            return { rows: [{ unlocked: true }] }
          return { rows: [] }
        },
      }

      await expect(
        reconcileDirectReadReplicaSchema(master, replica, {
          maxDurationMs: 60_000,
        }),
      ).rejects.toThrow('primary catalog unavailable')
      expect(calls).toEqual([
        'SELECT pg_try_advisory_lock($1::bigint) AS locked',
        'SELECT pg_advisory_unlock($1::bigint)',
      ])
    },
  )
})
