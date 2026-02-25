import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Shared mock functions that can be accessed by tests
const mockBillingPortalSessionsCreate = vi.fn()
const mockCheckoutSessionsCreate = vi.fn()
const mockPricesSearch = vi.fn()

// Must mock stripe BEFORE importing the stripe module
// This is needed because stripe.ts calls Stripe.createFetchHttpClient() in getStripe
vi.mock('stripe', () => {
  return {
    __esModule: true,
    default: class MockStripe {
      static createFetchHttpClient = vi.fn().mockReturnValue({})
      
      billingPortal = {
        sessions: {
          create: mockBillingPortalSessionsCreate,
        },
      }
      checkout = {
        sessions: {
          create: mockCheckoutSessionsCreate,
        },
      }
      prices = {
        search: mockPricesSearch,
      }
    },
  }
})

vi.mock('hono/adapter', () => ({
  env: () => ({
    WEBAPP_URL: 'https://capgo.test',
    STRIPE_SECRET_KEY: 'sk_test_123',
  }),
  getRuntimeKey: () => 'node',
}))

import * as stripe from '../supabase/functions/_backend/utils/stripe.ts'

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

beforeEach(() => {
  // Reset mocks before each test
  mockBillingPortalSessionsCreate.mockReset()
  mockCheckoutSessionsCreate.mockReset()
  mockPricesSearch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stripe redirect URL allowlist', () => {
  it('allows same-origin return URLs for billing portal', async () => {
    mockBillingPortalSessionsCreate.mockResolvedValue({ url: 'https://pay.capgo.test/p/session' })

    const result = await stripe.createPortal(createContext(), 'cus_123', '/app/usage')

    expect(result.url).toBe('https://pay.capgo.test/p/session')
    expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://capgo.test/app/usage',
    })
  })

  it('rejects external return URLs for billing portal', async () => {
    mockBillingPortalSessionsCreate.mockImplementation(() => {
      throw new Error('Should not be called')
    })

    const response = await stripe.createPortal(createContext(), 'cus_123', 'https://example.com/phishing').catch(error => error)

    expect(response).toBeInstanceOf(Error)
    expect(response.cause).toMatchObject({ error: 'invalid_redirect_url' })
    expect(response.status).toBe(400)
    expect(mockBillingPortalSessionsCreate).not.toHaveBeenCalled()
  })

  it('allows same-origin success and cancel URLs for checkout', async () => {
    mockCheckoutSessionsCreate.mockResolvedValue({ url: 'https://pay.capgo.test/p/pay' })
    mockPricesSearch.mockResolvedValue({ data: createPriceList() })

    const result = await stripe.createCheckout(
      createContext(),
      'cus_123',
      'month',
      'plan_test',
      '/app/success',
      '/app/cancel',
    )

    expect(result.url).toBe('https://pay.capgo.test/p/pay')
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      success_url: 'https://capgo.test/app/success?success=true',
      cancel_url: 'https://capgo.test/app/cancel',
    }))
  })

  it('rejects external success URLs for checkout', async () => {
    mockCheckoutSessionsCreate.mockImplementation(() => {
      throw new Error('Should not be called')
    })
    mockPricesSearch.mockResolvedValue({ data: createPriceList() })

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
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled()
  })

  it('rejects external cancel URLs for one-time checkout', async () => {
    mockCheckoutSessionsCreate.mockImplementation(() => {
      throw new Error('Should not be called')
    })
    mockPricesSearch.mockResolvedValue({ data: createPriceList('one_time', 'one_time') })

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
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled()
  })
})
