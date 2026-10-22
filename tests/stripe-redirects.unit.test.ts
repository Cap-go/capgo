import Stripe from 'stripe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockedEnv: Record<string, string> = {
  ENV: 'local',
  WEBAPP_URL: 'https://capgo.test',
  STRIPE_SECRET_KEY: 'sk_test_123',
}
const { mockedSupabaseAdmin, mockedOrgLookup, mockedPlanLookup, mockedSendEventToTracking } = vi.hoisted(() => ({
  mockedSupabaseAdmin: vi.fn(),
  mockedOrgLookup: vi.fn(),
  mockedPlanLookup: vi.fn(),
  mockedSendEventToTracking: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/tracking.ts', () => ({
  sendEventToTracking: mockedSendEventToTracking,
}))

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
  MockStripe.errors = {
    StripeAuthenticationError: class StripeAuthenticationError extends Error {},
    StripeInvalidRequestError: class StripeInvalidRequestError extends Error {},
    StripePermissionError: class StripePermissionError extends Error {},
    StripeRateLimitError: class StripeRateLimitError extends Error {},
  }
  return { default: MockStripe }
})

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: mockedSupabaseAdmin,
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

function mockBillingAccountLookup(billingAccount = 'ee') {
  mockedOrgLookup.mockResolvedValue({ data: { id: 'org_123', name: 'Demo Org', stripe_info: { product_id: 'prod_current' } }, error: null })
  mockedPlanLookup.mockResolvedValue({ data: null, error: null })
  mockedSupabaseAdmin.mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockedOrgLookup,
          maybeSingle: vi.fn().mockResolvedValue({
            data: { billing_account: billingAccount },
            error: null,
          }),
        }),
        or: vi.fn().mockImplementation((filter: string) => ({ maybeSingle: () => mockedPlanLookup(filter) })),
      }),
    }),
  })
}

afterEach(() => {
  delete mockedEnv.STRIPE_API_BASE_URL
  delete mockedEnv.STRIPE_PUBLISHABLE_KEY
  mockedEnv.ENV = 'local'
  mockedEnv.STRIPE_SECRET_KEY = 'sk_test_123'
  mockedSupabaseAdmin.mockReset()
  mockedOrgLookup.mockReset()
  mockedPlanLookup.mockReset()
  mockedSendEventToTracking.mockReset()
  vi.restoreAllMocks()
})

describe('checkout recovery Bento signals', () => {
  beforeEach(() => {
    mockBillingAccountLookup()
    mockedPlanLookup.mockImplementation((filter: string) => Promise.resolve({
      data: filter.includes('prod_current') ? { name: 'Maker' } : { name: 'Team', stripe_id: 'prod_test', price_m: 99, price_y: 999 },
      error: null,
    }))
  })

  async function startCheckout(credits = false, embedded = false, failure?: Error, recurrence = 'month') {
    mockedEnv.STRIPE_PUBLISHABLE_KEY = 'pk_test_123'
    const createSession = vi.fn().mockResolvedValue({ id: 'cs_test_recovery', url: 'https://pay.capgo.test/pay', client_secret: 'secret' })
    if (failure)
      createSession.mockRejectedValue(failure)
    vi.mocked(Stripe).mockImplementation(function () {
      return {
        prices: { list: vi.fn().mockResolvedValue({ data: createPriceList(recurrence, credits ? 'one_time' : 'recurring') }) },
        checkout: { sessions: { create: createSession } },
      }
    } as any)
    const { createCheckout, createOneTimeCheckout } = await import('../supabase/functions/_backend/utils/stripe.ts')
    return credits
      ? createOneTimeCheckout(createContext(), 'cus_123', 'prod_test', 50, '/app/success', '/app/cancel', 'untrusted_reference', undefined, undefined, embedded)
      : createCheckout(createContext(), 'cus_123', recurrence, 'prod_test', '/app/success', '/app/cancel', { embedded })
  }

  it.each([
    { credits: false, embedded: false, recurrence: 'month' },
    { credits: false, embedded: true, recurrence: 'month' },
    { credits: false, embedded: true, recurrence: 'year' },
    { credits: true, embedded: false, recurrence: 'one_time' },
    { credits: true, embedded: true, recurrence: 'one_time' },
  ])('sends the existing event for $credits credits / $embedded embedded / $recurrence checkout', async ({ credits, embedded, recurrence }) => {
    await startCheckout(credits, embedded, undefined, recurrence)

    expect(mockedSendEventToTracking).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({
      groups: { organization: 'org_123' },
      sentToBento: true,
      bento: expect.objectContaining({
        event: 'user:checkout_started',
        preferenceKey: 'credit_usage',
        audience: 'billing',
        data: expect.objectContaining({
          org_id: 'org_123',
          org_name: 'Demo Org',
          product_id: 'prod_test',
          recurrence,
          plan_name: credits ? '' : 'Team',
          plan_type: credits ? 'one_time' : recurrence === 'year' ? 'yearly' : 'monthly',
          current_plan_name: 'Maker',
          plan_price: credits ? 0 : recurrence === 'year' ? 999 : 99,
          plan_price_monthly: credits ? 0 : 99,
          plan_price_yearly: credits ? 0 : 999,
          checkout_source: credits ? 'credits' : 'plans',
          checkout_session_id: 'cs_test_recovery',
        }),
      }),
    }), { posthog: false })
    expect(JSON.stringify(mockedSendEventToTracking.mock.calls)).not.toContain('client_secret')
  })

  it.each([false, true])('does not signal a failed checkout (credits: %s)', async (credits) => {
    await expect(startCheckout(credits, false, new Error('Stripe unavailable'))).rejects.toThrow('Stripe unavailable')
    expect(mockedSendEventToTracking).not.toHaveBeenCalled()
  })

  it('keeps checkout usable when Bento fails', async () => {
    mockedSendEventToTracking.mockRejectedValue(new Error('Bento unavailable'))
    await expect(startCheckout()).resolves.toEqual({ url: 'https://pay.capgo.test/pay' })
  })

  it('skips the signal when the customer organization cannot be resolved', async () => {
    mockedOrgLookup.mockResolvedValue({ data: null, error: new Error('lookup failed') })
    await expect(startCheckout()).resolves.toEqual({ url: 'https://pay.capgo.test/pay' })
    expect(mockedSendEventToTracking).not.toHaveBeenCalled()
  })

  it('does not signal when only putting a card on file', async () => {
    const { createCardSetupIntent } = await import('../supabase/functions/_backend/utils/stripe_in_app.ts')
    const create = vi.fn().mockResolvedValue({ client_secret: 'setup_secret' })
    await createCardSetupIntent({ customerId: 'cus_123', billingAccount: 'ee', publishableKey: 'pk_test_123', stripe: { setupIntents: { create } } as any })
    expect(create).toHaveBeenCalledOnce()
    expect(mockedSendEventToTracking).not.toHaveBeenCalled()
  })
})

describe('stripe redirect URL allowlist', () => {
  beforeEach(() => {
    mockBillingAccountLookup()
  })

  it('allows same-origin return URLs for billing portal', async () => {
    const createSession = vi.fn().mockResolvedValue({ url: 'https://pay.capgo.test/p/session' })
    const stripeClient = {
      billingPortal: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { createPortal } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const result = await createPortal(createContext(), 'cus_123', '/app/usage')

    expect(result.url).toBe('https://pay.capgo.test/p/session')
    expect(createSession).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://capgo.test/app/usage',
    })
  })

  it('returns empty portal url when stripe is not configured for the billing account', async () => {
    mockedEnv.STRIPE_SECRET_KEY = ''

    const createSession = vi.fn()
    vi.mocked(Stripe).mockImplementation(function () {
      return {
        billingPortal: {
          sessions: { create: createSession },
        },
      } as any
    } as any)

    const { createPortal } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const result = await createPortal(createContext(), 'cus_123', '/app/usage')

    expect(result.url).toBe('')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('fails loudly when a US customer has no US Stripe key', async () => {
    mockBillingAccountLookup('us')
    const createSession = vi.fn()
    vi.mocked(Stripe).mockImplementation(function () {
      return {
        billingPortal: {
          sessions: { create: createSession },
        },
      } as any
    } as any)

    const { createPortal, createCheckout, cancelSubscription } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const { BillingAccountUnavailableError } = await import('../supabase/functions/_backend/utils/stripe_billing.ts')

    const portalError = await createPortal(createContext(), 'cus_us', '/app/usage').catch(error => error)
    expect(portalError.cause).toMatchObject({ error: 'billing_account_unavailable' })
    const checkoutError = await createCheckout(createContext(), 'cus_us', 'month', 'prod_test', '/app/usage', '/app/usage').catch(error => error)
    expect(checkoutError.cause).toMatchObject({ error: 'billing_account_unavailable' })
    await expect(cancelSubscription(createContext(), 'cus_us')).rejects.toBeInstanceOf(BillingAccountUnavailableError)
    expect(createSession).not.toHaveBeenCalled()
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

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { createPortal } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const response = await createPortal(createContext(), 'cus_123', 'https://example.com/phishing').catch(error => error)

    expect(response).toBeInstanceOf(Error)
    expect(response.cause).toMatchObject({ error: 'invalid_redirect_url' })
    expect(response.status).toBe(400)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('allows same-origin success and cancel URLs for checkout', async () => {
    const createSession = vi.fn().mockResolvedValue({ url: 'https://pay.capgo.test/p/pay' })
    const stripeClient = {
      prices: {
        list: vi.fn().mockResolvedValue({ data: createPriceList() }),
      },
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { createCheckout } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const result = await createCheckout(
      createContext(),
      'cus_123',
      'month',
      'prod_test',
      '/app/success',
      '/app/cancel',
      {
        clientReferenceId: 'org_123',
        attributionId: 'legacy_visitor_123',
        datafastAttribution: {
          visitorId: 'visitor_123',
          sessionId: 'session_123',
        },
        affonsoReferral: 'affonso_ref_123',
      },
    )

    expect(result.url).toBe('https://pay.capgo.test/p/pay')
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      allow_promotion_codes: true,
      success_url: 'https://capgo.test/app/success?success=true',
      cancel_url: 'https://capgo.test/app/cancel',
      client_reference_id: 'org_123',
      saved_payment_method_options: {
        allow_redisplay_filters: ['always', 'limited', 'unspecified'],
      },
      metadata: {
        attribution_id: 'legacy_visitor_123',
        datafast_visitor_id: 'visitor_123',
        datafast_session_id: 'session_123',
        affonso_referral: 'affonso_ref_123',
      },
    }))
  })

  it('creates an embedded checkout session when a publishable key is configured', async () => {
    mockedEnv.STRIPE_PUBLISHABLE_KEY = 'pk_test_123'
    const createSession = vi.fn().mockResolvedValue({ id: 'cs_test_123', url: null, client_secret: 'cs_test_123_secret' })
    vi.mocked(Stripe).mockImplementation(function () {
      return {
        prices: { list: vi.fn().mockResolvedValue({ data: createPriceList() }) },
        checkout: { sessions: { create: createSession } },
      }
    } as any)

    const { createCheckout } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const result = await createCheckout(createContext(), 'cus_123', 'month', 'prod_test', '/app/success', '/app/cancel', { embedded: true })

    expect(result).toEqual({ url: null, clientSecret: 'cs_test_123_secret', publishableKey: 'pk_test_123', sessionId: 'cs_test_123' })
    const params = createSession.mock.calls[0][0]
    expect(params).toMatchObject({
      ui_mode: 'embedded_page',
      redirect_on_completion: 'if_required',
      return_url: 'https://capgo.test/app/success?success=true&session_id={CHECKOUT_SESSION_ID}',
    })
    expect(params).not.toHaveProperty('success_url')
    expect(params).not.toHaveProperty('cancel_url')
  })

  it('keeps hosted checkout when embedded is requested without a publishable key', async () => {
    const createSession = vi.fn().mockResolvedValue({ id: 'cs_test_123', url: 'https://pay.capgo.test/p/pay' })
    vi.mocked(Stripe).mockImplementation(function () {
      return {
        prices: { list: vi.fn().mockResolvedValue({ data: createPriceList() }) },
        checkout: { sessions: { create: createSession } },
      }
    } as any)

    const { createCheckout } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const result = await createCheckout(createContext(), 'cus_123', 'month', 'prod_test', '/app/success', '/app/cancel', { embedded: true })

    expect(result).toEqual({ url: 'https://pay.capgo.test/p/pay' })
    expect(createSession.mock.calls[0][0]).not.toHaveProperty('ui_mode')
  })

  it('keeps the credit session placeholder on embedded one-time checkout', async () => {
    mockedEnv.STRIPE_PUBLISHABLE_KEY = 'pk_test_123'
    const createSession = vi.fn().mockResolvedValue({ id: 'cs_test_456', url: null, client_secret: 'cs_test_456_secret' })
    vi.mocked(Stripe).mockImplementation(function () {
      return {
        prices: { list: vi.fn().mockResolvedValue({ data: createPriceList('month', 'one_time') }) },
        checkout: { sessions: { create: createSession } },
      }
    } as any)

    const { createOneTimeCheckout } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const result = await createOneTimeCheckout(createContext(), 'cus_123', 'prod_credit', 50, '/settings/organization/credits?creditCheckout=success&session_id={CHECKOUT_SESSION_ID}', '/settings/organization/credits', 'org_123', undefined, undefined, true)

    expect(result.clientSecret).toBe('cs_test_456_secret')
    expect(createSession.mock.calls[0][0].return_url).toBe('https://capgo.test/settings/organization/credits?creditCheckout=success&session_id={CHECKOUT_SESSION_ID}&success=true')
  })

  it('rejects external success URLs for checkout', async () => {
    const createSession = vi.fn()
    const stripeClient = {
      prices: {
        list: vi.fn().mockResolvedValue({ data: createPriceList() }),
      },
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { createCheckout } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const response = await createCheckout(
      createContext(),
      'cus_123',
      'month',
      'prod_test',
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
        list: vi.fn().mockResolvedValue({ data: createPriceList('one_time', 'one_time') }),
      },
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { createOneTimeCheckout } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const response = await createOneTimeCheckout(
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

  it.each([
    ['a custom loopback base URL', 'http://127.0.0.1:4510', 'sk_test_123', '127.0.0.1', 4510],
    ['host.docker.internal for the Playwright emulator', 'http://host.docker.internal:4520', 'sk_test_emulator', 'host.docker.internal', 4520],
  ])('uses %s as the Stripe API base URL', async (_label, baseUrl, secretKey, host, port) => {
    mockedEnv.STRIPE_API_BASE_URL = baseUrl
    mockedEnv.STRIPE_SECRET_KEY = secretKey
    vi.mocked(Stripe).mockImplementation(function () {
      return { checkout: { sessions: {} } }
    } as any)

    const { getStripe } = await import('../supabase/functions/_backend/utils/stripe.ts')
    getStripe(createContext())

    expect(Stripe).toHaveBeenCalledWith(secretKey, expect.objectContaining({ host, port, protocol: 'http' }))
  })

  it.each([
    ['live credentials', 'http://host.docker.internal:4520', 'sk_live_123', 'local', 'STRIPE_API_BASE_URL must use https when using live Stripe credentials'],
    ['host.docker.internal outside local emulator config', 'http://host.docker.internal:4520', 'sk_test_123', 'production', 'STRIPE_API_BASE_URL host.docker.internal is only allowed for local emulator config'],
    ['non-loopback hosts', 'http://stripe.example.com', 'sk_test_123', 'local', 'STRIPE_API_BASE_URL must use https for non-loopback hosts'],
  ])('rejects an http Stripe API base URL for %s', async (_label, baseUrl, secretKey, envName, message) => {
    mockedEnv.STRIPE_API_BASE_URL = baseUrl
    mockedEnv.STRIPE_SECRET_KEY = secretKey
    mockedEnv.ENV = envName

    const { getStripe } = await import('../supabase/functions/_backend/utils/stripe.ts')
    expect(() => getStripe(createContext())).toThrow(message)
  })

  it('falls back to checkout metadata for credit top-ups when line items are unavailable in emulator mode', async () => {
    mockedEnv.STRIPE_API_BASE_URL = 'http://127.0.0.1:4510'

    const listLineItems = vi.fn().mockRejectedValue(new Error('line_items endpoint unavailable'))
    const stripeClient = {
      checkout: {
        sessions: {
          listLineItems,
        },
      },
    } as any

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { getCreditCheckoutDetails } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const details = await getCreditCheckoutDetails(
      createContext(),
      {
        id: 'cs_test_123',
        metadata: {
          productId: 'prod_credit_123',
          intendedQuantity: '75',
        },
      } as any,
      'prod_credit_123',
    )

    expect(listLineItems).toHaveBeenCalledWith('cs_test_123', {
      expand: ['data.price.product'],
      limit: 100,
    })
    expect(details).toEqual({
      creditQuantity: 75,
      itemsSummary: [
        {
          id: null,
          quantity: 75,
          priceId: null,
          productId: 'prod_credit_123',
        },
      ],
    })
  })

  it('disables adjustable quantity for emulator-backed one-time checkout sessions', async () => {
    mockedEnv.STRIPE_API_BASE_URL = 'http://127.0.0.1:4510'

    const createSession = vi.fn().mockResolvedValue({ url: 'https://pay.capgo.test/p/pay' })
    const stripeClient = {
      prices: {
        list: vi.fn().mockResolvedValue({ data: createPriceList('one_time', 'one_time') }),
      },
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { createOneTimeCheckout } = await import('../supabase/functions/_backend/utils/stripe.ts')
    await createOneTimeCheckout(
      createContext(),
      'cus_123',
      'prod_123',
      5,
      '/app/success',
      '/app/cancel',
      'org_123',
      {
        visitorId: 'visitor_456',
        sessionId: 'session_456',
      },
      'affonso_ref_456',
    )

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      saved_payment_method_options: {
        allow_redisplay_filters: ['always', 'limited', 'unspecified'],
      },
      line_items: [
        expect.not.objectContaining({
          adjustable_quantity: expect.anything(),
        }),
      ],
      metadata: expect.objectContaining({
        datafast_visitor_id: 'visitor_456',
        datafast_session_id: 'session_456',
        affonso_referral: 'affonso_ref_456',
        intendedQuantity: '5',
        orgId: 'org_123',
      }),
    }))
  })

  it('falls back to stored plan price ids when the Stripe emulator omits recurring metadata', async () => {
    mockedEnv.STRIPE_API_BASE_URL = 'http://127.0.0.1:4510'

    mockedSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                price_m_id: 'price_monthly_from_plan',
                price_y_id: 'price_yearly_from_plan',
              },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { billing_account: 'ee' },
              error: null,
            }),
          }),
          or: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                stripe_id: 'prod_test',
                price_m_id: 'price_monthly_from_plan',
                price_y_id: 'price_yearly_from_plan',
              },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                stripe_id: 'prod_test',
                price_m_id: 'price_monthly_from_plan',
                price_y_id: 'price_yearly_from_plan',
              },
              error: null,
            }),
          }),
        }),
      }),
    })

    const createSession = vi.fn().mockResolvedValue({ url: 'https://pay.capgo.test/p/subscription' })
    const stripeClient = {
      prices: {
        list: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'price_missing_recurring_metadata',
              active: true,
              type: 'recurring',
            },
          ],
        }),
      },
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as any

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { createCheckout } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const result = await createCheckout(
      createContext(),
      'cus_123',
      'month',
      'prod_test',
      '/app/success',
      '/app/cancel',
    )

    expect(result.url).toBe('https://pay.capgo.test/p/subscription')
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [
        expect.objectContaining({
          price: 'price_monthly_from_plan',
          quantity: 1,
        }),
      ],
    }))
  })

  it('updates Stripe customer email without overwriting the organization name', async () => {
    const updateCustomer = vi.fn().mockResolvedValue({ id: 'cus_123' })
    const stripeClient = {
      customers: {
        update: updateCustomer,
      },
    } as any

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { updateCustomerEmail } = await import('../supabase/functions/_backend/utils/stripe.ts')
    await updateCustomerEmail(createContext(), 'cus_123', 'billing@capgo.app')

    expect(updateCustomer).toHaveBeenCalledWith('cus_123', {
      email: 'billing@capgo.app',
      metadata: {
        email: 'billing@capgo.app',
      },
    })
  })

  it('updates Stripe customer name when the organization name changes', async () => {
    const updateCustomer = vi.fn().mockResolvedValue({ id: 'cus_123' })
    const stripeClient = {
      customers: {
        update: updateCustomer,
      },
    } as any

    vi.mocked(Stripe).mockImplementation(function () {
      return stripeClient
    } as any)

    const { updateCustomerOrganizationName } = await import('../supabase/functions/_backend/utils/stripe.ts')
    await updateCustomerOrganizationName(createContext(), 'cus_123', 'Capgo Org')

    expect(updateCustomer).toHaveBeenCalledWith('cus_123', {
      name: 'Capgo Org',
    })
  })

  it('treats Stripe rate-limit errors as deterministic customer update failures', async () => {
    const { isDeterministicStripeCustomerUpdateError } = await import('../supabase/functions/_backend/utils/stripe.ts')
    const rateLimitError = new Stripe.errors.StripeRateLimitError({ message: 'rate limited' } as any)

    expect(isDeterministicStripeCustomerUpdateError(rateLimitError)).toBe(true)
  })
})
