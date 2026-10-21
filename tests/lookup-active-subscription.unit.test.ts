import { afterEach, describe, expect, it, vi } from 'vitest'

describe('lookupActiveSubscriptionId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks known false when stripe_info read fails', async () => {
    const adminModule = await import('../supabase/functions/_backend/utils/supabase.ts')
    const stripeModule = await import('../supabase/functions/_backend/utils/stripe.ts')
    const spy = vi.spyOn(adminModule, 'supabaseAdmin').mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'connection refused' } }),
          }),
        }),
      }),
    } as any)

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
    const spy = vi.spyOn(adminModule, 'supabaseAdmin').mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    try {
      const result = await stripeModule.lookupActiveSubscriptionId({ get: () => 'request-id' } as any, 'cus_123')
      expect(result).toEqual({ subscriptionId: null, known: true })
    }
    finally {
      spy.mockRestore()
    }
  })
})
