import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cloudlogErrMock,
  cloudlogMock,
  fetchMock,
} = vi.hoisted(() => ({
  cloudlogErrMock: vi.fn(),
  cloudlogMock: vi.fn(),
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
      return 'https://eu.i.posthog.com'
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

beforeEach(() => {
  fetchMock.mockResolvedValue({
    ok: true,
    text: vi.fn().mockResolvedValue(''),
  })
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

  it('uses a stable backend distinct_id and skips person updates for exceptions', async () => {
    const { capturePosthogException } = await import('../supabase/functions/_backend/utils/posthog.ts')

    await capturePosthogException(createContext(), {
      error: new Error('boom'),
      functionName: 'app',
      kind: 'unhandled_error',
      status: 500,
    })

    const request = fetchMock.mock.calls[0]
    const body = JSON.parse(request?.[1]?.body as string)

    expect(body.distinct_id).toBe('backend:prod:app')
    expect(body.properties.request_id).toBe('request-id')
    expect(body.properties).not.toHaveProperty('$set')
  })
})
