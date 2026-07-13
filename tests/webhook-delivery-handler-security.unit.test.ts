import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockBackgroundTask,
  mockCloudlog,
  mockCloudlogErr,
  mockCloseClient,
  mockDeliverWebhook,
  mockDisableWebhook,
  mockGetDeliveryById,
  mockGetDrizzleClient,
  mockGetPgClient,
  mockGetWebhookById,
  mockIncrementAttemptCount,
  mockMarkDeliveryFailed,
  mockQueueWebhookDeliveryWithDelay,
  mockSendNotifOrg,
  mockUpdateDeliveryResult,
} = vi.hoisted(() => ({
  mockBackgroundTask: vi.fn(),
  mockCloudlog: vi.fn(),
  mockCloudlogErr: vi.fn(),
  mockCloseClient: vi.fn(),
  mockDeliverWebhook: vi.fn(),
  mockDisableWebhook: vi.fn(),
  mockGetDeliveryById: vi.fn(),
  mockGetDrizzleClient: vi.fn(),
  mockGetPgClient: vi.fn(),
  mockGetWebhookById: vi.fn(),
  mockIncrementAttemptCount: vi.fn(),
  mockMarkDeliveryFailed: vi.fn(),
  mockQueueWebhookDeliveryWithDelay: vi.fn(),
  mockSendNotifOrg: vi.fn(),
  mockUpdateDeliveryResult: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  BRES: { status: 'ok' },
  middlewareAPISecret: async (_c: unknown, next: () => Promise<void>) => next(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: mockCloudlog,
  cloudlogErr: mockCloudlogErr,
  serializeError: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
}))

vi.mock('../supabase/functions/_backend/utils/notifications.ts', () => ({
  sendNotifOrg: mockSendNotifOrg,
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: mockCloseClient,
  getDrizzleClient: mockGetDrizzleClient,
  getPgClient: mockGetPgClient,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  backgroundTask: mockBackgroundTask,
}))

vi.mock('../supabase/functions/_backend/utils/webhook.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase/functions/_backend/utils/webhook.ts')>()

  return {
    ...actual,
    deliverWebhook: mockDeliverWebhook,
    disableWebhook: mockDisableWebhook,
    getDeliveryById: mockGetDeliveryById,
    getWebhookById: mockGetWebhookById,
    incrementAttemptCount: mockIncrementAttemptCount,
    markDeliveryFailed: mockMarkDeliveryFailed,
    queueWebhookDeliveryWithDelay: mockQueueWebhookDeliveryWithDelay,
    updateDeliveryResult: mockUpdateDeliveryResult,
  }
})

const { app } = await import('../supabase/functions/_backend/triggers/webhook_delivery.ts')

const sensitiveUrl = 'https://example.com/hooks/capgo?token=secret-token'
const payload = {
  type: 'app_versions.INSERT',
  event: 'app_versions.INSERT',
  event_id: 'event-sensitive-url',
  timestamp: '2026-05-12T00:00:00.000Z',
  org_id: 'org-1',
  data: {
    table: 'app_versions',
    operation: 'INSERT',
    record_id: 'record-sensitive-url',
    old_record: null,
    new_record: null,
    changed_fields: null,
  },
}

function postDelivery(body: unknown) {
  return app.request(new Request('http://local/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }))
}

function resetMocks() {
  vi.clearAllMocks()
  mockBackgroundTask.mockImplementation(async (_c, task) => task)
  mockGetPgClient.mockReturnValue({ release: vi.fn() })
  mockGetDrizzleClient.mockReturnValue({})
  mockGetDeliveryById.mockResolvedValue({
    status: 'pending',
    max_attempts: 10,
    delivery_version: 'standard',
  })
  mockGetWebhookById.mockResolvedValue({
    id: 'webhook-1',
    name: 'Sensitive webhook',
    org_id: 'org-1',
    secret: 'whsec_test',
    url: sensitiveUrl,
    delivery_version: 'standard',
    orgs: {
      management_email: 'owner@example.com',
    },
  })
  mockIncrementAttemptCount.mockResolvedValue(1)
  mockDeliverWebhook.mockResolvedValue({
    success: true,
    status: 200,
    body: 'ok',
    duration: 10,
  })
  mockUpdateDeliveryResult.mockResolvedValue(undefined)
  mockQueueWebhookDeliveryWithDelay.mockResolvedValue(undefined)
  mockMarkDeliveryFailed.mockResolvedValue(undefined)
  mockDisableWebhook.mockResolvedValue(undefined)
  mockSendNotifOrg.mockResolvedValue(true)
}

function serializedLogs() {
  return JSON.stringify([
    ...mockCloudlog.mock.calls.map(([entry]) => entry),
    ...mockCloudlogErr.mock.calls.map(([entry]) => entry),
  ])
}

describe('webhook delivery handler security', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('does not log raw queue webhook URLs or query secrets', async () => {
    const response = await postDelivery({
      delivery_id: 'delivery-1',
      webhook_id: 'webhook-1',
      url: sensitiveUrl,
      payload,
    })

    expect(response.status).toBe(200)
    const receivedLog = mockCloudlog.mock.calls
      .map(([entry]) => entry)
      .find(entry => entry.message === 'Webhook delivery handler received')

    expect(receivedLog).toMatchObject({
      deliveryId: 'delivery-1',
      webhookId: 'webhook-1',
      urlInfo: {
        valid: true,
        protocol: 'https',
        hostnameLength: 'example.com'.length,
        pathSegmentCount: 2,
        hasQuery: true,
        hasCredentials: false,
      },
    })
    expect(receivedLog).not.toHaveProperty('url')
    expect(serializedLogs()).not.toContain('secret-token')
  })

  it('records retryable delivery results as pending with their retry time', async () => {
    mockDeliverWebhook.mockResolvedValue({
      success: false,
      status: 405,
      body: 'method not allowed',
      duration: 10,
    })

    const response = await postDelivery({
      delivery_id: 'delivery-retryable',
      webhook_id: 'webhook-1',
      url: sensitiveUrl,
      payload,
    })

    expect(response.status).toBe(200)
    expect(mockUpdateDeliveryResult).toHaveBeenCalledTimes(1)
    expect(mockUpdateDeliveryResult).toHaveBeenCalledWith(
      expect.anything(),
      'delivery-retryable',
      false,
      405,
      'method not allowed',
      10,
      'pending',
      expect.any(String),
    )
    const nextRetryAt = mockUpdateDeliveryResult.mock.calls[0]?.[7]
    expect(Date.parse(nextRetryAt as string)).toBeGreaterThan(Date.now())
    expect(mockQueueWebhookDeliveryWithDelay).toHaveBeenCalledTimes(1)
    expect(mockMarkDeliveryFailed).not.toHaveBeenCalled()
    expect(mockDisableWebhook).not.toHaveBeenCalled()
  })

  it('does not dump raw delivery data when queue payload validation fails', async () => {
    const response = await postDelivery({
      delivery_id: 'delivery-2',
      webhook_id: 'webhook-1',
      url: sensitiveUrl,
    })

    expect(response.status).toBe(200)
    const invalidLog = mockCloudlogErr.mock.calls
      .map(([entry]) => entry)
      .find(entry => entry.message === 'Invalid delivery data')

    expect(invalidLog).toMatchObject({
      hasDeliveryId: true,
      hasWebhookId: true,
      hasUrl: true,
      hasPayload: false,
      urlInfo: {
        valid: true,
        hasQuery: true,
      },
    })
    expect(invalidLog).not.toHaveProperty('deliveryData')
    expect(serializedLogs()).not.toContain('secret-token')
  })

  it('does not send raw webhook URLs to failure notifications', async () => {
    mockGetDeliveryById.mockResolvedValue({
      status: 'pending',
      max_attempts: 1,
      delivery_version: 'standard',
    })
    mockDeliverWebhook.mockResolvedValue({
      success: false,
      status: 500,
      body: 'receiver failed',
      duration: 10,
    })

    const response = await postDelivery({
      delivery_id: 'delivery-3',
      webhook_id: 'webhook-1',
      url: sensitiveUrl,
      payload,
    })

    expect(response.status).toBe(200)
    expect(mockSendNotifOrg).toHaveBeenCalledTimes(1)
    expect(mockUpdateDeliveryResult).toHaveBeenCalledWith(
      expect.anything(),
      'delivery-3',
      false,
      500,
      'receiver failed',
      10,
    )
    expect(mockMarkDeliveryFailed).toHaveBeenCalledWith(expect.anything(), 'delivery-3')
    expect(mockDisableWebhook).toHaveBeenCalledWith(expect.anything(), 'webhook-1')

    const eventData = mockSendNotifOrg.mock.calls[0]?.[2]
    expect(eventData).toMatchObject({
      webhook_name: 'Sensitive webhook',
      webhook_id: 'webhook-1',
      webhook_url_info: {
        valid: true,
        protocol: 'https',
        hostnameLength: 'example.com'.length,
        pathSegmentCount: 2,
        hasQuery: true,
        hasCredentials: false,
      },
    })
    expect(eventData).not.toHaveProperty('webhook_url')
    expect(JSON.stringify(eventData)).not.toContain('secret-token')
  })
})
