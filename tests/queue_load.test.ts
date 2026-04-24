import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BASE_URL, headersInternal, POSTGRES_URL } from './test-utils.ts'

const BASE_URL_TRIGGER = `${BASE_URL}/triggers`
const pool = new Pool({
  connectionString: POSTGRES_URL,
  max: 1,
  idleTimeoutMillis: 2000,
})
const queueName = `queue_load_${randomUUID().replace(/-/g, '').slice(0, 12)}`

beforeAll(async () => {
  await pool.query('SELECT pgmq.create($1)', [queueName])
  await pool.query(`DELETE FROM pgmq.q_${queueName}`)
  await pool.query(`DELETE FROM pgmq.a_${queueName}`)
})

beforeEach(async () => {
  await pool.query(`DELETE FROM pgmq.q_${queueName}`)
  await pool.query(`DELETE FROM pgmq.a_${queueName}`)
})

async function fetchQueueSync(queueName: string, maxRetries = 4) {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({ queue_name: queueName }),
      })

      if (response.status === 202) {
        expect(await response.json()).toEqual({ status: 'ok' })
        return response
      }

      lastError = new Error(`queue_consumer/sync returned HTTP ${response.status} for ${queueName}`)
    }
    catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }

    if (attempt < maxRetries - 1)
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
  }

  if (lastError)
    throw new Error(`queue_consumer/sync failed for ${queueName}: ${lastError.message}`)

  throw new Error(`queue_consumer/sync failed for ${queueName}`)
}

describe('queue Load Test', () => {
  afterAll(async () => {
    await pool.query(`DELETE FROM pgmq.q_${queueName}`)
    await pool.query(`DELETE FROM pgmq.a_${queueName}`)
    await pool.query('SELECT pgmq.drop_queue($1)', [queueName])
    // Close postgres connection
    await pool.end()
  })
  it('should handle queue consumer health check', async () => {
    const healthResponse = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/health`, {
      headers: headersInternal,
    })

    expect(healthResponse.status).toBe(200)
    expect(await healthResponse.text()).toBe('OK')
  })

  it('should process queue sync requests correctly', async () => {
    await fetchQueueSync(queueName)
  })

  it('should reject invalid queue sync requests', async () => {
    // Test missing queue_name
    const invalidResponse1 = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({}),
    })

    expect(invalidResponse1.status).toBe(400)
    const json = await invalidResponse1.json<{ error: string }>()
    expect(json.error).toEqual('missing_or_invalid_queue_name')

    // Test invalid JSON
    const invalidResponse2 = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
      method: 'POST',
      headers: headersInternal,
      body: 'invalid json',
    })

    expect(invalidResponse2.status).toBe(400)
    const json2 = await invalidResponse2.json<{ error: string }>()
    expect(json2.error).toEqual('invalid_json_parse_body')

    // Test invalid queue_name type
    const invalidResponse3 = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({ queue_name: 123 }),
    })

    expect(invalidResponse3.status).toBe(400)
    const json3 = await invalidResponse3.json<{ error: string }>()
    expect(json3.error).toEqual('missing_or_invalid_queue_name')
  })

  it('should handle multiple queue messages simultaneously', async () => {
    // Add fake messages directly to test queue using pgmq.send
    for (let i = 0; i < 10; i++) {
      const fakeMessage = {
        function_name: 'ok',
        function_type: '',
        payload: {
          fake_data: `test_${i}`,
          timestamp: new Date().toISOString(),
        },
      }

      // Use pg Pool to call pgmq.send directly
      await pool.query(`SELECT pgmq.send($1, $2::jsonb)`, [queueName, JSON.stringify(fakeMessage)])
    }

    // Verify messages were added to queue
    const { rows: initialRows } = await pool.query(`SELECT count(*) as count FROM pgmq.q_${queueName}`)
    expect(initialRows[0].count).toBe('10')

    // Process the queue
    await fetchQueueSync(queueName)

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Verify queue is empty after processing
    const { rows: finalRows } = await pool.query(`SELECT count(*) as count FROM pgmq.q_${queueName}`)
    expect(finalRows[0].count).toBe('0')
  })

  it('should handle stress test with rapid queue processing', { timeout: 30000 }, async () => {
    // Keep the burst modest so the assertion measures queue_consumer behavior
    // instead of GitHub runner resource spikes from unrelated parallel files.
    await Promise.all([
      fetchQueueSync(queueName, 6),
      fetchQueueSync(queueName, 6),
      fetchQueueSync(queueName, 6),
      fetchQueueSync(queueName, 6),
    ])
  })
})
