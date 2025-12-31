import type { Database } from '../src/types/supabase.types'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ORG_ID, POSTGRES_URL } from './test-utils'

const supabaseUrl = env.SUPABASE_URL as string
const supabaseServiceKey = env.SUPABASE_SERVICE_KEY as string
const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)

// Helper to retry RPC calls that may fail due to transient network issues in CI
async function retryRpc<T>(
  fn: () => PromiseLike<{ data: T | null, error: any }>,
  maxRetries = 3,
): Promise<{ data: T | null, error: any }> {
  let lastResult: { data: T | null, error: any } = { data: null, error: null }
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    lastResult = await fn()
    if (!lastResult.error || !lastResult.error.message?.includes('fetch failed')) {
      return lastResult
    }
    // Wait before retry with exponential backoff
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
  }
  return lastResult
}

describe('overage Tracking - Duplicate Prevention', () => {
  let pgPool: Pool

  beforeAll(async () => {
    pgPool = new Pool({ connectionString: POSTGRES_URL })

    // Clean up any existing overage events for our test org
    await pgPool.query('DELETE FROM usage_overage_events WHERE org_id = $1', [ORG_ID])
    await pgPool.query('DELETE FROM usage_credit_transactions WHERE org_id = $1', [ORG_ID])
    await pgPool.query('DELETE FROM usage_credit_consumptions WHERE org_id = $1', [ORG_ID])
    await pgPool.query('DELETE FROM usage_credit_grants WHERE org_id = $1', [ORG_ID])
  })

  afterAll(async () => {
    await pgPool.end()
  })

  it('should not create duplicate overage records when called multiple times with same values', async () => {
    const testMetric = 'bandwidth' as const
    const overageAmount = 163066288 // Same value from the CSV data
    const billingStart = new Date('2025-10-07')
    const billingEnd = new Date('2025-11-07')
    const details = { limit: 53687091200, usage: 53850157488 }

    // Call apply_usage_overage 5 times with identical parameters
    for (let i = 0; i < 5; i++) {
      const { data, error } = await retryRpc(() => supabase.rpc('apply_usage_overage', {
        p_org_id: ORG_ID,
        p_metric: testMetric,
        p_overage_amount: overageAmount,
        p_billing_cycle_start: billingStart.toISOString(),
        p_billing_cycle_end: billingEnd.toISOString(),
        p_details: details,
      }))

      expect(error).toBeNull()
      expect(data).toBeDefined()
    }

    // Count how many records were created
    const result = await pgPool.query(
      `SELECT COUNT(*) as count FROM usage_overage_events
       WHERE org_id = $1 AND metric = $2
         AND billing_cycle_start = $3::date
         AND billing_cycle_end = $4::date`,
      [ORG_ID, testMetric, billingStart.toISOString(), billingEnd.toISOString()],
    )

    const recordCount = Number.parseInt(result.rows[0].count)

    // Should only create 1 record, not 5
    expect(recordCount).toBe(1)
  })

  it('should create new record when overage amount increases significantly', async () => {
    const testMetric = 'storage' as const
    const billingStart = new Date('2025-12-07')
    const billingEnd = new Date('2026-01-07')

    // First call with initial overage
    await retryRpc(() => supabase.rpc('apply_usage_overage', {
      p_org_id: ORG_ID,
      p_metric: testMetric,
      p_overage_amount: 1000000,
      p_billing_cycle_start: billingStart.toISOString(),
      p_billing_cycle_end: billingEnd.toISOString(),
      p_details: { limit: 10000000, usage: 11000000 },
    }))

    // Second call with significantly higher overage (>1% increase)
    await retryRpc(() => supabase.rpc('apply_usage_overage', {
      p_org_id: ORG_ID,
      p_metric: testMetric,
      p_overage_amount: 2000000, // 100% increase
      p_billing_cycle_start: billingStart.toISOString(),
      p_billing_cycle_end: billingEnd.toISOString(),
      p_details: { limit: 10000000, usage: 12000000 },
    }))

    // Should create 2 records
    const result = await pgPool.query(
      `SELECT COUNT(*) as count FROM usage_overage_events
       WHERE org_id = $1 AND metric = $2
         AND billing_cycle_start = $3::date
         AND billing_cycle_end = $4::date`,
      [ORG_ID, testMetric, billingStart.toISOString(), billingEnd.toISOString()],
    )

    expect(Number.parseInt(result.rows[0].count)).toBe(2)
  })

  it('should create new record when credits become available', async () => {
    const testMetric = 'mau' as const
    const billingStart = new Date('2025-12-01')
    const billingEnd = new Date('2026-01-01')
    const overageAmount = 10000

    // Grant some credits FIRST
    await pgPool.query(
      `INSERT INTO usage_credit_grants (org_id, credits_total, credits_consumed, granted_at, expires_at, source, source_ref)
       VALUES ($1, 100, 0, NOW(), NOW() + INTERVAL '30 days', 'manual', '{"test": true}')`,
      [ORG_ID],
    )

    // Call with credits available - should apply them
    const { data: firstCall, error: firstError } = await retryRpc(() => supabase.rpc('apply_usage_overage', {
      p_org_id: ORG_ID,
      p_metric: testMetric,
      p_overage_amount: overageAmount,
      p_billing_cycle_start: billingStart.toISOString(),
      p_billing_cycle_end: billingEnd.toISOString(),
      p_details: { limit: 5000, usage: 15000 },
    }))

    expect(firstError).toBeNull()
    const firstResult = Array.isArray(firstCall) ? firstCall[0] : firstCall
    // Should have applied some credits
    expect(Number(firstResult?.credits_applied)).toBeGreaterThan(0)

    // Second call with same params - should NOT create new record (no new credits, same overage)
    const { error: secondError } = await retryRpc(() => supabase.rpc('apply_usage_overage', {
      p_org_id: ORG_ID,
      p_metric: testMetric,
      p_overage_amount: overageAmount,
      p_billing_cycle_start: billingStart.toISOString(),
      p_billing_cycle_end: billingEnd.toISOString(),
      p_details: { limit: 5000, usage: 15000 },
    }))

    expect(secondError).toBeNull()

    // Should only have 1 record since nothing changed
    const result = await pgPool.query(
      `SELECT COUNT(*) as count FROM usage_overage_events
       WHERE org_id = $1 AND metric = $2
         AND billing_cycle_start = $3::date
         AND billing_cycle_end = $4::date`,
      [ORG_ID, testMetric, billingStart.toISOString(), billingEnd.toISOString()],
    )

    expect(Number.parseInt(result.rows[0].count)).toBe(1)
  })

  it('should not create record when overage increases by less than 1%', async () => {
    const testMetric = 'build_time' as const
    const billingStart = new Date('2025-11-01')
    const billingEnd = new Date('2025-12-01')

    // First call
    await retryRpc(() => supabase.rpc('apply_usage_overage', {
      p_org_id: ORG_ID,
      p_metric: testMetric,
      p_overage_amount: 100000,
      p_billing_cycle_start: billingStart.toISOString(),
      p_billing_cycle_end: billingEnd.toISOString(),
      p_details: { limit: 1000000, usage: 1100000 },
    }))

    // Second call with tiny increase (0.5%)
    await retryRpc(() => supabase.rpc('apply_usage_overage', {
      p_org_id: ORG_ID,
      p_metric: testMetric,
      p_overage_amount: 100500, // Only 0.5% increase
      p_billing_cycle_start: billingStart.toISOString(),
      p_billing_cycle_end: billingEnd.toISOString(),
      p_details: { limit: 1000000, usage: 1100500 },
    }))

    // Should only have 1 record
    const result = await pgPool.query(
      `SELECT COUNT(*) as count FROM usage_overage_events
       WHERE org_id = $1 AND metric = $2
         AND billing_cycle_start = $3::date
         AND billing_cycle_end = $4::date`,
      [ORG_ID, testMetric, billingStart.toISOString(), billingEnd.toISOString()],
    )

    expect(Number.parseInt(result.rows[0].count)).toBe(1)
  })
})
