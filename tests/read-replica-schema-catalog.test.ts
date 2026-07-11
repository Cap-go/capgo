import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { readReplicaSchemaCatalog } from '../read_replicate/schema_catalog.ts'
import { cleanupPostgresClient, getPostgresClient } from './test-utils.ts'

interface CatalogIndex {
  table: string
  name: string
  constraintOwned: boolean
}

afterAll(async () => {
  await cleanupPostgresClient()
})

describe('read-replica schema catalog', () => {
  it('does not duplicate selected indexes for foreign keys from non-selected tables', async () => {
    const tableName = `rr_schema_catalog_fk_${randomUUID().replaceAll('-', '')}`
    const pool = await getPostgresClient()

    try {
      await pool.query(`
        CREATE TABLE public.${tableName} (
          app_id character varying NOT NULL REFERENCES public.apps(app_id)
        )
      `)

      const catalog = await readReplicaSchemaCatalog(pool) as { indexes: CatalogIndex[] }
      const appsPrimaryKey = catalog.indexes.filter(index => index.table === 'apps' && index.name === 'apps_pkey')

      expect(appsPrimaryKey).toHaveLength(1)
      expect(appsPrimaryKey[0]).toMatchObject({
        table: 'apps',
        name: 'apps_pkey',
        constraintOwned: true,
      })
    }
    finally {
      await pool.query(`DROP TABLE IF EXISTS public.${tableName}`)
    }
  })
})
