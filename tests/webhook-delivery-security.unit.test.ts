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
    const fetchMock = vi.fn().mockImplementation(async () => new Response('ok', { status: 200 }))
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
    const webhookCalls = fetchMock.mock.calls.filter(([url]) => url === 'https://example.com/webhook')
    expect(webhookCalls).toHaveLength(1)
    expect(webhookCalls[0]?.[1]).toMatchObject({
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
    const webhookCalls = fetchMock.mock.calls.filter(([url]) => url === 'https://example.com/webhook')
    expect(webhookCalls).toHaveLength(1)
  })

  it('blocks webhook hosts that resolve to private addresses before delivery', async () => {
    mockGetEnv.mockReturnValue('')
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const urlString = String(input)
      const url = new URL(urlString)

      if (url.hostname === 'cloudflare-dns.com') {
        const type = url.searchParams.get('type')
        return new Response(JSON.stringify({
          Answer: type === 'A' ? [{ data: '127.0.0.1' }] : [],
        }))
      }

      return new Response('should not post', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { deliverWebhook } = await import('../supabase/functions/_backend/utils/webhook.ts')
    const result = await deliverWebhook(
      createContext(),
      'delivery-3',
      'https://private.example/webhook',
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

    expect(result).toMatchObject({
      success: false,
      body: 'Error: Webhook URL must point to a public host',
    })
    expect(fetchMock.mock.calls.some(([url]) => url === 'https://private.example/webhook')).toBe(false)
  })
})
