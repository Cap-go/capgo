import type { Pool, PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { Pool as PgPool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POSTGRES_URL } from './test-utils.ts'

async function rollbackAndRelease(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  }
  finally {
    client.release()
  }
}

describe('cron healthchecks', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new PgPool({
      connectionString: POSTGRES_URL,
      max: 2,
      idleTimeoutMillis: 2000,
    })
  })

  afterAll(async () => {
    await pool.end()
  })

  it.concurrent('stores any healthcheck URL on cron tasks', async () => {
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      const taskName = `test_healthcheck_url_${randomUUID()}`

      const result = await client.query<{ healthcheck_url: string }>(
        `
        INSERT INTO public.cron_tasks (
          name,
          description,
          task_type,
          target,
          second_interval,
          healthcheck_url,
          enabled
        )
        VALUES (
          $1,
          'Healthcheck URL test',
          'function'::public.cron_task_type,
          'pg_catalog.pg_sleep(0)',
          10,
          'https://example.com/healthcheck',
          true
        )
        RETURNING healthcheck_url
        `,
        [taskName],
      )

      expect(result.rows).toEqual([{ healthcheck_url: 'https://example.com/healthcheck' }])
    }
    finally {
      await rollbackAndRelease(client)
    }
  })
})
