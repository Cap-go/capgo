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
})
