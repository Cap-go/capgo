import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  executeSQL,
  ORG_ID_CRON_QUEUE,
  resetAndSeedAppData,
  resetAndSeedAppDataStats,
  resetAppData,
  resetAppDataStats,
  STRIPE_CUSTOMER_ID_CRON_QUEUE,
} from './test-utils.ts'

const processCronAppId = `com.cron.queue.${randomUUID().slice(0, 8)}`

async function clearCronStatAppMessages(appId: string) {
  await executeSQL(`DELETE FROM pgmq.q_cron_stat_app WHERE message->'payload'->>'appId' = $1`, [appId])
}

async function getCronStatAppMessages(appId: string) {
  return executeSQL(
    `SELECT message FROM pgmq.q_cron_stat_app WHERE message->'payload'->>'appId' = $1 ORDER BY msg_id DESC`,
    [appId],
  )
}

describe('cron_stat_app queue resilience', () => {
  beforeAll(async () => {
    await resetAndSeedAppData(processCronAppId, {
      orgId: ORG_ID_CRON_QUEUE,
      stripeCustomerId: STRIPE_CUSTOMER_ID_CRON_QUEUE,
    })
    await resetAndSeedAppDataStats(processCronAppId)
  })

  afterAll(async () => {
    await clearCronStatAppMessages(processCronAppId)
    await resetAppData(processCronAppId)
    await resetAppDataStats(processCronAppId)
  })

  it.concurrent('process_cron_stats_jobs still queues active apps when first-seen MAU leaves daily_mau quiet', async () => {
    await clearCronStatAppMessages(processCronAppId)

    // MAU is now recorded on the device's first day in the billing window, so
    // an active app may legitimately have no fresh daily_mau rows anymore.
    await executeSQL(`DELETE FROM public.daily_mau WHERE app_id = $1`, [processCronAppId])
    await executeSQL(
      `UPDATE public.app_versions SET created_at = NOW() - INTERVAL '45 days' WHERE app_id = $1`,
      [processCronAppId],
    )

    await executeSQL(
      `INSERT INTO public.device_usage (device_id, app_id, timestamp, org_id) VALUES ($1, $2, NOW() - INTERVAL '10 minutes', $3)`,
      [randomUUID(), processCronAppId, ORG_ID_CRON_QUEUE],
    )
    await executeSQL(
      `INSERT INTO public.bandwidth_usage (device_id, app_id, file_size, timestamp) VALUES ($1, $2, $3, NOW() - INTERVAL '10 minutes')`,
      [randomUUID(), processCronAppId, 4096],
    )

    await executeSQL(`SELECT public.process_cron_stats_jobs()`)

    const queuedMessages = await getCronStatAppMessages(processCronAppId)
    expect(queuedMessages).toHaveLength(1)
    expect(queuedMessages[0]?.message?.payload?.appId).toBe(processCronAppId)
    expect(queuedMessages[0]?.message?.payload?.orgId).toBe(ORG_ID_CRON_QUEUE)
    expect(queuedMessages[0]?.message?.payload?.todayOnly).toBe(false)
  })

  it.concurrent('live /stats traffic does not enqueue cron_stat_app directly', async () => {
    await clearCronStatAppMessages(liveQueueAppId)

    const versionName = '1.0.0'
    await createAppVersions(versionName, liveQueueAppId)

    const baseData = getBaseData(liveQueueAppId)
    const payload = {
      ...baseData,
      action: 'set',
      device_id: randomUUID().toLowerCase(),
      version_build: versionName,
      version_name: versionName,
    }

    const firstResponse = await fetch(getEndpointUrl('/stats'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    expect(firstResponse.status).toBe(200)

    const secondResponse = await fetch(getEndpointUrl('/stats'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        device_id: randomUUID().toLowerCase(),
      }),
    })
    expect(secondResponse.status).toBe(200)

    const queuedMessages = await getCronStatAppMessages(liveQueueAppId)
    expect(queuedMessages).toHaveLength(0)
  })
})
