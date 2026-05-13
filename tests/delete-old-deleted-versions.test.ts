import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ORG_ID_CRON_QUEUE,
  POSTGRES_URL,
  resetAndSeedAppData,
  resetAppData,
  STRIPE_CUSTOMER_ID_CRON_QUEUE,
} from './test-utils.ts'

const cleanupAppId = `com.deleted.versions.${randomUUID().slice(0, 8)}`

async function rollbackAndRelease(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  }
  finally {
    client.release()
  }
}

describe('delete_old_deleted_versions', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = new Pool({
      connectionString: POSTGRES_URL,
      max: 1,
      idleTimeoutMillis: 2000,
    })
    await resetAndSeedAppData(cleanupAppId, {
      orgId: ORG_ID_CRON_QUEUE,
      stripeCustomerId: STRIPE_CUSTOMER_ID_CRON_QUEUE,
    })
  })

  afterAll(async () => {
    await resetAppData(cleanupAppId)
    await pool.end()
  })

  it.concurrent('permanently deletes only versions soft-deleted for at least 90 days', async () => {
    const staleName = `stale-${randomUUID()}`
    const freshName = `fresh-${randomUUID()}`
    const activeName = `active-${randomUUID()}`
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query(
        `
        INSERT INTO public.app_versions (
          app_id,
          name,
          owner_org,
          deleted,
          deleted_at,
          storage_provider
        )
        VALUES
          ($1, $2, $5, true, pg_catalog.now() - INTERVAL '90 days 1 second', 'r2'),
          ($1, $3, $5, true, pg_catalog.now() - INTERVAL '89 days', 'r2'),
          ($1, $4, $5, false, pg_catalog.now() - INTERVAL '120 days', 'r2')
        `,
        [cleanupAppId, staleName, freshName, activeName, ORG_ID_CRON_QUEUE],
      )

      await client.query('SELECT public.delete_old_deleted_versions()')

      const remaining = await client.query<{ name: string }>(
        `
        SELECT name
        FROM public.app_versions
        WHERE app_id = $1
          AND name = ANY($2::varchar[])
        ORDER BY name
        `,
        [cleanupAppId, [staleName, freshName, activeName]],
      )

      expect(remaining.rows.map(row => row.name)).toEqual([activeName, freshName].sort())
    }
    finally {
      await rollbackAndRelease(client)
    }
  })

  it.concurrent('keeps the deleted-version cleanup cron task enabled daily', async () => {
    const result = await pool.query<{
      description: string
      enabled: boolean
      run_at_hour: number
      run_at_minute: number
      run_at_second: number
      target: string
      task_type: string
    }>(
      `
      SELECT
        description,
        enabled,
        run_at_hour,
        run_at_minute,
        run_at_second,
        target,
        task_type::text AS task_type
      FROM public.cron_tasks
      WHERE name = 'delete_old_versions'
      `,
    )

    expect(result.rows).toEqual([{
      description: 'Permanently delete app versions 90 days after soft delete',
      enabled: true,
      run_at_hour: 3,
      run_at_minute: 0,
      run_at_second: 0,
      target: 'public.delete_old_deleted_versions()',
      task_type: 'function',
    }])
  })
})
