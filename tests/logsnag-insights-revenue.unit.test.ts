import type { Context } from 'hono'
import { Hono } from 'hono/tiny'
import { describe, expect, it, vi } from 'vitest'
import { logsnagInsightsTestUtils } from '../supabase/functions/_backend/triggers/logsnag_insights.ts'
import { logsnagInsights } from '../supabase/functions/_backend/utils/logsnag.ts'
import { sendEventToTracking } from '../supabase/functions/_backend/utils/tracking.ts'

function withTestEnv(values: Record<string, string>) {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined)
        delete process.env[key]
      else
        process.env[key] = value
    }
  }
}

describe('logsnag revenue metric helpers', () => {
  it.concurrent('keeps revenue-active snapshots limited to succeeded subscriptions', () => {
    expect(logsnagInsightsTestUtils.REVENUE_ACTIVE_STRIPE_STATUSES).toEqual(['succeeded'])
  })

  it.concurrent('counts paid customers from paid_at rows and legacy fallback rows', () => {
    expect(logsnagInsightsTestUtils.countUniqueCustomers(
      [
        { customer_id: 'cus_paid_1' },
        { customer_id: 'cus_paid_2' },
      ],
      [
        { customer_id: 'cus_legacy_1' },
      ],
    )).toBe(3)
  })

  it.concurrent('deduplicates customer ids across the paid_at query and legacy fallback query', () => {
    expect(logsnagInsightsTestUtils.countUniqueCustomers(
      [
        { customer_id: 'cus_shared' },
      ],
      [
        { customer_id: 'cus_shared' },
      ],
    )).toBe(1)
  })

  it.concurrent('builds UTC calendar-day bounds', () => {
    const { dayStart, nextDayStart, dayDateId } = logsnagInsightsTestUtils.getCurrentDayWindow(new Date('2026-03-24T18:45:12.000Z'))

    expect(dayStart.toISOString()).toBe('2026-03-24T00:00:00.000Z')
    expect(nextDayStart.toISOString()).toBe('2026-03-25T00:00:00.000Z')
    expect(dayDateId).toBe('2026-03-24')
  })

  it.concurrent('builds the previous completed UTC day window for scheduled snapshots', () => {
    const { dayStart, nextDayStart, dayDateId } = logsnagInsightsTestUtils.getCompletedDayWindow(new Date('2026-03-25T01:01:00.000Z'))

    expect(dayStart.toISOString()).toBe('2026-03-24T00:00:00.000Z')
    expect(nextDayStart.toISOString()).toBe('2026-03-25T00:00:00.000Z')
    expect(dayDateId).toBe('2026-03-24')
  })

  it.concurrent('derives replay metric bounds from a preserved snapshot date', () => {
    const replayWindow = logsnagInsightsTestUtils.getCompletedDayWindowForDateId('2026-03-24')
    const { dayStart, nextDayStart, dayDateId } = logsnagInsightsTestUtils.getMetricWindowFromDailyWindow(replayWindow)

    expect(dayStart.toISOString()).toBe('2026-03-24T00:00:00.000Z')
    expect(nextDayStart.toISOString()).toBe('2026-03-25T00:00:00.000Z')
    expect(dayDateId).toBe('2026-03-24')
  })

  it.concurrent('detects missing global stats shards before notifications', () => {
    expect(logsnagInsightsTestUtils.getMissingGlobalStatsRequiredShards(new Set())).toEqual([
      'core',
      'usage',
      'revenue',
      'plugins',
      'builds',
      'retention',
      'paid_products',
      'ltv',
    ])

    const completed = logsnagInsightsTestUtils.normalizeCompletedGlobalStatsShards([
      'core',
      'usage',
      'plugins',
      'builds',
      'retention',
      'paid_products',
      'ltv',
      'notifications',
      'bad',
    ])

    expect(logsnagInsightsTestUtils.getMissingGlobalStatsRequiredShards(completed)).toEqual(['revenue'])

    const ready = logsnagInsightsTestUtils.normalizeCompletedGlobalStatsShards([
      'core',
      'usage',
      'revenue',
      'plugins',
      'builds',
      'retention',
      'paid_products',
      'ltv',
    ])
    expect(logsnagInsightsTestUtils.getMissingGlobalStatsRequiredShards(ready)).toEqual([])
    expect(logsnagInsightsTestUtils.getMissingGlobalStatsShards(ready)).toEqual(['notifications'])

    const sent = logsnagInsightsTestUtils.normalizeCompletedGlobalStatsShards([
      ...ready,
      'notifications',
    ])
    expect(logsnagInsightsTestUtils.getMissingGlobalStatsShards(sent)).toEqual([])
  })

  it.concurrent('detects completed global stats notifications for idempotent retries', () => {
    const ready = logsnagInsightsTestUtils.normalizeCompletedGlobalStatsShards([
      'core',
      'usage',
      'revenue',
      'plugins',
      'builds',
      'retention',
      'paid_products',
      'ltv',
    ])
    expect(logsnagInsightsTestUtils.hasCompletedGlobalStatsNotifications(ready)).toBe(false)

    const sent = logsnagInsightsTestUtils.normalizeCompletedGlobalStatsShards([
      ...ready,
      'notifications',
    ])
    expect(logsnagInsightsTestUtils.hasCompletedGlobalStatsNotifications(sent)).toBe(true)

    const partiallySent = logsnagInsightsTestUtils.normalizeCompletedGlobalStatsShards([
      ...ready,
      'notifications_logsnag',
      'notifications_tracking',
    ])
    expect(logsnagInsightsTestUtils.hasCompletedGlobalStatsNotifications(partiallySent)).toBe(false)
    expect(logsnagInsightsTestUtils.getMissingGlobalStatsShards(partiallySent)).toEqual(['notifications'])
  })

  it.concurrent('uses notification claim markers to avoid replaying claimed sends', () => {
    const ready = logsnagInsightsTestUtils.normalizeCompletedGlobalStatsShards([
      'core',
      'usage',
      'revenue',
      'plugins',
      'builds',
      'retention',
      'paid_products',
      'ltv',
    ])

    expect(logsnagInsightsTestUtils.getGlobalStatsNotificationStepAction(ready, 'notifications_logsnag', 'notifications_logsnag_claim')).toBe('send')

    const claimed = logsnagInsightsTestUtils.normalizeCompletedGlobalStatsShards([
      ...ready,
      'notifications_logsnag_claim',
    ])
    expect(logsnagInsightsTestUtils.getGlobalStatsNotificationStepAction(claimed, 'notifications_logsnag', 'notifications_logsnag_claim')).toBe('complete_claimed')

    const sent = logsnagInsightsTestUtils.normalizeCompletedGlobalStatsShards([
      ...claimed,
      'notifications_logsnag',
    ])
    expect(logsnagInsightsTestUtils.getGlobalStatsNotificationStepAction(sent, 'notifications_logsnag', 'notifications_logsnag_claim')).toBe('skip')
  })

  it.concurrent('computes NRR from prior MRR, churn, contraction, and expansion', () => {
    expect(logsnagInsightsTestUtils.calculateNrr(100, {
      churnMrr: 15,
      contractionMrr: 5,
      expansionMrr: 10,
    })).toBe(90)
  })

  it.concurrent('defaults NRR to 100 when there is no starting MRR baseline', () => {
    expect(logsnagInsightsTestUtils.calculateNrr(0, {
      churnMrr: 12,
      contractionMrr: 4,
      expansionMrr: 0,
    })).toBe(100)
  })

  it.concurrent('sums full churn and downgrade revenue into the churn revenue metric', () => {
    expect(logsnagInsightsTestUtils.calculateChurnRevenue({
      churnMrr: 18.25,
      contractionMrr: 7.75,
      expansionMrr: 0,
    })).toBe(26)
  })

  it.concurrent('calculates current past-due org count and average days', () => {
    expect(logsnagInsightsTestUtils.calculatePastDueOrgStats([
      {
        customer_id: 'cus_due_1',
        past_due_at: '2026-03-20T00:00:00.000Z',
        updated_at: '2026-03-21T00:00:00.000Z',
      },
      {
        customer_id: 'cus_due_2',
        past_due_at: '2026-03-22T12:00:00.000Z',
        updated_at: '2026-03-22T12:00:00.000Z',
      },
      {
        customer_id: 'cus_due_2',
        past_due_at: '2026-03-22T12:00:00.000Z',
        updated_at: '2026-03-22T12:00:00.000Z',
      },
    ], new Date('2026-03-25T00:00:00.000Z'))).toEqual({
      past_due_orgs: 2,
      past_due_orgs_average_days: 3.8,
    })
  })

  it.concurrent('ignores future past-due rows and uses the earliest start per customer', () => {
    expect(logsnagInsightsTestUtils.calculatePastDueOrgStats([
      {
        customer_id: 'cus_due_1',
        past_due_at: '2026-03-24T00:00:00.000Z',
        updated_at: '2026-03-24T00:00:00.000Z',
      },
      {
        customer_id: 'cus_due_1',
        past_due_at: '2026-03-22T00:00:00.000Z',
        updated_at: '2026-03-22T00:00:00.000Z',
      },
      {
        customer_id: 'cus_due_future',
        past_due_at: '2026-03-25T12:00:00.000Z',
        updated_at: '2026-03-25T12:00:00.000Z',
      },
    ], new Date('2026-03-25T00:00:00.000Z'))).toEqual({
      past_due_orgs: 1,
      past_due_orgs_average_days: 3,
    })
  })

  it.concurrent('falls back to updated_at for past-due duration during rollout', () => {
    expect(logsnagInsightsTestUtils.calculatePastDueOrgStats([
      {
        customer_id: 'cus_due_rollout',
        past_due_at: null,
        updated_at: '2026-03-24T00:00:00.000Z',
      },
    ], new Date('2026-03-25T00:00:00.000Z'))).toEqual({
      past_due_orgs: 1,
      past_due_orgs_average_days: 1,
    })
  })

  it.concurrent('only refreshes mutable past-due stats for the current daily snapshot or an empty first fill', () => {
    const currentWindow = logsnagInsightsTestUtils.getCompletedDayWindowForDateId('2026-03-24')
    const replayReferenceDate = new Date('2026-03-26T00:00:00.000Z')

    expect(logsnagInsightsTestUtils.shouldRefreshMutablePastDueStats(
      currentWindow,
      new Date('2026-03-25T12:00:00.000Z'),
    )).toBe(true)
    expect(logsnagInsightsTestUtils.shouldRefreshMutablePastDueStats(
      currentWindow,
      replayReferenceDate,
    )).toBe(false)
    expect(logsnagInsightsTestUtils.shouldRefreshMutablePastDueStats(
      currentWindow,
      replayReferenceDate,
      { past_due_orgs: 0, past_due_orgs_average_days: 0 },
    )).toBe(true)
    expect(logsnagInsightsTestUtils.shouldRefreshMutablePastDueStats(
      currentWindow,
      replayReferenceDate,
      { past_due_orgs: 2, past_due_orgs_average_days: 3.8 },
    )).toBe(false)
  })

  it.concurrent('defaults missing plan buckets to zero for global stats snapshots', () => {
    expect(logsnagInsightsTestUtils.normalizePlanTotals({ Solo: 12, Team: Number.NaN })).toEqual({
      Enterprise: 0,
      Maker: 0,
      Solo: 12,
      Team: 0,
      Trial: 0,
    })
  })

  it.concurrent('keeps converted trials in replay snapshots until paid_at reaches the snapshot end', () => {
    const snapshotEnd = new Date('2026-03-25T00:00:00.000Z')

    expect(logsnagInsightsTestUtils.isUnpaidAtBillingSnapshot(null, snapshotEnd)).toBe(true)
    expect(logsnagInsightsTestUtils.isUnpaidAtBillingSnapshot('2026-03-25T00:00:00.000Z', snapshotEnd)).toBe(true)
    expect(logsnagInsightsTestUtils.isUnpaidAtBillingSnapshot('2026-03-25T00:00:00.001Z', snapshotEnd)).toBe(true)
    expect(logsnagInsightsTestUtils.isUnpaidAtBillingSnapshot('2026-03-24T23:59:59.999Z', snapshotEnd)).toBe(false)
  })

  it.concurrent('excludes unpaid trials from paid replay snapshots', () => {
    const snapshotEnd = new Date('2026-03-25T00:00:00.000Z')

    expect(logsnagInsightsTestUtils.isPaidPlanAtBillingSnapshot(null, '2026-03-26T00:00:00.000Z', snapshotEnd)).toBe(false)
    expect(logsnagInsightsTestUtils.isPaidPlanAtBillingSnapshot(null, '2026-03-25T00:00:00.000Z', snapshotEnd)).toBe(true)
    expect(logsnagInsightsTestUtils.isPaidPlanAtBillingSnapshot(null, '2026-03-24T23:59:59.999Z', snapshotEnd)).toBe(true)
    expect(logsnagInsightsTestUtils.isPaidPlanAtBillingSnapshot('2026-03-25T00:00:00.000Z', '2026-03-24T00:00:00.000Z', snapshotEnd)).toBe(false)
    expect(logsnagInsightsTestUtils.isPaidPlanAtBillingSnapshot('2026-03-24T23:59:59.999Z', '2026-03-26T00:00:00.000Z', snapshotEnd)).toBe(true)
  })

  it.concurrent('normalizes snapshot billing counts from SQL rows', () => {
    expect(logsnagInsightsTestUtils.normalizeBillingSnapshotCounts([
      {
        yearly: '2',
        monthly: '3',
        total: '5',
        paying_orgs_for_conversion: '4',
        plan_name: 'Solo',
        plan_count: '2',
      },
      {
        yearly: '2',
        monthly: '3',
        total: '5',
        paying_orgs_for_conversion: '4',
        plan_name: 'Trial',
        plan_count: '1',
      },
    ])).toEqual({
      customers: { yearly: 2, monthly: 3, total: 5 },
      payingOrgsForConversion: 4,
      plans: {
        Enterprise: 0,
        Maker: 0,
        Solo: 2,
        Team: 0,
        Trial: 1,
      },
    })
  })

  it.concurrent('defaults empty snapshot billing rows to zero counts', () => {
    expect(logsnagInsightsTestUtils.normalizeBillingSnapshotCounts([])).toEqual({
      customers: { yearly: 0, monthly: 0, total: 0 },
      payingOrgsForConversion: 0,
      plans: {
        Enterprise: 0,
        Maker: 0,
        Solo: 0,
        Team: 0,
        Trial: 0,
      },
    })
  })

  it.concurrent('normalizes core snapshot counts from SQL rows', () => {
    expect(logsnagInsightsTestUtils.normalizeCoreSnapshotCounts({
      onboarded: '7',
      need_upgrade: null,
    })).toEqual({ onboarded: 7, needUpgrade: 0 })

    expect(logsnagInsightsTestUtils.normalizeCoreSnapshotCounts(null)).toEqual({ onboarded: 0, needUpgrade: 0 })
  })

  it.concurrent('normalizes logsnag insights retry payload counts', () => {
    expect(logsnagInsightsTestUtils.normalizeLogsnagInsightsRetryCount('2')).toBe(2)
    expect(logsnagInsightsTestUtils.normalizeLogsnagInsightsRetryCount(2.8)).toBe(2)
    expect(logsnagInsightsTestUtils.normalizeLogsnagInsightsRetryCount(-1)).toBe(0)
    expect(logsnagInsightsTestUtils.normalizeLogsnagInsightsRetryCount('bad')).toBe(0)
  })

  it.concurrent('builds retry messages for the admin stats queue', () => {
    expect(logsnagInsightsTestUtils.buildLogsnagInsightsRetryMessage(3)).toEqual({
      function_name: 'logsnag_insights',
      function_type: 'cloudflare',
      payload: {
        retry_count: 3,
      },
    })
  })

  it.concurrent('preserves the snapshot date on dispatcher retry messages', () => {
    expect(logsnagInsightsTestUtils.buildLogsnagInsightsRetryMessage(3, '2026-03-24')).toEqual({
      function_name: 'logsnag_insights',
      function_type: 'cloudflare',
      payload: {
        date_id: '2026-03-24',
        retry_count: 3,
      },
    })
  })

  it.concurrent('builds shard messages as distinct queue HTTP calls', () => {
    expect(logsnagInsightsTestUtils.getLogsnagInsightsShardFunctionName('revenue')).toBe('logsnag_insights_revenue')
    expect(logsnagInsightsTestUtils.buildLogsnagInsightsShardMessage('revenue', '2026-03-24')).toEqual({
      function_name: 'logsnag_insights_revenue',
      function_type: 'cloudflare',
      payload: {
        date_id: '2026-03-24',
      },
    })
    expect(logsnagInsightsTestUtils.buildLogsnagInsightsShardMessage('revenue', '2026-03-24', 2)).toEqual({
      function_name: 'logsnag_insights_revenue',
      function_type: 'cloudflare',
      payload: {
        date_id: '2026-03-24',
        retry_count: 2,
      },
    })
  })

  it.concurrent('normalizes global stats shard and date payloads', () => {
    expect(logsnagInsightsTestUtils.normalizeLogsnagInsightsShard('core')).toBe('core')
    expect(logsnagInsightsTestUtils.normalizeLogsnagInsightsShard('bad')).toBeNull()
    expect(logsnagInsightsTestUtils.normalizeGlobalStatsDateId('2026-03-24')).toBe('2026-03-24')
    expect(logsnagInsightsTestUtils.normalizeGlobalStatsDateId('2026-02-30')).toBeNull()
    expect(logsnagInsightsTestUtils.normalizeGlobalStatsDateId('bad')).toBeNull()
  })

  it('rejects non-empty malformed JSON payloads', async () => {
    const app = new Hono()
    app.post('/', async (c) => {
      await logsnagInsightsTestUtils.readLogsnagInsightsPayload(c)
      return c.json({ status: 'ok' })
    })

    const response = await app.request('http://localhost/', {
      method: 'POST',
      body: '{',
    })

    expect(response.status).toBe(400)
  })

  it('schedules global stats snapshots in the EdgeRuntime background path', async () => {
    const globalWithEdgeRuntime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
    }
    const previousEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime
    let scheduledPromise: Promise<unknown> | null = null
    let resolveUpdate!: () => void
    const updatePromise = new Promise<void>((resolve) => {
      resolveUpdate = resolve
    })
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      scheduledPromise = promise
    })

    globalWithEdgeRuntime.EdgeRuntime = { waitUntil }

    try {
      const app = new Hono()
      const runUpdate = vi.fn(() => updatePromise)
      app.post('/', async (c) => {
        await logsnagInsightsTestUtils.scheduleLogsnagInsightsUpdate(c, runUpdate)
        return c.json({ status: 'ok' })
      })

      const requestTimeoutMs = 500
      const responseStatusPromise = (async () => {
        const response = await app.request('http://localhost/', { method: 'POST' })
        return response.status
      })()
      const result = await Promise.race([
        responseStatusPromise,
        new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), requestTimeoutMs)),
      ])

      expect(result).toBe(200)
      expect(waitUntil).toHaveBeenCalledTimes(1)
      if (!scheduledPromise)
        throw new Error('Expected waitUntil to receive a promise')

      resolveUpdate()
      await scheduledPromise
      expect(runUpdate).toHaveBeenCalledTimes(1)
    }
    finally {
      globalWithEdgeRuntime.EdgeRuntime = previousEdgeRuntime
    }
  })

  it('schedules global stats shard work in the EdgeRuntime background path', async () => {
    const globalWithEdgeRuntime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
    }
    const previousEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime
    let scheduledPromise: Promise<unknown> | null = null
    let resolveShard!: () => void
    const shardPromise = new Promise<void>((resolve) => {
      resolveShard = resolve
    })
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      scheduledPromise = promise
    })

    globalWithEdgeRuntime.EdgeRuntime = { waitUntil }

    try {
      const app = new Hono()
      const runShard = vi.fn((_c: Context, _shard: string, _dateId: string) => shardPromise)
      const cancelRetry = vi.fn(async (_c: Context, _retryMsgId: number) => {})
      app.post('/', async (c) => {
        await logsnagInsightsTestUtils.scheduleLogsnagInsightsShardUpdate(c, 'core', '2026-03-24', {
          cancelRetry,
          retryCount: 1,
          retryMsgId: 654,
          runShard,
        })
        return c.json({ status: 'ok' })
      })

      const requestTimeoutMs = 500
      const responseStatusPromise = (async () => {
        const response = await app.request('http://localhost/', { method: 'POST' })
        return response.status
      })()
      const result = await Promise.race([
        responseStatusPromise,
        new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), requestTimeoutMs)),
      ])

      expect(result).toBe(200)
      expect(waitUntil).toHaveBeenCalledTimes(1)
      if (!scheduledPromise)
        throw new Error('Expected waitUntil to receive a promise')

      resolveShard()
      await scheduledPromise
      expect(runShard).toHaveBeenCalledTimes(1)
      expect(runShard).toHaveBeenCalledWith(expect.anything(), 'core', '2026-03-24')
      expect(cancelRetry).toHaveBeenCalledTimes(1)
      expect(cancelRetry).toHaveBeenCalledWith(expect.anything(), 654)
    }
    finally {
      globalWithEdgeRuntime.EdgeRuntime = previousEdgeRuntime
    }
  })

  it('leaves a reserved shard retry queued when the background shard update fails', async () => {
    const globalWithEdgeRuntime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
    }
    const previousEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime
    let scheduledPromise: Promise<unknown> | null = null
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      scheduledPromise = promise
    })

    globalWithEdgeRuntime.EdgeRuntime = { waitUntil }

    try {
      const app = new Hono()
      const runShard = vi.fn(async (_c: Context, _shard: string, _dateId: string) => {
        throw new Error('shard failed')
      })
      const cancelRetry = vi.fn(async (_c: Context, _retryMsgId: number) => {})
      app.post('/', async (c) => {
        await logsnagInsightsTestUtils.scheduleLogsnagInsightsShardUpdate(c, 'core', '2026-03-24', {
          cancelRetry,
          retryCount: 1,
          retryMsgId: 654,
          runShard,
        })
        return c.json({ status: 'ok' })
      })

      const response = await Promise.resolve(app.request('http://localhost/', { method: 'POST' }))
      expect(response.status).toBe(200)
      expect(waitUntil).toHaveBeenCalledTimes(1)
      if (!scheduledPromise)
        throw new Error('Expected waitUntil to receive a promise')

      await scheduledPromise
      expect(runShard).toHaveBeenCalledTimes(1)
      expect(runShard).toHaveBeenCalledWith(expect.anything(), 'core', '2026-03-24')
      expect(cancelRetry).not.toHaveBeenCalled()
    }
    finally {
      globalWithEdgeRuntime.EdgeRuntime = previousEdgeRuntime
    }
  })

  it('returns failure when the shard retry budget is exhausted and the shard update fails', async () => {
    const globalWithEdgeRuntime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
    }
    const previousEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime
    const waitUntil = vi.fn()

    globalWithEdgeRuntime.EdgeRuntime = { waitUntil }

    try {
      const app = new Hono()
      const runShard = vi.fn(async (_c: Context, _shard: string, _dateId: string) => {
        throw new Error('shard failed after retry budget')
      })
      app.post('/', async (c) => {
        await logsnagInsightsTestUtils.scheduleLogsnagInsightsShardUpdate(c, 'core', '2026-03-24', {
          retryCount: logsnagInsightsTestUtils.LOGSNAG_INSIGHTS_BACKGROUND_MAX_RETRIES,
          retryMsgId: null,
          runShard,
        })
        return c.json({ status: 'ok' })
      })

      const response = await Promise.resolve(app.request('http://localhost/', { method: 'POST' }))
      expect(response.status).toBe(500)
      expect(waitUntil).not.toHaveBeenCalled()
      expect(runShard).toHaveBeenCalledTimes(1)
      expect(runShard).toHaveBeenCalledWith(expect.anything(), 'core', '2026-03-24')
    }
    finally {
      globalWithEdgeRuntime.EdgeRuntime = previousEdgeRuntime
    }
  })

  it('cancels a reserved retry when the background snapshot succeeds', async () => {
    const globalWithEdgeRuntime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
    }
    const previousEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime
    let scheduledPromise: Promise<unknown> | null = null
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      scheduledPromise = promise
    })

    globalWithEdgeRuntime.EdgeRuntime = { waitUntil }

    try {
      const app = new Hono()
      const runUpdate = vi.fn(async () => {})
      const cancelRetry = vi.fn(async (_c: Context, _retryMsgId: number) => {})
      app.post('/', async (c) => {
        await logsnagInsightsTestUtils.scheduleLogsnagInsightsUpdate(c, runUpdate, {
          cancelRetry,
          retryCount: 2,
          retryMsgId: 321,
        })
        return c.json({ status: 'ok' })
      })

      const response = await Promise.resolve(app.request('http://localhost/', { method: 'POST' }))
      expect(response.status).toBe(200)
      expect(waitUntil).toHaveBeenCalledTimes(1)
      if (!scheduledPromise)
        throw new Error('Expected waitUntil to receive a promise')

      await scheduledPromise
      expect(runUpdate).toHaveBeenCalledTimes(1)
      expect(cancelRetry).toHaveBeenCalledTimes(1)
      expect(cancelRetry).toHaveBeenCalledWith(expect.anything(), 321)
    }
    finally {
      globalWithEdgeRuntime.EdgeRuntime = previousEdgeRuntime
    }
  })

  it('propagates reserved retry cancel failures after the background snapshot succeeds', async () => {
    const globalWithEdgeRuntime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
    }
    const previousEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime
    let scheduledPromise: Promise<unknown> | null = null
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      scheduledPromise = promise
    })

    globalWithEdgeRuntime.EdgeRuntime = { waitUntil }

    try {
      const app = new Hono()
      const cancelFailure = new Error('retry cancel failed')
      const runUpdate = vi.fn(async () => {})
      const cancelRetry = vi.fn(async (_c: Context, _retryMsgId: number) => {
        throw cancelFailure
      })
      app.post('/', async (c) => {
        await logsnagInsightsTestUtils.scheduleLogsnagInsightsUpdate(c, runUpdate, {
          cancelRetry,
          retryCount: 2,
          retryMsgId: 321,
        })
        return c.json({ status: 'ok' })
      })

      const response = await Promise.resolve(app.request('http://localhost/', { method: 'POST' }))
      expect(response.status).toBe(200)
      expect(waitUntil).toHaveBeenCalledTimes(1)
      if (!scheduledPromise)
        throw new Error('Expected waitUntil to receive a promise')

      await expect(scheduledPromise).rejects.toThrow('retry cancel failed')
      expect(runUpdate).toHaveBeenCalledTimes(1)
      expect(cancelRetry).toHaveBeenCalledTimes(1)
      expect(cancelRetry).toHaveBeenCalledWith(expect.anything(), 321)
    }
    finally {
      globalWithEdgeRuntime.EdgeRuntime = previousEdgeRuntime
    }
  })

  it('leaves a reserved retry queued when the background snapshot update fails', async () => {
    const globalWithEdgeRuntime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
    }
    const previousEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime
    let scheduledPromise: Promise<unknown> | null = null
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      scheduledPromise = promise
    })

    globalWithEdgeRuntime.EdgeRuntime = { waitUntil }

    try {
      const app = new Hono()
      const failure = new Error('snapshot failed')
      const runUpdate = vi.fn(async () => {
        throw failure
      })
      const cancelRetry = vi.fn(async (_c: Context, _retryMsgId: number) => {})
      app.post('/', async (c) => {
        await logsnagInsightsTestUtils.scheduleLogsnagInsightsUpdate(c, runUpdate, {
          cancelRetry,
          retryCount: 2,
          retryMsgId: 321,
        })
        return c.json({ status: 'ok' })
      })

      const response = await Promise.resolve(app.request('http://localhost/', { method: 'POST' }))
      expect(response.status).toBe(200)
      expect(waitUntil).toHaveBeenCalledTimes(1)
      if (!scheduledPromise)
        throw new Error('Expected waitUntil to receive a promise')

      await scheduledPromise
      expect(runUpdate).toHaveBeenCalledTimes(1)
      expect(cancelRetry).not.toHaveBeenCalled()
    }
    finally {
      globalWithEdgeRuntime.EdgeRuntime = previousEdgeRuntime
    }
  })

  it('returns failure when the retry budget is exhausted and the snapshot update fails', async () => {
    const globalWithEdgeRuntime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
    }
    const previousEdgeRuntime = globalWithEdgeRuntime.EdgeRuntime
    const waitUntil = vi.fn()

    globalWithEdgeRuntime.EdgeRuntime = { waitUntil }

    try {
      const app = new Hono()
      const runUpdate = vi.fn(async () => {
        throw new Error('snapshot failed after retry budget')
      })
      app.post('/', async (c) => {
        await logsnagInsightsTestUtils.scheduleLogsnagInsightsUpdate(c, runUpdate, {
          retryCount: logsnagInsightsTestUtils.LOGSNAG_INSIGHTS_BACKGROUND_MAX_RETRIES,
          retryMsgId: null,
        })
        return c.json({ status: 'ok' })
      })

      const response = await Promise.resolve(app.request('http://localhost/', { method: 'POST' }))
      expect(response.status).toBe(500)
      expect(waitUntil).not.toHaveBeenCalled()
      expect(runUpdate).toHaveBeenCalledTimes(1)
    }
    finally {
      globalWithEdgeRuntime.EdgeRuntime = previousEdgeRuntime
    }
  })

  it('propagates strict tracking provider failures', async () => {
    const restoreEnv = withTestEnv({
      LOGSNAG_TOKEN: '',
      POSTHOG_API_KEY: '',
    })

    const c = {
      get: () => undefined,
      req: {
        header: () => undefined,
      },
    } as unknown as Context

    try {
      await expect(sendEventToTracking(c, {
        channel: 'updates-stats',
        event: 'Updates last month',
        user_id: 'admin',
      }, { background: false, strict: true })).rejects.toThrow('posthog tracking returned false')
    }
    finally {
      restoreEnv()
    }
  })

  it('propagates strict LogSnag insights delivery failures', async () => {
    const restoreEnv = withTestEnv({
      LOGSNAG_TOKEN: '',
      LOGSNAG_PROJECT: '',
    })

    const c = {
      get: () => undefined,
    } as unknown as Context

    try {
      await expect(logsnagInsights(c, [
        { title: 'Apps', value: 1, icon: '📱' },
      ], { strict: true })).rejects.toThrow('LogSnag insights is not configured')
    }
    finally {
      restoreEnv()
    }
  })
})
