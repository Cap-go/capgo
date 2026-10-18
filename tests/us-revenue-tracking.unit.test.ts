import Stripe from 'stripe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockedEnv: Record<string, string> = {}

vi.mock('hono/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('hono/adapter')>()
  return {
    ...actual,
    env: () => mockedEnv,
  }
})

vi.mock('stripe', () => {
  const MockStripe: any = vi.fn()
  MockStripe.createFetchHttpClient = vi.fn()
  MockStripe.errors = {}
  return { default: MockStripe }
})

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: vi.fn(),
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

function createCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch_us_1',
    amount: 4900,
    currency: 'usd',
    created: 1760000000,
    paid: true,
    customer: 'cus_us_1',
    metadata: {},
    billing_details: { email: 'buyer@example.com' },
    ...overrides,
  } as any
}

function mockStripe(client: Record<string, unknown>) {
  vi.mocked(Stripe).mockImplementation(function () {
    return client
  } as any)
}

const fetchMock = vi.fn()

beforeEach(() => {
  Object.assign(mockedEnv, {
    STRIPE_SECRET_KEY: 'sk_test_ee',
    STRIPE_SECRET_KEY_US: 'sk_test_us',
    AFFONSO_API_KEY: 'sk_live_affonso',
    DATAFAST_API_KEY: 'df_test',
  })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  for (const key of Object.keys(mockedEnv))
    delete mockedEnv[key]
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 })
}

function sentBodies(url: string) {
  return fetchMock.mock.calls
    .filter(([calledUrl]) => calledUrl === url)
    .map(([, init]) => JSON.parse(init.body))
}

describe('us revenue tracking', () => {
  it('copies checkout attribution to the customer and reports the sale to Affonso and DataFast', async () => {
    const customersUpdate = vi.fn().mockResolvedValue({})
    const chargesUpdate = vi.fn().mockResolvedValue({})
    mockStripe({
      customers: {
        retrieve: vi.fn().mockResolvedValue({ id: 'cus_us_1', metadata: {} }),
        update: customersUpdate,
      },
      checkout: {
        sessions: {
          list: vi.fn().mockResolvedValue({
            data: [
              { id: 'cs_old', metadata: {} },
              { id: 'cs_ref', metadata: { affonso_referral: 'ref_abc', datafast_visitor_id: 'visitor_1' } },
            ],
          }),
        },
      },
      charges: { update: chargesUpdate },
    })
    fetchMock.mockImplementation(async (url: string) => url.includes('affonso')
      ? jsonResponse({ success: true, data: { id: 'com_123' } })
      : jsonResponse({ message: 'ok' }))

    const { trackUsChargeSucceeded } = await import('../supabase/functions/_backend/utils/us_revenue_tracking.ts')
    await trackUsChargeSucceeded(createContext(), createCharge())

    expect(customersUpdate).toHaveBeenCalledWith('cus_us_1', {
      metadata: { affonso_referral: 'ref_abc', datafast_visitor_id: 'visitor_1' },
    })
    expect(sentBodies('https://api.affonso.io/v1/conversions')).toEqual([
      expect.objectContaining({
        referral_id: 'ref_abc',
        customer_id: 'cus_us_1',
        sale_amount: 49,
        sale_amount_currency: 'USD',
        external_event_id: 'ch_us_1',
      }),
    ])
    expect(sentBodies('https://datafa.st/api/v1/payments')).toEqual([
      expect.objectContaining({
        amount: 49,
        currency: 'USD',
        transaction_id: 'ch_us_1',
        datafast_visitor_id: 'visitor_1',
      }),
    ])
    expect(chargesUpdate).toHaveBeenCalledWith('ch_us_1', { metadata: { affonso_conversion_id: 'com_123' } })
  })

  it('still reports revenue to DataFast when there is no referral', async () => {
    mockStripe({
      customers: { retrieve: vi.fn().mockResolvedValue({ id: 'cus_us_1', metadata: {} }), update: vi.fn() },
      checkout: { sessions: { list: vi.fn().mockResolvedValue({ data: [] }) } },
    })
    fetchMock.mockResolvedValue(jsonResponse({ message: 'ok' }))

    const { trackUsChargeSucceeded } = await import('../supabase/functions/_backend/utils/us_revenue_tracking.ts')
    await trackUsChargeSucceeded(createContext(), createCharge())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentBodies('https://datafa.st/api/v1/payments')[0]).not.toHaveProperty('datafast_visitor_id')
  })

  it('does not throw when a tracker fails', async () => {
    mockStripe({
      customers: { retrieve: vi.fn().mockResolvedValue({ id: 'cus_us_1', metadata: { affonso_referral: 'ref_abc' } }) },
    })
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))

    const { trackUsChargeSucceeded } = await import('../supabase/functions/_backend/utils/us_revenue_tracking.ts')
    await expect(trackUsChargeSucceeded(createContext(), createCharge())).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports each succeeded refund to Affonso and DataFast', async () => {
    mockStripe({
      refunds: {
        list: vi.fn().mockResolvedValue({
          data: [
            { id: 're_1', amount: 1000, currency: 'usd', created: 1760000100, status: 'succeeded', reason: 'requested_by_customer' },
            { id: 're_2', amount: 500, currency: 'usd', created: 1760000200, status: 'pending', reason: null },
          ],
        }),
      },
    })
    fetchMock.mockResolvedValue(jsonResponse({ success: true }))

    const { trackUsChargeRefunded } = await import('../supabase/functions/_backend/utils/us_revenue_tracking.ts')
    await trackUsChargeRefunded(createContext(), createCharge({ metadata: { affonso_conversion_id: 'com_123' } }))

    expect(sentBodies('https://api.affonso.io/v1/conversions/com_123/refund')).toEqual([
      expect.objectContaining({ amount: 10, currency: 'USD', external_event_id: 're_1' }),
    ])
    expect(sentBodies('https://datafa.st/api/v1/payments')).toEqual([
      expect.objectContaining({ amount: 10, transaction_id: 'ch_us_1', refunded: true }),
    ])
  })

  it('skips trackers without API keys', async () => {
    delete mockedEnv.AFFONSO_API_KEY
    delete mockedEnv.DATAFAST_API_KEY
    mockStripe({
      customers: { retrieve: vi.fn().mockResolvedValue({ id: 'cus_us_1', metadata: { affonso_referral: 'ref_abc' } }) },
    })

    const { trackUsChargeSucceeded } = await import('../supabase/functions/_backend/utils/us_revenue_tracking.ts')
    await trackUsChargeSucceeded(createContext(), createCharge())

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
