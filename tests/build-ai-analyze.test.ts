// tests/build-ai-analyze.test.ts — the old proxy is gone; this now regression-
// tests the permanent 426 deprecation responder.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UPGRADE_MESSAGE, aiAnalyzeDeprecated } from '../supabase/functions/_backend/public/build/ai_analyze'

const { mockSendEventToTracking } = vi.hoisted(() => ({ mockSendEventToTracking: vi.fn() }))
vi.mock('../supabase/functions/_backend/utils/tracking.ts', () => ({ sendEventToTracking: mockSendEventToTracking }))

const apikey = { key: 'apikey-test', user_id: 'user-1' } as any

function createContext(body?: unknown) {
  return {
    req: {
      raw: new Request('http://localhost/build/ai_analyze', {
        method: 'POST',
        body: body === undefined ? null : JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
    },
    get: vi.fn().mockImplementation((key: string) => key === 'requestId' ? 'req-test' : undefined),
    json: vi.fn().mockImplementation((data: unknown, status: number) =>
      new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })),
  } as any
}

beforeEach(() => {
  mockSendEventToTracking.mockReset()
  mockSendEventToTracking.mockResolvedValue(undefined)
  globalThis.fetch = vi.fn()
})

describe('aiAnalyzeDeprecated', () => {
  it('returns 426 with the upgrade text in the error field (body.error wins over body.message in old CLIs)', async () => {
    const res = await aiAnalyzeDeprecated(createContext({ jobId: 'j', appId: 'a', logs: 'x' }), apikey)
    expect(res.status).toBe(426)
    const body = await res.json() as { error: string, code: string }
    expect(body.error).toBe(UPGRADE_MESSAGE)
    expect(body.error).toContain('npx @capgo/cli@latest')
    expect(body.code).toBe('upgrade_required')
  })

  it('answers 426 even with an unparsable body', async () => {
    const res = await aiAnalyzeDeprecated(createContext(), apikey)
    expect(res.status).toBe(426)
  })

  it('never contacts the builder or the database', async () => {
    await aiAnalyzeDeprecated(createContext({ jobId: 'j', appId: 'a', logs: 'x' }), apikey)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('emits upgrade_required telemetry with best-effort job/app tags', async () => {
    await aiAnalyzeDeprecated(createContext({ jobId: 'job-1', appId: 'app-1', logs: 'x' }), apikey)
    const calls = mockSendEventToTracking.mock.calls.filter(([, p]) => p.event === 'AI Build Analysis Result')
    expect(calls).toHaveLength(1)
    expect(calls[0][1].tags.result).toBe('upgrade_required')
    expect(calls[0][1].tags.job_id).toBe('job-1')
    expect(calls[0][1].tags.app_id).toBe('app-1')
  })
})
