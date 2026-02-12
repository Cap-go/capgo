import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BASE_URL, headersInternal, POSTGRES_URL } from './test-utils.ts'

const BASE_URL_TRIGGER = `${BASE_URL}/triggers`
const pool = new Pool({
  connectionString: POSTGRES_URL,
  max: 1,
  idleTimeoutMillis: 2000,
})
const tmpQueueName = 'queue_big_job_archive'
const MESSAGE_COUNT = 950
const SYNC_BATCH_SIZE = 200

describe('queue_big_job_archive', () => {
  beforeAll(async () => {
    // Drop queue if it exists (ignore errors)
    try {
      await pool.query('SELECT pgmq.drop_queue($1)', [tmpQueueName])
    }
    catch {
      // Ignore error if queue doesn't exist
    }

    // Create temporary queue
    await pool.query('SELECT pgmq.create($1)', [tmpQueueName])
  })

  beforeEach(async () => {
    // Clean up any existing messages before each test
    await pool.query(`DELETE FROM pgmq.q_${tmpQueueName}`)
    await pool.query(`DELETE FROM pgmq.a_${tmpQueueName}`)
  })

  afterAll(async () => {
    // Clean up temporary queue and tables
    await pool.query(`DELETE FROM pgmq.q_${tmpQueueName}`)
    await pool.query(`DELETE FROM pgmq.a_${tmpQueueName}`)
    await pool.query('SELECT pgmq.drop_queue($1)', [tmpQueueName])

    // Close postgres connection
    await pool.end()
  })

  it('should process 950 jobs with vt=10 successfully', { timeout: 60000 }, async () => {
    // Generate messages and insert them directly into the queue table
    const messagePayload = {
      payload: {
        appId: '',
        orgId: '',
        todayOnly: false,
      },
      function_name: '',
      function_type: '',
    }

    // Insert messages with vt = 10 seconds from now
    // Using direct SQL to insert into pgmq table
    const vtTimestamp = new Date(Date.now() - 100 * 1000).toISOString()
    const messageJson = JSON.stringify(messagePayload)

    // Batch insert in chunks of 100 to avoid parameter limits
    const insertPromises = []
    const batchSize = 100 // Insert in batches of 100

    for (let i = 0; i < MESSAGE_COUNT; i += batchSize) {
      const values = []
      const params = []
      let paramIndex = 1

      for (let j = 0; j < batchSize && i + j < MESSAGE_COUNT; j++) {
        values.push(`($${paramIndex}::jsonb, $${paramIndex + 1}::timestamptz, 10)`)
        params.push(messageJson)
        params.push(vtTimestamp)
        paramIndex += 2
      }

      insertPromises.push(
        pool.query(
          `INSERT INTO pgmq.q_${tmpQueueName} (message, vt, read_ct) VALUES ${values.join(', ')}`,
          params,
        ),
      )
    }

    await Promise.all(insertPromises)

    // Verify messages were added to queue
    const result = await pool.query(`SELECT count(*) as count FROM pgmq.q_${tmpQueueName}`)
    const initialCount = result.rows[0].count
    expect(Number.parseInt(initialCount)).toBe(MESSAGE_COUNT)

    async function fetchSyncWithRetry(maxRetries = 5) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
          method: 'POST',
          headers: headersInternal,
          body: JSON.stringify({ queue_name: tmpQueueName, batch_size: SYNC_BATCH_SIZE }),
        })

        if (response.status === 202) {
          expect(await response.json()).toEqual({ status: 'ok' })
          return
        }

        const errorBody = await response.text()
        console.error('Queue consumer error:', errorBody)
        // Backoff for transient worker/resource-limit errors.
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
      }

      throw new Error(`queue_consumer/sync failed after retries (batch_size=${SYNC_BATCH_SIZE})`)
    }

    async function waitForQueueToDecrease(previousCount: number, timeoutMs = 20000) {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        const { rows } = await pool.query(`SELECT count(*) as count FROM pgmq.q_${tmpQueueName}`)
        const currentCount = Number.parseInt(rows[0].count)
        if (currentCount < previousCount)
          return currentCount
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      throw new Error(`Queue did not decrease within ${timeoutMs}ms (previousCount=${previousCount})`)
    }

    // Process the queue in smaller batches to avoid edge runtime resource limits.
    let remaining = MESSAGE_COUNT
    let safety = 0
    while (remaining > 0) {
      safety++
      if (safety > 20)
        throw new Error(`Safety break: too many sync iterations (remaining=${remaining})`)

      const prev = remaining
      await fetchSyncWithRetry()
      remaining = await waitForQueueToDecrease(prev)
    }

    // Verify queue is empty after processing
    const finalQueueResult = await pool.query(`SELECT count(*) as count FROM pgmq.q_${tmpQueueName}`)
    const finalQueueCount = finalQueueResult.rows[0].count
    expect(Number.parseInt(finalQueueCount)).toBe(0)

    // Verify archive table is also empty
    const archiveResult = await pool.query(`SELECT count(*) as count FROM pgmq.a_${tmpQueueName}`)
    const archiveCount = archiveResult.rows[0].count
    expect(Number.parseInt(archiveCount)).toBe(MESSAGE_COUNT)
  })
})
