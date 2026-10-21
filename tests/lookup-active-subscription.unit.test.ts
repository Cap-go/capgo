import { afterEach, describe, expect, it, vi } from 'vitest'

function mockStripeInfo(result: { data: unknown, error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  } as any
}

describe('lookupActiveSubscriptionId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks known false when stripe_info read fails', async () => {
    const adminModule = await import('../supabase/functions/_backend/utils/supabase.ts')
    const stripeModule = await import('../supabase/functions/_backend/utils/stripe.ts')
    const spy = vi.spyOn(adminModule, 'supabaseAdmin').mockReturnValue(mockStripeInfo({
      data: null,
      error: { message: 'connection refused' },
    }))

    try {
      const result = await stripeModule.lookupActiveSubscriptionId({ get: () => 'request-id' } as any, 'cus_123')
      expect(result).toEqual({ subscriptionId: null, known: false })
    }
    finally {
      spy.mockRestore()
    }
  })

  it('marks known true when there is no active subscription row', async () => {
    const adminModule = await import('../supabase/functions/_backend/utils/supabase.ts')
    const stripeModule = await import('../supabase/functions/_backend/utils/stripe.ts')
    const spy = vi.spyOn(adminModule, 'supabaseAdmin').mockReturnValue(mockStripeInfo({ data: null, error: null }))

    try {
      const result = await stripeModule.lookupActiveSubscriptionId({ get: () => 'request-id' } as any, 'cus_123')
      expect(result).toEqual({ subscriptionId: null, known: true })
    }
    finally {
      spy.mockRestore()
    }
  })

  it('returns the active subscription id when the row is live', async () => {
    const adminModule = await import('../supabase/functions/_backend/utils/supabase.ts')
    const stripeModule = await import('../supabase/functions/_backend/utils/stripe.ts')
    const spy = vi.spyOn(adminModule, 'supabaseAdmin').mockReturnValue(mockStripeInfo({
      data: { subscription_id: 'sub_live', status: 'active' },
      error: null,
    }))

    try {
      const result = await stripeModule.lookupActiveSubscriptionId({ get: () => 'request-id' } as any, 'cus_123')
      expect(result).toEqual({ subscriptionId: 'sub_live', known: true })
    }
    finally {
      spy.mockRestore()
    }
  })

  it.each(['canceled', 'deleted'] as const)('marks known true with no id when status is %s', async (status) => {
    const adminModule = await import('../supabase/functions/_backend/utils/supabase.ts')
    const stripeModule = await import('../supabase/functions/_backend/utils/stripe.ts')
    const spy = vi.spyOn(adminModule, 'supabaseAdmin').mockReturnValue(mockStripeInfo({
      data: { subscription_id: 'sub_old', status },
      error: null,
    }))

    try {
      const result = await stripeModule.lookupActiveSubscriptionId({ get: () => 'request-id' } as any, 'cus_123')
      expect(result).toEqual({ subscriptionId: null, known: true })
    }
    finally {
      spy.mockRestore()
    }
  })
})
