import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetEnv, mockCloudlog, mockCloudlogErr } = vi.hoisted(() => ({
  mockGetEnv: vi.fn(),
  mockCloudlog: vi.fn(),
  mockCloudlogErr: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: mockGetEnv,
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: mockCloudlog,
  cloudlogErr: mockCloudlogErr,
  serializeError: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

function enableLocalWebhookUrls(enabled: boolean) {
  mockGetEnv.mockImplementation((_c: unknown, key: string) =>
    key === 'CAPGO_ALLOW_LOCAL_WEBHOOK_URLS' && enabled ? 'true' : '',
  )
}

async function validateWebhookUrl(url: string) {
  const { getWebhookUrlValidationError } = await import('../supabase/functions/_backend/utils/webhook.ts')
  return getWebhookUrlValidationError(createContext(), url)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  mockGetEnv.mockReset()
  mockCloudlog.mockReset()
  mockCloudlogErr.mockReset()
  mockGetEnv.mockReturnValue('')
})

describe('webhook delivery redirect handling', () => {
  it('sends webhook requests with manual redirect handling', async () => {
    mockGetEnv.mockReturnValue('')
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { deliverWebhook } = await import('../supabase/functions/_backend/utils/webhook.ts')
    const result = await deliverWebhook(
      createContext(),
      'delivery-1',
      'https://example.com/webhook',
      {
        event: 'app_versions.INSERT',
        event_id: 'event-1',
        timestamp: new Date().toISOString(),
        org_id: 'org-1',
        data: {
          table: 'app_versions',
          operation: 'INSERT',
          record_id: 'record-1',
          old_record: null,
          new_record: null,
          changed_fields: null,
        },
      },
      'secret',
    )

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'manual',
    })
  })

  it('does not treat redirect responses as successful deliveries', async () => {
    mockGetEnv.mockReturnValue('')
    const fetchMock = vi.fn().mockResolvedValue(new Response('', {
      status: 302,
      headers: {
        location: 'http://169.254.169.254/latest/meta-data/',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { deliverWebhook } = await import('../supabase/functions/_backend/utils/webhook.ts')
    const result = await deliverWebhook(
      createContext(),
      'delivery-2',
      'https://example.com/webhook',
      {
        event: 'app_versions.INSERT',
        event_id: 'event-2',
        timestamp: new Date().toISOString(),
        org_id: 'org-1',
        data: {
          table: 'app_versions',
          operation: 'INSERT',
          record_id: 'record-2',
          old_record: null,
          new_record: null,
          changed_fields: null,
        },
      },
      'secret',
    )

    expect(result.success).toBe(false)
    expect(result.status).toBe(302)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not log raw blocked webhook URLs with query secrets', async () => {
    mockGetEnv.mockReturnValue('')

    const { deliverWebhook } = await import('../supabase/functions/_backend/utils/webhook.ts')
    const result = await deliverWebhook(
      createContext(),
      'delivery-3',
      'http://localhost/webhook?token=secret-token',
      {
        event: 'app_versions.INSERT',
        event_id: 'event-3',
        timestamp: new Date().toISOString(),
        org_id: 'org-1',
        data: {
          table: 'app_versions',
          operation: 'INSERT',
          record_id: 'record-3',
          old_record: null,
          new_record: null,
          changed_fields: null,
        },
      },
      'secret',
    )

    expect(result.success).toBe(false)
    expect(mockCloudlogErr).toHaveBeenCalledOnce()
    const logged = JSON.stringify(mockCloudlogErr.mock.calls)
    expect(logged).not.toContain('secret-token')
    expect(logged).not.toContain('http://localhost/webhook')
    expect(mockCloudlogErr.mock.calls[0]?.[0]).toMatchObject({
      message: 'Webhook delivery blocked by URL validation',
      urlInfo: {
        protocol: 'http:',
        hasHostname: true,
        hasQuery: true,
      },
    })
  })
})

describe('webhook URL validation', () => {
  it('allows HTTP and HTTPS webhooks when local webhook URLs are enabled', async () => {
    enableLocalWebhookUrls(true)

    await expect(validateWebhookUrl('http://localhost:3000/webhook')).resolves.toBeNull()
    await expect(validateWebhookUrl('https://localhost/webhook')).resolves.toBeNull()
  })

  it('rejects unsupported URL schemes even when local webhook URLs are enabled', async () => {
    enableLocalWebhookUrls(true)

    await expect(validateWebhookUrl('ftp://localhost/webhook')).resolves.toBe('Webhook URL must use HTTP or HTTPS')
    await expect(validateWebhookUrl('file:///tmp/webhook')).resolves.toBe('Webhook URL must use HTTP or HTTPS')
  })

  it('continues to reject HTTP URLs when local webhook URLs are disabled', async () => {
    enableLocalWebhookUrls(false)

    await expect(validateWebhookUrl('http://example.com/webhook')).resolves.toBe('Webhook URL must use HTTPS')
  })

  it('allows public HTTPS URLs when local webhook URLs are enabled', async () => {
    enableLocalWebhookUrls(true)

    await expect(validateWebhookUrl('https://example.com/webhook')).resolves.toBeNull()
  })

  it('rejects localhost URLs when local webhook URLs are disabled', async () => {
    enableLocalWebhookUrls(false)

    await expect(validateWebhookUrl('https://localhost/webhook')).resolves.toBe('Webhook URL must point to a public host')
  })
})
