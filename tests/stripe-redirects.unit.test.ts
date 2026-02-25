import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stripe from '../supabase/functions/_backend/utils/stripe.ts'

vi.mock('hono/adapter', () => ({
  env: () => ({
    WEBAPP_URL: 'https://capgo.test',
    STRIPE_SECRET_KEY: 'sk_test_123',
  }),
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

function createPriceList(recurringInterval = 'month', type = 'recurring') {
  return [
    {
      id: 'price_1',
      active: true,
      recurring: {
        interval: recurringInterval,
        usage_type: 'licensed',
      },
      type,
    },
  ]
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stripe redirect URL allowlist', () => {
  it('allows same-origin return URLs for billing portal', async () => {
    const createSession = vi.fn().mockResolvedValue({ url: 'https://pay.capgo.test/p/session' })
    const stripeClient = {
      billingPortal: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.spyOn(stripe, 'getStripe').mockReturnValue(stripeClient)

    const result = await stripe.createPortal(createContext(), 'cus_123', '/app/usage')

    expect(result.url).toBe('https://pay.capgo.test/p/session')
    expect(createSession).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://capgo.test/app/usage',
    })
  })

  it('rejects external return URLs for billing portal', async () => {
    const createSession = vi.fn()
    const stripeClient = {
      billingPortal: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.spyOn(stripe, 'getStripe').mockReturnValue(stripeClient)

    const response = await stripe.createPortal(createContext(), 'cus_123', 'https://example.com/phishing').catch(error => error)

    expect(response).toBeInstanceOf(Error)
    expect(response.cause).toMatchObject({ error: 'invalid_redirect_url' })
    expect(response.status).toBe(400)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('allows same-origin success and cancel URLs for checkout', async () => {
    const createSession = vi.fn().mockResolvedValue({ url: 'https://pay.capgo.test/p/pay' })
    const stripeClient = {
      prices: {
        search: vi.fn().mockResolvedValue({ data: createPriceList() }),
      },
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.spyOn(stripe, 'getStripe').mockReturnValue(stripeClient)

    const result = await stripe.createCheckout(
      createContext(),
      'cus_123',
      'month',
      'plan_test',
      '/app/success',
      '/app/cancel',
    )

    expect(result.url).toBe('https://pay.capgo.test/p/pay')
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      success_url: 'https://capgo.test/app/success?success=true',
      cancel_url: 'https://capgo.test/app/cancel',
    }))
  })

  it('rejects external success URLs for checkout', async () => {
    const createSession = vi.fn()
    const stripeClient = {
      prices: {
        search: vi.fn().mockResolvedValue({ data: createPriceList() }),
      },
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.spyOn(stripe, 'getStripe').mockReturnValue(stripeClient)

    const response = await stripe.createCheckout(
      createContext(),
      'cus_123',
      'month',
      'plan_test',
      'https://example.com/phishing',
      '/app/cancel',
    ).catch(error => error)

    expect(response.cause).toMatchObject({ error: 'invalid_redirect_url' })
    expect(response.status).toBe(400)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects external cancel URLs for one-time checkout', async () => {
    const createSession = vi.fn()
    const stripeClient = {
      prices: {
        search: vi.fn().mockResolvedValue({ data: createPriceList('one_time', 'one_time') }),
      },
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.spyOn(stripe, 'getStripe').mockReturnValue(stripeClient)

    const response = await stripe.createOneTimeCheckout(
      createContext(),
      'cus_123',
      'prod_123',
      1,
      '/app/success',
      'https://example.com/phishing',
    ).catch(error => error)

    expect(response).toBeInstanceOf(Error)
    expect(response.cause).toMatchObject({ error: 'invalid_redirect_url' })
    expect(response.status).toBe(400)
    expect(createSession).not.toHaveBeenCalled()
  })
})
