import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiAnalyzeBuild } from '../supabase/functions/_backend/public/build/ai_analyze'

const { mockSupabaseApikey, mockCheckPermission, mockGetEnv } = vi.hoisted(() => ({
  mockSupabaseApikey: vi.fn(),
  mockCheckPermission: vi.fn(),
  mockGetEnv: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: mockSupabaseApikey,
}))
vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: mockCheckPermission,
}))
vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: mockGetEnv,
}))

const requestId = 'req-ai-analyze-test'
const jobId = 'job-abc'
const appId = 'com.test.ai.analyze'
const builderUrl = 'https://builder.capgo.test'
const builderApiKey = 'builder-api-key'

function createContext() {
  return {
    req: {
      raw: new Request('http://localhost/build/ai_analyze', { method: 'POST' }),
    },
    get: vi.fn().mockImplementation((key: string) => key === 'requestId' ? requestId : undefined),
    json: vi.fn().mockImplementation((data: unknown, status: number) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })),
  } as any
}

function mockBuildRequestRow(row: { app_id: string, status: string, ai_analyzed: boolean } | null) {
  const eqAppId = { maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) }
  const eqJob = { eq: vi.fn().mockReturnValue(eqAppId) }
  const select = { eq: vi.fn().mockReturnValue(eqJob) }
  const updateEqApp = vi.fn().mockResolvedValue({ error: null })
  const updateEqJob = { eq: vi.fn().mockReturnValue({ eq: updateEqApp }) }
  const update = vi.fn().mockReturnValue(updateEqJob)
  mockSupabaseApikey.mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      expect(table).toBe('build_requests')
      return { select: vi.fn().mockReturnValue(select), update }
    }),
  })
  return { updateEqApp }
}

const apikey = { key: 'apikey-test', user_id: 'user-1' } as any

beforeEach(() => {
  mockSupabaseApikey.mockReset()
  mockCheckPermission.mockReset()
  mockGetEnv.mockReset()
  mockGetEnv.mockImplementation((_: unknown, key: string) => {
    if (key === 'BUILDER_URL')
      return builderUrl
    if (key === 'BUILDER_API_KEY')
      return builderApiKey
    return ''
  })
  globalThis.fetch = vi.fn()
})

describe('aiAnalyzeBuild', () => {
  it('throws unauthorized when checkPermission denies', async () => {
    mockCheckPermission.mockResolvedValue(false)
    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'logs'))
      .rejects
      .toThrow(/permission to analyze/i)
  })

  it('throws unauthorized when build_request row not found', async () => {
    mockCheckPermission.mockResolvedValue(true)
    mockBuildRequestRow(null)
    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'logs'))
      .rejects
      .toThrow(/permission to analyze/i)
  })

  it('throws invalid_state when status is not failed', async () => {
    mockCheckPermission.mockResolvedValue(true)
    mockBuildRequestRow({ app_id: appId, status: 'succeeded', ai_analyzed: false })
    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'logs'))
      .rejects
      .toThrow(/only available for failed builds/i)
  })

  it('throws already_analyzed with HTTP 409 status when ai_analyzed is true', async () => {
    mockCheckPermission.mockResolvedValue(true)
    mockBuildRequestRow({ app_id: appId, status: 'failed', ai_analyzed: true })
    // The CLI branches on res.status === 409 — verify both the message and the status code
    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'logs'))
      .rejects
      .toMatchObject({ status: 409, message: expect.stringMatching(/already requested for this job/i) })
  })

  it('does NOT flip the flag when builder proxy returns non-2xx', async () => {
    mockCheckPermission.mockResolvedValue(true)
    const { updateEqApp } = mockBuildRequestRow({ app_id: appId, status: 'failed', ai_analyzed: false })
    ;(globalThis.fetch as any).mockResolvedValue(new Response('upstream broken', { status: 503 }))

    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'small logs'))
      .rejects
      .toThrow(/AI analysis failed/i)

    expect(updateEqApp).not.toHaveBeenCalled()
  })

  it('flips the flag and returns analysis on builder 200', async () => {
    mockCheckPermission.mockResolvedValue(true)
    const { updateEqApp } = mockBuildRequestRow({ app_id: appId, status: 'failed', ai_analyzed: false })
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ analysis: '### Likely cause\nfoo' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )

    const result = await aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'small logs')

    expect(updateEqApp).toHaveBeenCalledTimes(1)
    expect(await result.json()).toEqual({ analysis: '### Likely cause\nfoo' })

    // Verify the builder URL and headers
    const fetchCall = (globalThis.fetch as any).mock.calls[0]
    expect(fetchCall[0]).toBe(`${builderUrl}/jobs/${jobId}/ai-analyze`)
    expect(fetchCall[1].headers['x-api-key']).toBe(builderApiKey)
    expect(fetchCall[1].method).toBe('POST')
    expect(JSON.parse(fetchCall[1].body)).toEqual({ logs: 'small logs' })
  })
})
