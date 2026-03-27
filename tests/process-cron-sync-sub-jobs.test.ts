import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupPostgresClient, executeSQL, ORG_ID_CRON_QUEUE } from './test-utils.ts'

async function clearCronSyncSubMessages(orgId: string) {
  await executeSQL(
    `DELETE FROM pgmq.q_cron_sync_sub
      WHERE COALESCE(message->'payload'->>'orgId', message->>'orgId') = $1`,
    [orgId],
  )
}

async function getCronSyncSubMessages(orgId: string) {
  return executeSQL(
    `SELECT message
      FROM pgmq.q_cron_sync_sub
      WHERE COALESCE(message->'payload'->>'orgId', message->>'orgId') = $1
      ORDER BY msg_id DESC`,
    [orgId],
  )
}

describe('process_cron_sync_sub_jobs', () => {
  beforeEach(async () => {
    await clearCronSyncSubMessages(ORG_ID_CRON_QUEUE)
  })

  afterAll(async () => {
    await clearCronSyncSubMessages(ORG_ID_CRON_QUEUE)
    await cleanupPostgresClient()
  })

  it('queues cron_sync_sub with the standard payload envelope', async () => {
    const [orgRow] = await executeSQL(
      `SELECT o.id, si.customer_id
        FROM public.orgs AS o
        INNER JOIN public.stripe_info AS si ON o.customer_id = si.customer_id
        WHERE o.id = $1`,
      [ORG_ID_CRON_QUEUE],
    )

    expect(orgRow?.id).toBe(ORG_ID_CRON_QUEUE)
    expect(orgRow?.customer_id).toBeTruthy()

    await executeSQL('SELECT public.process_cron_sync_sub_jobs()')

    const queuedMessages = await getCronSyncSubMessages(ORG_ID_CRON_QUEUE)
    expect(queuedMessages).toHaveLength(1)
    expect(queuedMessages[0]?.message).toMatchObject({
      function_name: 'cron_sync_sub',
      function_type: 'cloudflare',
      payload: {
        orgId: ORG_ID_CRON_QUEUE,
        customerId: orgRow?.customer_id,
      },
    })
    expect(queuedMessages[0]?.message?.orgId).toBeUndefined()
  })
})
