import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  cloudlogErrMock,
  cloudlogMock,
} = vi.hoisted(() => ({
  cloudlogErrMock: vi.fn(),
  cloudlogMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: cloudlogErrMock,
}))

const mockContext = {
  get: (key: string) => key === 'requestId' ? 'req-stripe-event-log' : undefined,
} as any

afterEach(() => {
  cloudlogErrMock.mockReset()
  cloudlogMock.mockReset()
  vi.resetModules()
})

describe('stripe event logging', () => {
  it('logs safe event metadata without retaining customer payload values', async () => {
    const { extractDataEvent } = await import('../supabase/functions/_backend/utils/stripe_event.ts')

    const event = {
      api_version: '2024-04-10',
      created: 1_711_925_200,
      data: {
        object: {
          id: 'cus_private_123',
          object: 'customer',
          email: 'billing-owner@example.com',
          name: 'Billing Owner',
          metadata: {
            invite_code: 'private-invite-code',
          },
        },
      },
      id: 'evt_safe_metadata',
      livemode: true,
      type: 'customer.updated',
    } as any

    const stripeData = extractDataEvent(mockContext, event)

    expect(stripeData.data.customer_id).toBe('cus_private_123')
    expect(cloudlogMock).toHaveBeenCalledWith({
      requestId: 'req-stripe-event-log',
      message: 'stripe event received',
      eventId: 'evt_safe_metadata',
      eventType: 'customer.updated',
      objectType: 'customer',
      apiVersion: '2024-04-10',
      livemode: true,
      created: 1_711_925_200,
      hasPreviousAttributes: false,
    })

    const loggedPayload = JSON.stringify(cloudlogMock.mock.calls)
    expect(loggedPayload).not.toContain('billing-owner@example.com')
    expect(loggedPayload).not.toContain('Billing Owner')
    expect(loggedPayload).not.toContain('private-invite-code')
    expect(loggedPayload).not.toContain('cus_private_123')
  })

  it('keeps fallback event logs metadata-only for unsupported event types', async () => {
    const { extractDataEvent } = await import('../supabase/functions/_backend/utils/stripe_event.ts')

    const event = {
      created: 1_711_925_201,
      data: {
        object: {
          id: 'src_private_456',
          object: 'source',
          owner: {
            email: 'source-owner@example.com',
          },
        },
      },
      id: 'evt_other_metadata',
      livemode: false,
      type: 'source.chargeable',
    } as any

    extractDataEvent(mockContext, event)

    expect(cloudlogErrMock).toHaveBeenCalledWith({
      requestId: 'req-stripe-event-log',
      message: 'Other event',
      eventId: 'evt_other_metadata',
      eventType: 'source.chargeable',
      objectType: 'source',
      apiVersion: undefined,
      livemode: false,
      created: 1_711_925_201,
      hasPreviousAttributes: false,
    })

    const loggedPayload = JSON.stringify([
      ...cloudlogMock.mock.calls,
      ...cloudlogErrMock.mock.calls,
    ])
    expect(loggedPayload).not.toContain('source-owner@example.com')
    expect(loggedPayload).not.toContain('src_private_456')
  })
})
