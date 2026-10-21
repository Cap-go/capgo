import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findLatestOpenSubscriptionInvoice: vi.fn(),
  getActiveSubscriptionId: vi.fn(),
  syncSubscriptionData: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/stripe.ts', () => ({
  findLatestOpenSubscriptionInvoice: mocks.findLatestOpenSubscriptionInvoice,
  getActiveSubscriptionId: mocks.getActiveSubscriptionId,
  getStripe: vi.fn(),
  syncSubscriptionData: mocks.syncSubscriptionData,
}))

const {
  parseCancelComment,
  parseCancelFeedback,
  payOpenInvoice,
  scheduleSubscriptionCancel,
  setDefaultPaymentMethodFromIntent,
} = await import('../supabase/functions/_backend/utils/stripe_in_app.ts')

function createContext() {
  return { get: (key: string) => key === 'requestId' ? 'request-id' : undefined } as any
}

function createStripe() {
  return {
    customers: { update: vi.fn() },
    invoicePayments: { list: vi.fn() },
    invoices: { pay: vi.fn() },
    paymentIntents: { retrieve: vi.fn(), update: vi.fn() },
    paymentMethods: { attach: vi.fn(), retrieve: vi.fn() },
    setupIntents: { retrieve: vi.fn() },
    subscriptions: { retrieve: vi.fn(), update: vi.fn() },
  }
}

function createBillingContext(stripe = createStripe()) {
  return { customerId: 'cus_123', billingAccount: 'ee' as const, stripe: stripe as any, publishableKey: 'pk_test_123' }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cancel reason parsing', () => {
  it('accepts Stripe feedback values only', () => {
    expect(parseCancelFeedback('too_expensive')).toBe('too_expensive')
    expect(() => parseCancelFeedback('because')).toThrow()
    expect(() => parseCancelFeedback(undefined)).toThrow()
  })

  it('trims and caps the optional comment', () => {
    expect(parseCancelComment('  ')).toBeUndefined()
    expect(parseCancelComment(undefined)).toBeUndefined()
    expect(parseCancelComment(' Too pricey ')).toBe('Too pricey')
    expect(parseCancelComment('x'.repeat(2000))).toHaveLength(1000)
    expect(() => parseCancelComment(42)).toThrow()
  })
})

describe('scheduleSubscriptionCancel', () => {
  it('cancels at period end and stores the reason on the subscription', async () => {
    const stripe = createStripe()
    mocks.getActiveSubscriptionId.mockResolvedValue('sub_123')
    stripe.subscriptions.retrieve.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: true,
      cancel_at: 1_900_000_000,
      items: { data: [{ current_period_end: 1_900_000_000 }] },
    })

    const summary = await scheduleSubscriptionCancel(createContext(), createBillingContext(stripe), 'missing_features', 'Need SSO')

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_123', {
      cancel_at_period_end: true,
      cancellation_details: { feedback: 'missing_features', comment: 'Need SSO' },
    })
    expect(mocks.syncSubscriptionData).toHaveBeenCalledWith(expect.anything(), 'cus_123', 'sub_123')
    expect(summary).toMatchObject({ cancelAtPeriodEnd: true, cancelAt: new Date(1_900_000_000_000).toISOString() })
  })

  it('refuses when there is no active subscription', async () => {
    mocks.getActiveSubscriptionId.mockResolvedValue(null)
    await expect(scheduleSubscriptionCancel(createContext(), createBillingContext(), 'unused')).rejects.toThrow()
  })
})

describe('setDefaultPaymentMethodFromIntent', () => {
  it('rejects a SetupIntent that belongs to another customer', async () => {
    const stripe = createStripe()
    stripe.setupIntents.retrieve.mockResolvedValue({ customer: 'cus_other', status: 'succeeded', payment_method: 'pm_1' })

    await expect(setDefaultPaymentMethodFromIntent(createContext(), createBillingContext(stripe), 'seti_123')).rejects.toThrow()
    expect(stripe.customers.update).not.toHaveBeenCalled()
  })

  it('rejects ids that are not Stripe intents', async () => {
    await expect(setDefaultPaymentMethodFromIntent(createContext(), createBillingContext(), 'pm_123')).rejects.toThrow()
  })

  it('sets the card as customer and subscription default', async () => {
    const stripe = createStripe()
    stripe.setupIntents.retrieve.mockResolvedValue({ customer: 'cus_123', status: 'succeeded', payment_method: 'pm_1' })
    stripe.paymentMethods.retrieve.mockResolvedValue({ id: 'pm_1', customer: 'cus_123', card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2030 } })
    mocks.getActiveSubscriptionId.mockResolvedValue('sub_123')

    const card = await setDefaultPaymentMethodFromIntent(createContext(), createBillingContext(stripe), 'seti_123')

    expect(stripe.paymentMethods.attach).not.toHaveBeenCalled()
    expect(stripe.customers.update).toHaveBeenCalledWith('cus_123', { invoice_settings: { default_payment_method: 'pm_1' } })
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_123', { default_payment_method: 'pm_1' })
    expect(card).toEqual({ id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 4, expYear: 2030 })
  })
})

describe('payOpenInvoice', () => {
  it('reports paid when the saved card succeeds', async () => {
    const stripe = createStripe()
    mocks.findLatestOpenSubscriptionInvoice.mockResolvedValue({ id: 'in_123' })
    stripe.invoices.pay.mockResolvedValue({ status: 'paid' })

    await expect(payOpenInvoice(createContext(), createBillingContext(stripe))).resolves.toEqual({ status: 'paid' })
  })

  it('returns the PaymentIntent secret when 3DS is required', async () => {
    const stripe = createStripe()
    mocks.findLatestOpenSubscriptionInvoice.mockResolvedValue({ id: 'in_123' })
    stripe.invoices.pay.mockRejectedValue(Object.assign(new Error('requires action'), { code: 'invoice_payment_intent_requires_action' }))
    stripe.invoicePayments.list.mockResolvedValue({ data: [{ status: 'open', payment: { payment_intent: 'pi_123' } }] })
    stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_123', status: 'requires_action', client_secret: 'pi_123_secret' })

    await expect(payOpenInvoice(createContext(), createBillingContext(stripe))).resolves.toEqual({
      status: 'requires_action',
      clientSecret: 'pi_123_secret',
      publishableKey: 'pk_test_123',
    })
  })

  it('asks for a new card when the saved card is declined', async () => {
    const stripe = createStripe()
    mocks.findLatestOpenSubscriptionInvoice.mockResolvedValue({ id: 'in_123' })
    stripe.invoices.pay.mockRejectedValue(Object.assign(new Error('Your card was declined.'), { code: 'card_declined' }))

    await expect(payOpenInvoice(createContext(), createBillingContext(stripe))).resolves.toEqual({
      status: 'requires_payment_method',
      message: 'Your card was declined.',
    })
  })
})
