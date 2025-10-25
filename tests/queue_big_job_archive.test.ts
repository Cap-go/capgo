import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BASE_URL, headersInternal, POSTGRES_URL } from './test-utils.ts'

const BASE_URL_TRIGGER = `${BASE_URL}/triggers`
const sql = postgres(POSTGRES_URL, { prepare: false, idle_timeout: 2 })
const tmpQueueName = 'queue_big_job_archive'
const MESSAGE_COUNT = 950

describe('queue_big_job_archive', () => {
    beforeAll(async () => {
        // Drop queue if it exists (ignore errors)
        try {
            await sql`SELECT pgmq.drop_queue(${tmpQueueName})`
        } catch (e) {
            // Ignore error if queue doesn't exist
        }

        // Create temporary queue
        await sql`SELECT pgmq.create(${tmpQueueName})`
    })

    beforeEach(async () => {
        // Clean up any existing messages before each test
        await sql.unsafe(`DELETE FROM pgmq.q_${tmpQueueName}`)
        await sql.unsafe(`DELETE FROM pgmq.a_${tmpQueueName}`)
    })

    afterAll(async () => {
        // Clean up temporary queue and tables
        await sql.unsafe(`DELETE FROM pgmq.q_${tmpQueueName}`)
        await sql.unsafe(`DELETE FROM pgmq.a_${tmpQueueName}`)
        await sql`SELECT pgmq.drop_queue(${tmpQueueName})`

        // Close postgres connection
        await sql.end()
    })

    it('should process 950 jobs with vt=10 successfully', async () => {
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
                sql.unsafe(
                    `INSERT INTO pgmq.q_${tmpQueueName} (message, vt, read_ct) VALUES ${values.join(', ')}`,
                    params,
                )
            )
        }

        await Promise.all(insertPromises)

        // Verify messages were added to queue
        const [{ count: initialCount }] = await sql.unsafe(`SELECT count(*) as count FROM pgmq.q_${tmpQueueName}`)
        expect(parseInt(initialCount)).toBe(MESSAGE_COUNT)

        // Process the queue via HTTP
        const response = await fetch(`${BASE_URL_TRIGGER}/queue_consumer/sync`, {
            method: 'POST',
            headers: headersInternal,
            body: JSON.stringify({ queue_name: tmpQueueName }),
        })

        if (response.status !== 202) {
            const errorBody = await response.text()
            console.error('Queue consumer error:', errorBody)
        }
        expect(response.status).toBe(202)
        expect(await response.json()).toEqual({ status: 'ok' })

        // Wait for processing to complete (give it some time)
        await new Promise(resolve => setTimeout(resolve, 5000))

        // Verify queue is empty after processing
        const [{ count: finalQueueCount }] = await sql.unsafe(`SELECT count(*) as count FROM pgmq.q_${tmpQueueName}`)
        expect(parseInt(finalQueueCount)).toBe(0)

        // Verify archive table is also empty
        const [{ count: archiveCount }] = await sql.unsafe(`SELECT count(*) as count FROM pgmq.a_${tmpQueueName}`)
        expect(parseInt(archiveCount)).toBe(MESSAGE_COUNT)
    })
})

