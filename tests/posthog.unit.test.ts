import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cloudlogErrMock,
  cloudlogMock,
  envState,
  fetchMock,
} = vi.hoisted(() => ({
  cloudlogErrMock: vi.fn(),
  cloudlogMock: vi.fn(),
  envState: {
    posthogApiHost: 'https://eu.i.posthog.com',
  },
  fetchMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: cloudlogErrMock,
  serializeError: (error: unknown) => ({
    cause: error instanceof Error ? error.cause : undefined,
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error',
    stack: error instanceof Error ? error.stack ?? 'N/A' : 'N/A',
  }),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  existInEnv: () => true,
  getEnv: (_c: unknown, key: string) => {
    if (key === 'POSTHOG_API_KEY')
      return 'posthog-key'
    if (key === 'POSTHOG_API_HOST')
      return envState.posthogApiHost
    if (key === 'ENV_NAME')
      return 'prod'
    return ''
  },
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
    req: {
      method: 'POST',
      url: 'https://example.com/functions/v1/app',
    },
  } as any
}

async function expectOversizedPostHogError(sender: (context: ReturnType<typeof createContext>) => Promise<boolean>, message: string) {
  const oversizedBody = 'x'.repeat(4097)
  fetchMock.mockResolvedValue(new Response(oversizedBody, { status: 503 }))

  await expect(sender(createContext())).resolves.toBe(false)
  expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
    message,
    error: 'posthog_error_body_too_large',
  }))
  expect(JSON.stringify(cloudlogErrMock.mock.calls)).not.toContain(oversizedBody)
}

beforeEach(() => {
  envState.posthogApiHost = 'https://eu.i.posthog.com'
  fetchMock.mockResolvedValue(new Response('', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  cloudlogErrMock.mockReset()
  cloudlogMock.mockReset()
  fetchMock.mockReset()
})

describe('posthog helper', () => {
  it('keeps person property updates enabled for normal PostHog events', async () => {
    const { trackPosthogEvent } = await import('../supabase/functions/_backend/utils/posthog.ts')

    await trackPosthogEvent(createContext(), {
      event: 'Tracked Event',
      channel: 'usage',
      description: 'tracked',
      user_id: 'user-id',
      tags: { app_id: 'app-id' },
    })

    const request = fetchMock.mock.calls[0]
    const body = JSON.parse(request?.[1]?.body as string)

    expect(body.distinct_id).toBe('user-id')
    expect(body.properties.$set).toEqual({ app_id: 'app-id' })
  })

  it('uses the full exception endpoint host and only sends the request path for exceptions', async () => {
    const { capturePosthogException } = await import('../supabase/functions/_backend/utils/posthog.ts')
    envState.posthogApiHost = 'https://eu.i.posthog.com/i/v0/e'

    await capturePosthogException(createContext(), {
      error: new Error('boom'),
      functionName: 'app',
      kind: 'unhandled_error',
      status: 500,
    })

    const request = fetchMock.mock.calls[0]
    const url = request?.[0]
    const body = JSON.parse(request?.[1]?.body as string)

    expect(url).toBe('https://eu.i.posthog.com/i/v0/e/')
    expect(body.event).toBe('$exception')
    expect(body.token).toBe('posthog-key')
    expect(body.properties.distinct_id).toBe('backend:prod:app')
    expect(body.properties.request_id).toBe('request-id')
    expect(body.properties.url_path).toBe('/functions/v1/app')
    expect(body.properties).not.toHaveProperty('url')
    expect(body.properties).not.toHaveProperty('$set')
    expect(body.properties.$exception_fingerprint).toContain('backend:prod:app')
    expect(body.properties.$exception_list[0].type).toBe('Error')
    expect(body.properties.$exception_list[0].value).toBe('boom')
    expect(body.properties.$exception_list[0].stacktrace.frames[0].platform).toBe('custom')
    expect(request?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('logs and skips exception delivery when the configured PostHog host is invalid', async () => {
    const { capturePosthogException } = await import('../supabase/functions/_backend/utils/posthog.ts')
    envState.posthogApiHost = '://bad-host'

    const sent = await capturePosthogException(createContext(), {
      error: new Error('boom'),
      functionName: 'app',
      kind: 'unhandled_error',
      status: 500,
    })

    expect(sent).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Invalid PostHog host',
      host: '://bad-host',
    }))
  })

  it('does not log oversized PostHog capture error bodies', async () => {
    const { trackPosthogEvent } = await import('../supabase/functions/_backend/utils/posthog.ts')

    await expectOversizedPostHogError(context => trackPosthogEvent(context, {
      event: 'Tracked Event',
      channel: 'usage',
      user_id: 'user-id',
    }), 'PostHog error')
  })

  it('does not log oversized PostHog exception error bodies', async () => {
    const { capturePosthogException } = await import('../supabase/functions/_backend/utils/posthog.ts')

    await expectOversizedPostHogError(context => capturePosthogException(context, {
      error: new Error('boom'),
      functionName: 'app',
      kind: 'unhandled_error',
      status: 500,
    }), 'PostHog exception error')
  })

  it('rejects oversized PostHog error bodies from content-length before reading', async () => {
    const { posthogTestUtils } = await import('../supabase/functions/_backend/utils/posthog.ts')
    const response = new Response('too large', {
      status: 503,
      headers: {
        'content-length': String(posthogTestUtils.MAX_POSTHOG_ERROR_BODY_BYTES + 1),
      },
    })

    await expect(posthogTestUtils.readPostHogErrorBody(response)).resolves.toBeNull()
  })
})
