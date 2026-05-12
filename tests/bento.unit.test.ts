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
    if (key === 'BENTO_PUBLISHABLE_KEY')
      return 'publishable-key'
    if (key === 'BENTO_SECRET_KEY')
      return 'secret-key'
    if (key === 'BENTO_SITE_UUID')
      return 'site-uuid'
    return ''
  },
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  cloudlogErrMock.mockReset()
  cloudlogMock.mockReset()
  fetchMock.mockReset()
})

describe('bento helper', () => {
  it('logs small Bento error bodies', async () => {
    const { trackBentoEvent } = await import('../supabase/functions/_backend/utils/bento.ts')
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))

    const result = await trackBentoEvent(createContext(), 'user@example.com', { app_id: 'app-id' }, 'test:event')

    expect(result).toBe(false)
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      message: 'trackBentoEvent error',
      error: expect.objectContaining({
        message: expect.stringContaining('Bento API error: 400 bad request'),
      }),
    }))
  })

  it('does not log oversized Bento error bodies', async () => {
    const { bentoTestUtils, trackBentoEvent } = await import('../supabase/functions/_backend/utils/bento.ts')
    const oversizedBody = 'x'.repeat(bentoTestUtils.MAX_BENTO_ERROR_BODY_BYTES + 1)
    fetchMock.mockResolvedValue(new Response(oversizedBody, { status: 502 }))

    const result = await trackBentoEvent(createContext(), 'user@example.com', { app_id: 'app-id' }, 'test:event')

    expect(result).toBe(false)
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        message: `Bento API error: 502 ${bentoTestUtils.BENTO_ERROR_BODY_TOO_LARGE}`,
      }),
    }))
    expect(JSON.stringify(cloudlogErrMock.mock.calls)).not.toContain(oversizedBody)
  })

  it('rejects oversized Bento error bodies from content-length before logging', async () => {
    const { bentoTestUtils, trackBentoEvent } = await import('../supabase/functions/_backend/utils/bento.ts')
    const oversizedBody = 'y'.repeat(bentoTestUtils.MAX_BENTO_ERROR_BODY_BYTES + 1)
    fetchMock.mockResolvedValue(new Response(oversizedBody, {
      status: 503,
      headers: { 'content-length': String(bentoTestUtils.MAX_BENTO_ERROR_BODY_BYTES + 1) },
    }))

    const result = await trackBentoEvent(createContext(), 'user@example.com', { app_id: 'app-id' }, 'test:event')

    expect(result).toBe(false)
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        message: `Bento API error: 503 ${bentoTestUtils.BENTO_ERROR_BODY_TOO_LARGE}`,
      }),
    }))
    expect(JSON.stringify(cloudlogErrMock.mock.calls)).not.toContain(oversizedBody)
  })

  it('cancels oversized Bento error bodies rejected by content-length', async () => {
    const { bentoTestUtils, trackBentoEvent } = await import('../supabase/functions/_backend/utils/bento.ts')
    const cancelMock = vi.fn()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('oversized'))
      },
      cancel: cancelMock,
    })
    fetchMock.mockResolvedValue(new Response(body, {
      status: 503,
      headers: { 'content-length': String(bentoTestUtils.MAX_BENTO_ERROR_BODY_BYTES + 1) },
    }))

    const result = await trackBentoEvent(createContext(), 'user@example.com', { app_id: 'app-id' }, 'test:event')

    expect(result).toBe(false)
    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        message: `Bento API error: 503 ${bentoTestUtils.BENTO_ERROR_BODY_TOO_LARGE}`,
      }),
    }))
  })
})
