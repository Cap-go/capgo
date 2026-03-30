import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  BASE_URL,
  getSupabaseClient,
  headersInternal,
  POSTGRES_URL,
  TEST_EMAIL,
  USER_ID,
} from './test-utils.ts'

const BASE_URL_TRIGGER = `${BASE_URL}/triggers`
const pool = new Pool({
  connectionString: POSTGRES_URL,
  max: 1,
  idleTimeoutMillis: 2000,
})

const WEBHOOK_QUEUE_TEST_ORG_ID = randomUUID()
const webhookName = `Webhook Queue Test ${randomUUID()}`
const customerId = `cus_webhook_queue_${randomUUID().replace(/-/g, '').slice(0, 20)}`

let createdWebhookId: string | null = null

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
        return
      }

      lastError = new Error(`queue_consumer/sync returned HTTP ${response.status} for ${queueName}`)
    }
    catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === maxRetries - 1) {
        throw new Error(`queue_consumer/sync network failure for ${queueName}: ${lastError.message}`)
      }
    }

    if (attempt < maxRetries - 1)
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
  }

  if (lastError) {
    throw new Error(`queue_consumer/sync failed for ${queueName}: ${lastError.message}`)
  }

  throw new Error(`queue_consumer/sync failed for ${queueName}`)
}

async function waitForDeliveryRecord(webhookId: string, timeoutMs = 10000) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const { data, error } = await (getSupabaseClient() as any)
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error)
      throw error

    if (data?.[0])
      return data[0]

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for delivery record for webhook ${webhookId}`)
}

async function waitForWebhookDeliveryQueueMessage(deliveryId: string, timeoutMs = 10000) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const { rows } = await pool.query(
      `SELECT count(*) AS count
       FROM pgmq.q_webhook_delivery
       WHERE message->'payload'->>'delivery_id' = $1`,
      [deliveryId],
    )

    if (Number(rows[0]?.count ?? 0) > 0)
      return

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for webhook_delivery queue message for delivery ${deliveryId}`)
}

async function waitForDeliveryCompletion(deliveryId: string, timeoutMs = 15000) {
  const start = Date.now()
  let lastState: Record<string, unknown> | null = null

  while (Date.now() - start < timeoutMs) {
    const { data, error } = await (getSupabaseClient() as any)
      .from('webhook_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single()

    if (error)
      throw error

    lastState = data

    if (data?.status && data.status !== 'pending')
      return data

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for delivery ${deliveryId} to complete: ${JSON.stringify(lastState)}`)
}

describe('webhook queue processing', () => {
  beforeAll(async () => {
    const { error: stripeError } = await getSupabaseClient().from('stripe_info').insert({
      customer_id: customerId,
      status: 'succeeded',
      product_id: 'prod_LQIregjtNduh4q',
      subscription_id: `sub_${randomUUID()}`,
      trial_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_good_plan: true,
    })
    if (stripeError)
      throw stripeError

    const { error: orgError } = await getSupabaseClient().from('orgs').insert({
      id: WEBHOOK_QUEUE_TEST_ORG_ID,
      name: webhookName,
      management_email: TEST_EMAIL,
      created_by: USER_ID,
      customer_id: customerId,
    })
    if (orgError)
      throw orgError

    const { data: webhook, error: webhookError } = await (getSupabaseClient() as any)
      .from('webhooks')
      .insert({
        org_id: WEBHOOK_QUEUE_TEST_ORG_ID,
        name: webhookName,
        url: 'https://example.com/webhook',
        events: ['apps'],
        enabled: true,
        created_by: USER_ID,
      })
      .select()
      .single()

    if (webhookError)
      throw webhookError

    createdWebhookId = webhook.id
  })

  afterAll(async () => {
    if (createdWebhookId) {
      await (getSupabaseClient() as any).from('webhook_deliveries').delete().eq('webhook_id', createdWebhookId)
      await (getSupabaseClient() as any).from('webhooks').delete().eq('id', createdWebhookId)
    }

    await getSupabaseClient().from('orgs').delete().eq('id', WEBHOOK_QUEUE_TEST_ORG_ID)
    await getSupabaseClient().from('stripe_info').delete().eq('customer_id', customerId)
    await pool.end()
  })

  it('dispatches and delivers webhook queue messages end to end', { timeout: 30000 }, async () => {
    if (!createdWebhookId)
      throw new Error('Webhook was not created in setup')

    const queueMessage = {
      function_name: 'webhook_dispatcher',
      function_type: 'cloudflare',
      payload: {
        audit_log_id: 999999,
        table_name: 'apps',
        operation: 'UPDATE',
        org_id: WEBHOOK_QUEUE_TEST_ORG_ID,
        record_id: `app_${randomUUID()}`,
        old_record: { name: 'Before' },
        new_record: { name: 'After' },
        changed_fields: ['name'],
        user_id: USER_ID,
        created_at: new Date().toISOString(),
      },
    }

    await pool.query('SELECT pgmq.send($1, $2::jsonb)', ['webhook_dispatcher', JSON.stringify(queueMessage)])

    await fetchQueueSync('webhook_dispatcher')
    const createdDelivery = await waitForDeliveryRecord(createdWebhookId)

    expect(createdDelivery.event_type).toBe('apps.UPDATE')
    expect(createdDelivery.status).toBe('pending')

    await waitForWebhookDeliveryQueueMessage(createdDelivery.id)
    await fetchQueueSync('webhook_delivery')
    const completedDelivery = await waitForDeliveryCompletion(createdDelivery.id)

    expect(completedDelivery.status).toBe('failed')
    expect(completedDelivery.attempt_count).toBe(1)
    expect(completedDelivery.response_body).toBeTruthy()
  })
})
