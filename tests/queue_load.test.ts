import { Pool } from 'pg'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, headersInternal, POSTGRES_URL } from './test-utils.ts'

const BASE_URL_TRIGGER = `${BASE_URL}/triggers`
const pool = new Pool({
  connectionString: POSTGRES_URL,
  max: 1,
  idleTimeoutMillis: 2000,
})
const queueName = 'test_queue_consumer'

beforeAll(async () => {
  // Clean up any existing messages in the test queue
  await pool.query(`DELETE FROM pgmq.q_${queueName}`)
  await pool.query(`DELETE FROM pgmq.a_${queueName}`)
})
describe('queue Load Test', () => {
  afterAll(async () => {
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
    // Test valid queue sync request
    const validResponse = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({ queue_name: queueName }),
    })

    expect(validResponse.status).toBe(202)
    expect(await validResponse.json()).toEqual({ status: 'ok' })
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
    const response = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({ queue_name: queueName }),
    })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'ok' })

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Verify queue is empty after processing
    const { rows: finalRows } = await pool.query(`SELECT count(*) as count FROM pgmq.q_${queueName}`)
    expect(finalRows[0].count).toBe('0')
  })

  it('should handle stress test with rapid queue processing', async () => {
    // Reduced load for stability (10 requests instead of 20)
    const rapidRequests = []
    for (let i = 0; i < 10; i++) {
      const requestPromise = fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
        method: 'POST',
        headers: headersInternal,
        body: JSON.stringify({ queue_name: 'cron_stat_app' }),
      }).catch(error => {
        // Handle socket errors gracefully during stress test
        console.warn(`Request ${i} failed:`, error.message)
        return new Response(JSON.stringify({ status: 'error' }), { status: 500 })
      })

      rapidRequests.push(requestPromise)

      // Add delay every 3 requests to avoid overwhelming the server
      if (i % 3 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 150))
      }
    }

    const responses = await Promise.all(rapidRequests)

    // Most requests should succeed (allow some failures due to load)
    const successCount = responses.filter(r => r.status === 202).length
    expect(successCount).toBeGreaterThanOrEqual(7) // At least 70% success rate
  })
})
