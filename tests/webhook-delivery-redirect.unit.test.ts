import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCloudlog, mockCloudlogErr, mockGetEnv } = vi.hoisted(() => ({
  mockCloudlog: vi.fn(),
  mockCloudlogErr: vi.fn(),
  mockGetEnv: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: mockCloudlog,
  cloudlogErr: mockCloudlogErr,
  serializeError: vi.fn((error: unknown) => error),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: mockGetEnv,
}))

vi.mock('../supabase/functions/_backend/utils/publicUrl.ts', () => ({
  getPublicHostnameValidationError: vi.fn().mockResolvedValue(null),
  getPublicUrlSyntaxValidationError: vi.fn().mockReturnValue(null),
}))

const { deliverWebhook, webhookTestUtils } = await import('../supabase/functions/_backend/utils/webhook.ts')

describe('webhook delivery redirect handling', () => {
  const payload = {
    event: 'app_versions.INSERT',
    event_id: 'event-123',
    timestamp: '2026-03-16T00:00:00.000Z',
    org_id: 'org-123',
    data: {
      table: 'app_versions',
      operation: 'INSERT',
      record_id: 'version-123',
      old_record: null,
      new_record: { id: 'version-123' },
      changed_fields: ['id'],
    },
  }

  const context = {
    get: vi.fn().mockReturnValue('req-webhook-test'),
  }

  beforeEach(() => {
    mockCloudlog.mockReset()
    mockCloudlogErr.mockReset()
    mockGetEnv.mockReset()
    mockGetEnv.mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('uses manual redirect mode for outbound webhook delivery', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('redirect blocked', {
      status: 302,
      headers: {
        location: 'http://169.254.169.254/latest/meta-data',
      },
    }))

    const result = await deliverWebhook(
      context as any,
      'delivery-123',
      'https://example.com/webhook',
      payload,
      'whsec_test_secret',
    )

    const webhookCalls = fetchMock.mock.calls.filter(([url]) => url === 'https://example.com/webhook')
    expect(webhookCalls).toHaveLength(1)
    expect(webhookCalls[0]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'manual',
    })
    expect(result).toMatchObject({
      success: false,
      status: 302,
      body: 'redirect blocked',
    })
  })

  it('does not read or store oversized webhook response bodies', async () => {
    const oversizedBody = 'x'.repeat(webhookTestUtils.WEBHOOK_RESPONSE_BODY_LIMIT_BYTES + 1)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(oversizedBody, {
      status: 200,
      headers: { 'content-length': String(webhookTestUtils.WEBHOOK_RESPONSE_BODY_LIMIT_BYTES + 1) },
    }))

    const result = await deliverWebhook(
      context as any,
      'delivery-oversized',
      'https://example.com/webhook',
      payload,
      'whsec_test_secret',
    )

    expect(result).toMatchObject({
      success: true,
      status: 200,
      body: webhookTestUtils.WEBHOOK_RESPONSE_BODY_TOO_LARGE,
    })
    expect(JSON.stringify(result)).not.toContain(oversizedBody)
  })

  it('keeps the delivery timeout active while reading the response body', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const signal = init?.signal as AbortSignal
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('partial body'))
          signal.addEventListener('abort', () => {
            controller.error(new DOMException('aborted', 'AbortError'))
          })
        },
      })
      return new Response(body, { status: 200 })
    })

    const resultPromise = deliverWebhook(
      context as any,
      'delivery-slow-body',
      'https://example.com/webhook',
      payload,
      'whsec_test_secret',
    )

    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(10000)
    const result = await resultPromise

    expect(result).toMatchObject({
      success: false,
      body: 'Error: Webhook delivery failed',
      duration: 10000,
    })
    expect(mockCloudlogErr).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Webhook delivery failed',
      deliveryId: 'delivery-slow-body',
      error: 'aborted',
      duration: 10000,
    }))
  })
})
