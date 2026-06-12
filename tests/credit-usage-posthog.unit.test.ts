import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCreditUsagePosthogEventInput } from '../supabase/functions/_backend/utils/credit_usage_posthog.ts'

const {
  supabaseAdminMock,
  trackPosthogEventMock,
} = vi.hoisted(() => ({
  supabaseAdminMock: vi.fn(),
  trackPosthogEventMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  BRES: { status: 'ok' },
  middlewareAPISecret: async (_c: unknown, next: () => Promise<void>) => next(),
  parseBody: async (c: { req: { json: () => Promise<unknown> } }) => await c.req.json(),
  simpleError: (code: string, message: string, info?: unknown) => {
    const error = new Error(`${code}: ${message}`)
    Object.assign(error, { info })
    return error
  },
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/posthog.ts', () => ({
  trackPosthogEvent: trackPosthogEventMock,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: supabaseAdminMock,
}))

const transaction = {
  amount: -10,
  balance_after: 90,
  description: 'Overage deduction for build_time usage',
  grant_id: 'grant-1',
  id: 123,
  occurred_at: '2026-03-01T10:00:00.000Z',
  org_id: 'org-1',
  source_ref: { metric: 'build_time', overage_event_id: 'overage-1' },
  transaction_type: 'deduction',
}

const overageEvent = {
  billing_cycle_end: '2026-04-01',
  billing_cycle_start: '2026-03-01',
  created_at: '2026-03-01T10:00:00.000Z',
  credit_step_id: 7,
  credits_debited: 10,
  credits_estimated: 10,
  details: { limit: 1800, usage: 5400 },
  id: 'overage-1',
  metric: 'build_time',
  org_id: 'org-1',
  overage_amount: 3600,
}

function queryResponse(data: unknown, error: unknown = null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data, error })),
      })),
    })),
  }
}

function post(body: unknown) {
  return app.request(new Request('http://local/', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }))
}

const { app } = await import('../supabase/functions/_backend/triggers/credit_usage_posthog.ts')

beforeEach(() => {
  trackPosthogEventMock.mockResolvedValue(true)
  supabaseAdminMock.mockImplementation(() => ({
    from: (table: string) => {
      if (table === 'usage_credit_transactions')
        return queryResponse(transaction)
      if (table === 'usage_overage_events')
        return queryResponse(overageEvent)
      throw new Error(`Unexpected table ${table}`)
    },
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  supabaseAdminMock.mockReset()
  trackPosthogEventMock.mockReset()
})

describe('credit usage PostHog event builder', () => {
  it('marks build-time deductions as credit spend linked to builds', () => {
    const input = buildCreditUsagePosthogEventInput(transaction as any, overageEvent as any, 'backfill')

    expect(input).toMatchObject({
      channel: 'usage',
      distinctId: 'org-1',
      event: 'Credit Usage Ledger Entry',
      groups: { organization: 'org-1' },
      timestamp: '2026-03-01T10:00:00.000Z',
    })
    expect(input.tags).toMatchObject({
      $insert_id: 'usage_credit_transaction:123',
      capture_source: 'backfill',
      credits_delta: -10,
      credits_spent: 10,
      is_build_time_credit_usage: true,
      metric: 'build_time',
      overage_event_id: 'overage-1',
      transaction_type: 'deduction',
      usage: 5400,
      limit: 1800,
    })
  })
})

describe('credit usage PostHog trigger', () => {
  it('loads the transaction context and sends a PostHog-only event', async () => {
    const response = await post({ transaction_id: 123 })

    expect(response.status).toBe(200)
    expect(trackPosthogEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: 'Credit Usage Ledger Entry',
      groups: { organization: 'org-1' },
      setPersonProperties: false,
      timestamp: '2026-03-01T10:00:00.000Z',
      user_id: 'org-1',
      tags: expect.objectContaining({
        capture_source: 'backend',
        credits_spent: 10,
        is_build_time_credit_usage: true,
        metric: 'build_time',
        source_record_id: '123',
      }),
    }))
  })
})
