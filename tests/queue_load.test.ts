import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, headersInternal, ORG_ID, POSTGRES_URL } from './test-utils.ts'

const BASE_URL_TRIGGER = `${BASE_URL}/triggers`
const id = randomUUID()
const TEST_APP_ID = `com.loadapp.${id}`
const sql = postgres(POSTGRES_URL, { prepare: false, idle_timeout: 2 })
const queueName = 'test_queue_consumer'
const functionName = 'ok'
const functionType = ''

beforeAll(async () => {
  // Clean up any existing messages in the test queue
  await sql.unsafe(`DELETE FROM pgmq.q_${queueName}`)
  await sql.unsafe(`DELETE FROM pgmq.a_${queueName}`)
})
describe('queue Load Test', () => {
  afterAll(async () => {
    // Close postgres connection
    await sql.end()
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
        function_name: functionName,
        function_type: functionType,
        payload: {
          fake_data: `test_${i}`,
          app_id: TEST_APP_ID,
          org_id: ORG_ID,
          timestamp: new Date().toISOString(),
        },
      }

      // Use postgres client to call pgmq.send directly
      await sql`SELECT pgmq.send(${queueName}, ${sql.json(fakeMessage)})`
    }

    // Verify messages were added to queue
    const [{ count: initialCount }] = await sql.unsafe(`SELECT count(*) as count FROM pgmq.q_${queueName}`)
    expect(initialCount).toBe('10')

    // Process the queue
    const response = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
      method: 'POST',
      headers: headersInternal,
      body: JSON.stringify({ queue_name: queueName }),
    })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'ok' })

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify queue is empty after processing
    const [{ count: finalCount }] = await sql.unsafe(`SELECT count(*) as count FROM pgmq.q_${queueName}`)
    expect(finalCount).toBe('0')
  })

  // it('should handle load testing with multiple concurrent requests', async () => {
  //   // Add many fake messages directly to queue using pgmq.send
  //   for (let i = 0; i < 1000; i++) {
  //     const fakeMessage = {
  //       function_name: functionName,
  //       function_type: functionType,
  //       payload: {
  //         fake_data: `load_test_${i}`,
  //         app_id: TEST_APP_ID,
  //         org_id: ORG_ID,
  //         timestamp: new Date().toISOString(),
  //       },
  //     }

  //     await sql`SELECT pgmq.send(${queueName}, ${sql.json(fakeMessage)})`
  //   }

  //   // Verify messages were added
  //   const [{ count: initialCount }] = await sql.unsafe(`SELECT count(*) as count FROM pgmq.q_${queueName}`)
  //   expect(initialCount).toBe('1000')

  //   // Send 50 concurrent requests to test load handling
  //   const concurrentRequests = []
  //   for (let i = 0; i < 50; i++) {
  //     concurrentRequests.push(
  //       fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
  //         method: 'POST',
  //         headers: headersInternal,
  //         body: JSON.stringify({ queue_name: queueName }),
  //       }),
  //     )
  //   }

  //   const responses = await Promise.all(concurrentRequests)

  //   // All requests should be accepted
  //   responses.forEach((response) => {
  //     expect(response.status).toBe(202)
  //   })

  //   // Verify response texts
  //   const responseTexts = await Promise.all(responses.map(r => r.text()))
  //   responseTexts.forEach((text) => {
  //     expect(text).toBe('Queue read scheduled')
  //   })

  //   // Wait for processing to complete
  //   await new Promise(resolve => setTimeout(resolve, 10000))

  //   // Verify queue is empty after processing
  //   const [{ count: finalCount }] = await sql.unsafe(`SELECT count(*) as count FROM pgmq.q_${queueName}`)
  //   expect(finalCount).toBe('0')
  // })

  // it('should handle queue processing with app version triggers', async () => {
  //   // Create test version to trigger queue operations
  //   const { data: versionData, error: versionError } = await getSupabaseClient()
  //     .from('app_versions')
  //     .insert({
  //       app_id: TEST_APP_ID,
  //       name: '1.0.0',
  //       owner_org: ORG_ID,
  //     })
  //     .select('id')
  //     .single()

  //   if (versionError)
  //     throw versionError

  //   // Wait a moment for any triggers to fire
  //   await new Promise(resolve => setTimeout(resolve, 1000))

  //   // Process the version delete queue
  //   const processResponse = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
  //     method: 'POST',
  //     headers: headersInternal,
  //     body: JSON.stringify({ queue_name: queueName }),
  //   })

  //   expect(processResponse.status).toBe(202)

  //   // Update the version to trigger update queue
  //   await getSupabaseClient()
  //     .from('app_versions')
  //     .update({ name: '1.0.1' })
  //     .eq('id', versionData.id)

  //   // Wait a moment for triggers
  //   await new Promise(resolve => setTimeout(resolve, 1000))

  //   // Process the version update queue
  //   const updateProcessResponse = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
  //     method: 'POST',
  //     headers: headersInternal,
  //     body: JSON.stringify({ queue_name: 'on_version_update' }),
  //   })

  //   expect(updateProcessResponse.status).toBe(202)

  //   // Delete the version to trigger delete queue
  //   await getSupabaseClient()
  //     .from('app_versions')
  //     .delete()
  //     .eq('id', versionData.id)

  //   // Wait a moment for triggers
  //   await new Promise(resolve => setTimeout(resolve, 1000))

  //   // Process the version delete queue again
  //   const deleteProcessResponse = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
  //     method: 'POST',
  //     headers: headersInternal,
  //     body: JSON.stringify({ queue_name: queueName }),
  //   })

  //   expect(deleteProcessResponse.status).toBe(202)
  // })

  // it('should handle stress test with rapid queue processing', async () => {
  //   // Rapid fire queue processing requests
  //   const rapidRequests = []
  //   for (let i = 0; i < 20; i++) {
  //     rapidRequests.push(
  //       fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
  //         method: 'POST',
  //         headers: headersInternal,
  //         body: JSON.stringify({ queue_name: 'cron_stats' }),
  //       }),
  //     )

  //     // Small delay between requests to simulate real-world usage
  //     if (i % 5 === 0) {
  //       await new Promise(resolve => setTimeout(resolve, 100))
  //     }
  //   }

  //   const responses = await Promise.all(rapidRequests)

  //   // All requests should be handled successfully
  //   responses.forEach((response) => {
  //     expect(response.status).toBe(202)
  //   })
  // })
})
