import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupPostgresClient, executeSQL, getPostgresClient } from './test-utils.ts'

const indexName = 'r2_objects_expired_manifest_leases_idx'

afterAll(cleanupPostgresClient)

describe('r2 manifest lease schema preparation', () => {
  it.concurrent('keeps the lease nullable with no default and retains the four lifecycle states', async () => {
    const columns = await executeSQL(`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'r2_objects'
        AND column_name = 'manifest_lease_expires_at'
    `)
    expect(columns).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null }])

    const states = await executeSQL(`
      SELECT enumlabel FROM pg_catalog.pg_enum
      WHERE enumtypid = 'public.r2_object_state'::regtype ORDER BY enumsortorder
    `)
    expect(states.map(row => row.enumlabel)).toEqual(['to_be_uploaded', 'present', 'to_be_deleted', 'deleted'])
  })

  it.concurrent('allows old writers to omit the lease and round-trips an explicit expiry or null', async () => {
    const client = await (await getPostgresClient()).connect()
    try {
      await client.query('BEGIN')
      const identity = [`lease-schema-${randomUUID()}`, 'synthetic/file.txt']
      const inserted = await client.query(`
        INSERT INTO public.r2_objects (bucket_name, r2_key, r2_state)
        VALUES ($1, $2, 'to_be_uploaded') RETURNING manifest_lease_expires_at, r2_state
      `, identity)
      expect(inserted.rows[0]).toEqual({ manifest_lease_expires_at: null, r2_state: 'to_be_uploaded' })

      const expiry = '2030-01-01T12:30:00.000Z'
      const leased = await client.query(`
        UPDATE public.r2_objects SET manifest_lease_expires_at = $3
        WHERE bucket_name = $1 AND r2_key = $2 RETURNING manifest_lease_expires_at, r2_state
      `, [...identity, expiry])
      expect(leased.rows[0].manifest_lease_expires_at.toISOString()).toBe(expiry)
      expect(leased.rows[0].r2_state).toBe('to_be_uploaded')

      const cleared = await client.query(`
        UPDATE public.r2_objects SET manifest_lease_expires_at = NULL
        WHERE bucket_name = $1 AND r2_key = $2 RETURNING manifest_lease_expires_at
      `, identity)
      expect(cleared.rows[0].manifest_lease_expires_at).toBeNull()
    }
    finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  it.concurrent('has a valid partial index applicable to a bounded bucket expiry query', async () => {
    const indexes = await executeSQL(`
      SELECT pg_catalog.pg_get_indexdef(indexrelid) AS definition, indisvalid, indisready
      FROM pg_catalog.pg_index
      WHERE indexrelid = 'public.${indexName}'::regclass
    `)
    expect(indexes).toHaveLength(1)
    expect(indexes[0]).toMatchObject({ indisvalid: true, indisready: true })
    expect(indexes[0].definition).toContain('(bucket_name, manifest_lease_expires_at, r2_key)')
    expect(indexes[0].definition).toContain('r2_state = \'to_be_uploaded\'::r2_object_state')
    expect(indexes[0].definition).toContain('manifest_lease_expires_at IS NOT NULL')

    const client = await (await getPostgresClient()).connect()
    try {
      await client.query('BEGIN')
      // Prove applicability even when an empty test table makes a scan cheaper.
      await client.query('SET LOCAL enable_seqscan = off')
      const explained = await client.query(`
        EXPLAIN (FORMAT JSON, COSTS OFF)
        SELECT bucket_name, r2_key, manifest_lease_expires_at FROM public.r2_objects
        WHERE bucket_name = $1 AND r2_state = 'to_be_uploaded'
          AND manifest_lease_expires_at IS NOT NULL AND manifest_lease_expires_at <= now()
        ORDER BY manifest_lease_expires_at, r2_key LIMIT 10
      `, [`lease-plan-${randomUUID()}`])
      const plan = explained.rows[0]['QUERY PLAN'][0].Plan
      expect(plan['Node Type']).toBe('Limit')
      expect(plan.Plans[0]['Index Name']).toBe(indexName)
      expect(plan.Plans[0]['Index Cond']).toContain('manifest_lease_expires_at <= now()')
    }
    finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })
})
