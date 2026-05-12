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
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error',
    stack: error instanceof Error ? error.stack ?? 'N/A' : 'N/A',
  }),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: (_c: unknown, key: string) => {
    if (key === 'LOGSNAG_TOKEN')
      return 'logsnag-token'
    if (key === 'LOGSNAG_PROJECT')
      return 'logsnag-project'
    return ''
  },
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

const insightPayload = [{ title: 'Deploys', value: 1, icon: 'rocket' }]

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  cloudlogErrMock.mockReset()
  cloudlogMock.mockReset()
  fetchMock.mockReset()
})

describe('logsnag helper', () => {
  it.concurrent('logs small LogSnag error bodies', async () => {
    const { logsnagInsights } = await import('../supabase/functions/_backend/utils/logsnag.ts')
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))

    const result = await logsnagInsights(createContext(), insightPayload)

    expect(result).toEqual([false])
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      message: 'logsnagInsights error',
      status: 400,
      error: 'bad request',
    }))
  })

  it.concurrent('rejects oversized LogSnag error bodies from content-length before logging', async () => {
    const { logsnagInsights, logsnagTestUtils } = await import('../supabase/functions/_backend/utils/logsnag.ts')
    const oversizedBody = 'x'.repeat(logsnagTestUtils.MAX_LOGSNAG_ERROR_BODY_BYTES + 1)
    fetchMock.mockResolvedValue(new Response(oversizedBody, {
      status: 502,
      headers: { 'content-length': String(logsnagTestUtils.MAX_LOGSNAG_ERROR_BODY_BYTES + 1) },
    }))

    const result = await logsnagInsights(createContext(), insightPayload)

    expect(result).toEqual([false])
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      error: logsnagTestUtils.LOGSNAG_ERROR_BODY_TOO_LARGE,
      status: 502,
    }))
    expect(JSON.stringify(cloudlogErrMock.mock.calls)).not.toContain(oversizedBody)
  })

  it.concurrent('cancels oversized LogSnag error bodies rejected by content-length', async () => {
    const { logsnagInsights, logsnagTestUtils } = await import('../supabase/functions/_backend/utils/logsnag.ts')
    const cancelMock = vi.fn()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('oversized'))
      },
      cancel: cancelMock,
    })
    fetchMock.mockResolvedValue(new Response(body, {
      status: 502,
      headers: { 'content-length': String(logsnagTestUtils.MAX_LOGSNAG_ERROR_BODY_BYTES + 1) },
    }))

    const result = await logsnagInsights(createContext(), insightPayload)

    expect(result).toEqual([false])
    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      error: logsnagTestUtils.LOGSNAG_ERROR_BODY_TOO_LARGE,
      status: 502,
    }))
  })

  it.concurrent('does not log chunked oversized LogSnag error bodies', async () => {
    const { logsnagInsights, logsnagTestUtils } = await import('../supabase/functions/_backend/utils/logsnag.ts')
    const oversizedBody = 'y'.repeat(logsnagTestUtils.MAX_LOGSNAG_ERROR_BODY_BYTES + 1)
    fetchMock.mockResolvedValue(new Response(oversizedBody, { status: 503 }))

    const result = await logsnagInsights(createContext(), insightPayload)

    expect(result).toEqual([false])
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      error: logsnagTestUtils.LOGSNAG_ERROR_BODY_TOO_LARGE,
      status: 503,
    }))
    expect(JSON.stringify(cloudlogErrMock.mock.calls)).not.toContain(oversizedBody)
  })
})
