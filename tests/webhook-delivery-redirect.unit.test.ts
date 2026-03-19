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

const { deliverWebhook } = await import('../supabase/functions/_backend/utils/webhook.ts')

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
  })

  it.concurrent('uses manual redirect mode for outbound webhook delivery', async () => {
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

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
      }),
    )
    expect(result).toMatchObject({
      success: false,
      status: 302,
      body: 'redirect blocked',
    })
  })
})
