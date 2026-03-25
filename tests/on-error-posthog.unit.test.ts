import { HTTPException } from 'hono/http-exception'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  backgroundTaskMock,
  capturePosthogExceptionMock,
  cloudlogErrMock,
  sendDiscordAlert500Mock,
} = vi.hoisted(() => ({
  backgroundTaskMock: vi.fn(),
  capturePosthogExceptionMock: vi.fn(),
  cloudlogErrMock: vi.fn(),
  sendDiscordAlert500Mock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  backgroundTask: backgroundTaskMock,
}))

vi.mock('../supabase/functions/_backend/utils/discord.ts', () => ({
  sendDiscordAlert500: sendDiscordAlert500Mock,
}))

vi.mock('../supabase/functions/_backend/utils/posthog.ts', () => ({
  capturePosthogException: capturePosthogExceptionMock,
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlogErr: cloudlogErrMock,
  serializeError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? 'N/A' : 'N/A',
  }),
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
    json: (body: unknown, status: number) => ({ body, status }),
    req: {
      method: 'GET',
      raw: new Request('https://example.com/functions/v1/app', { method: 'GET' }),
      url: 'https://example.com/functions/v1/app',
    },
  } as any
}

beforeEach(() => {
  backgroundTaskMock.mockImplementation((_c: unknown, promise: Promise<unknown>) => promise)
  capturePosthogExceptionMock.mockResolvedValue(true)
  sendDiscordAlert500Mock.mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  backgroundTaskMock.mockReset()
  capturePosthogExceptionMock.mockReset()
  cloudlogErrMock.mockReset()
  sendDiscordAlert500Mock.mockReset()
})

describe('onError PostHog capture', () => {
  it.concurrent('captures backend HTTP exceptions in PostHog', async () => {
    const { onError } = await import('../supabase/functions/_backend/utils/on_error.ts')

    const error = new HTTPException(500, {
      cause: {
        error: 'internal_error',
        message: 'Something broke',
        moreInfo: { trace: 'abc' },
      },
    })

    const response = await onError('app')(error, createContext())

    expect(sendDiscordAlert500Mock).toHaveBeenCalledOnce()
    expect(capturePosthogExceptionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      functionName: 'app',
      kind: 'http_exception',
      status: 500,
    }))
    expect(capturePosthogExceptionMock.mock.calls[0]?.[1]).not.toHaveProperty('requestBody')
    expect(response).toEqual({
      body: {
        error: 'internal_error',
        message: 'Something broke',
        moreInfo: { trace: 'abc' },
      },
      status: 500,
    })
  })

  it.concurrent('skips PostHog capture for client HTTP exceptions', async () => {
    const { onError } = await import('../supabase/functions/_backend/utils/on_error.ts')

    const response = await onError('app')(new HTTPException(400, {
      cause: {
        error: 'bad_request',
        message: 'Invalid input',
        moreInfo: {},
      },
    }), createContext())

    expect(sendDiscordAlert500Mock).not.toHaveBeenCalled()
    expect(capturePosthogExceptionMock).not.toHaveBeenCalled()
    expect(response).toEqual({
      body: {
        error: 'bad_request',
        message: 'Invalid input',
        moreInfo: {},
      },
      status: 400,
    })
  })
})
