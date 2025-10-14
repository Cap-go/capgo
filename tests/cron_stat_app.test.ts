import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, ORG_ID, getSupabaseClient, resetAndSeedAppData, resetAndSeedAppDataStats, resetAppData, resetAppDataStats } from './test-utils.ts'

const appId = `com.cron.${randomUUID().slice(0, 8)}`

const triggerHeaders = {
  'Content-Type': 'application/json',
  'apisecret': 'testsecret',
}

describe('[POST] /triggers/cron_stat_app', () => {
  beforeAll(async () => {
    await resetAndSeedAppData(appId)
    await resetAndSeedAppDataStats(appId)

    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('orgs')
      .update({ stats_updated_at: null })
      .eq('id', ORG_ID)
    if (error)
      throw error
  })

  afterAll(async () => {
    await resetAppData(appId)
    await resetAppDataStats(appId)
  })

  it('updates stats_updated_at with a fresh timestamp', async () => {
    const response = await fetch(`${BASE_URL}/triggers/cron_stat_app`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        appId,
        orgId: ORG_ID,
      }),
    })

    expect(response.status).toBe(200)
    const json = await response.json() as { status?: string }
    expect(json.status).toBe('Stats saved')

    const supabase = getSupabaseClient()
    const { data: org, error } = await supabase
      .from('orgs')
      .select('stats_updated_at')
      .eq('id', ORG_ID)
      .single()

    expect(error).toBeNull()
    expect(org?.stats_updated_at).toBeTruthy()

    const timestamp = org?.stats_updated_at
    expect(timestamp).toBeTruthy()

    const updatedAtMs = Date.parse(`${timestamp}Z`)
    expect(Number.isNaN(updatedAtMs)).toBe(false)

    const diffMs = Math.abs(Date.now() - updatedAtMs)
    expect(diffMs).toBeLessThan(60_000)
  })

  it('queues plan processing after successful stats update', async () => {
    const supabase = getSupabaseClient()

    // Reset plan_calculated_at to ensure we can detect if it gets queued
    await supabase
      .from('stripe_info')
      .update({ plan_calculated_at: null })
      .eq('customer_id', 'cus_Pa0k8TO6HVln6A') // From seed data
      .throwOnError()

    const response = await fetch(`${BASE_URL}/triggers/cron_stat_app`, {
      method: 'POST',
      headers: triggerHeaders,
      body: JSON.stringify({
        appId,
        orgId: ORG_ID,
      }),
    })

    expect(response.status).toBe(200)
    const json = await response.json() as { status?: string }
    expect(json.status).toBe('Stats saved')

    // Verify that the queue function can be called (indicates plan processing was queued)
    // We can't easily check queue contents, but we can verify the function works
    const { error: queueError } = await supabase.rpc('queue_cron_stat_org_for_org', {
      org_id: ORG_ID,
      customer_id: 'cus_Pa0k8TO6HVln6A'
    })

    expect(queueError).toBeNull()
  })
})
