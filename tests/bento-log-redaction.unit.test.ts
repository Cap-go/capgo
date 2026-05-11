import type { Context } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cloudlogErrMock,
  cloudlogMock,
  fetchMock,
  getEnvMock,
} = vi.hoisted(() => ({
  cloudlogErrMock: vi.fn(),
  cloudlogMock: vi.fn(),
  fetchMock: vi.fn(),
  getEnvMock: vi.fn((c: { env?: Record<string, string> }, key: string) => c.env?.[key] ?? ''),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: cloudlogErrMock,
  serializeError: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: getEnvMock,
}))

interface BentoMockContext {
  env: Record<string, string>
  get: (key: string) => string | undefined
}

function createContext(): Context {
  const context = {
    env: {
      BENTO_PUBLISHABLE_KEY: 'pub-key',
      BENTO_SECRET_KEY: 'secret-key',
      BENTO_SITE_UUID: 'site-uuid',
    },
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } satisfies BentoMockContext

  return context as unknown as Context
}

beforeEach(() => {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({
      errors: [{ email: 'alice@example.com', message: 'subscriber failed' }],
      failed: 0,
      results: 1,
    }), { status: 200 })),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cloudlogErrMock.mockReset()
  cloudlogMock.mockReset()
  fetchMock.mockReset()
  getEnvMock.mockClear()
})

describe('bento log redaction', () => {
  it('keeps add tag logs free of recipient emails and command payloads', async () => {
    const { addTagBento } = await import('../supabase/functions/_backend/utils/bento.ts')

    await expect(addTagBento(createContext(), 'alice@example.com', {
      deleteSegments: ['trial'],
      segments: ['paying'],
    })).resolves.toBe(true)

    expect(cloudlogMock).toHaveBeenCalledWith(expect.objectContaining({
      addTagCount: 1,
      commandCount: 2,
      message: 'addTagBento',
      removeTagCount: 1,
      results: [
        expect.objectContaining({ failed: 0, hasErrors: true, results: 1 }),
        expect.objectContaining({ failed: 0, hasErrors: true, results: 1 }),
      ],
    }))

    const logged = JSON.stringify(cloudlogMock.mock.calls)
    expect(logged).not.toContain('alice@example.com')
    expect(logged).not.toContain('remove_tag')
    expect(logged).not.toContain('add_tag')
    expect(logged).not.toContain('subscriber failed')
  })

  it('keeps failed event logs free of recipient emails, event details, and Bento error bodies', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      errors: [{ email: 'alice@example.com', message: 'event rejected' }],
      failed: 1,
      results: [{ email: 'alice@example.com', status: 'failed' }],
    }), { status: 200 }))

    const { trackBentoEvent } = await import('../supabase/functions/_backend/utils/bento.ts')

    await expect(trackBentoEvent(createContext(), 'alice@example.com', {
      plan: 'enterprise',
      userId: 'user-123',
    }, 'subscription_created')).resolves.toBe(false)

    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        errorCount: 1,
        failed: 1,
        hasErrors: true,
        results: 1,
      }),
      message: 'trackBentoEvent',
    }))

    const logged = JSON.stringify(cloudlogErrMock.mock.calls)
    expect(logged).not.toContain('alice@example.com')
    expect(logged).not.toContain('event rejected')
    expect(logged).not.toContain('enterprise')
    expect(logged).not.toContain('subscription_created')
    expect(logged).not.toContain('user-123')
  })

  it('keeps subscriber sync failure logs free of recipient emails and tag payloads', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      errors: [{ email: 'alice@example.com', message: 'subscriber rejected' }],
      failed: 1,
      results: [{ email: 'alice@example.com', status: 'failed' }],
    }), { status: 200 }))

    const { syncBentoSubscriberTags } = await import('../supabase/functions/_backend/utils/bento.ts')

    await expect(syncBentoSubscriberTags(createContext(), {
      deleteSegments: ['trial'],
      email: 'alice@example.com',
      segments: ['paying'],
    })).resolves.toBe(false)

    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        errorCount: 1,
        failed: 1,
        hasErrors: true,
        results: 1,
      }),
      message: 'syncBentoSubscriberTags',
    }))

    const logged = JSON.stringify(cloudlogErrMock.mock.calls)
    expect(logged).not.toContain('alice@example.com')
    expect(logged).not.toContain('subscriber rejected')
    expect(logged).not.toContain('paying')
    expect(logged).not.toContain('trial')
  })

  it('keeps unsubscribe logs free of recipient emails and result payloads', async () => {
    const { unsubscribeBento } = await import('../supabase/functions/_backend/utils/bento.ts')

    await expect(unsubscribeBento(createContext(), 'alice@example.com')).resolves.toBe(true)

    expect(cloudlogMock).toHaveBeenCalledWith(expect.objectContaining({
      message: 'unsubscribeBento',
      result: expect.objectContaining({ failed: 0, hasErrors: true, results: 1 }),
    }))

    const logged = JSON.stringify(cloudlogMock.mock.calls)
    expect(logged).not.toContain('alice@example.com')
    expect(logged).not.toContain('subscriber failed')
  })

  it('does not include third-party error bodies in Bento failure logs', async () => {
    fetchMock.mockResolvedValueOnce(new Response('alice@example.com could not be updated', {
      status: 400,
    }))

    const { addTagBento } = await import('../supabase/functions/_backend/utils/bento.ts')

    await expect(addTagBento(createContext(), 'alice@example.com', {
      deleteSegments: [],
      segments: ['paying'],
    })).resolves.toBe(false)

    expect(cloudlogErrMock).toHaveBeenCalledWith(expect.objectContaining({
      message: 'addTagBento error',
    }))

    const logged = JSON.stringify(cloudlogErrMock.mock.calls)
    expect(logged).toContain('Bento API error: 400')
    expect(logged).not.toContain('alice@example.com')
    expect(logged).not.toContain('could not be updated')
  })
})
