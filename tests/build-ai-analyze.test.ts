import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiAnalyzeBuild } from '../supabase/functions/_backend/public/build/ai_analyze'

const { mockSupabaseApikey, mockSupabaseAdmin, mockCheckPermission, mockGetEnv, mockSendEventToTracking } = vi.hoisted(() => ({
  mockSupabaseApikey: vi.fn(),
  mockSupabaseAdmin: vi.fn(),
  mockCheckPermission: vi.fn(),
  mockGetEnv: vi.fn(),
  mockSendEventToTracking: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: mockSupabaseApikey,
  supabaseAdmin: mockSupabaseAdmin,
}))
vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: mockCheckPermission,
}))
vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: mockGetEnv,
}))
vi.mock('../supabase/functions/_backend/utils/tracking.ts', () => ({
  sendEventToTracking: mockSendEventToTracking,
}))

const requestId = 'req-ai-analyze-test'
const jobId = 'job-abc'
const appId = 'com.test.ai.analyze'
const orgId = 'org-test-1'
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

interface RowShape {
  app_id: string
  status: string
  ai_analyzed: boolean
  owner_org: string
}

// Default admin UPDATE result: 1 row affected. Tests that exercise the
// 0-row-update edge case can override via `adminUpdateRows`.
function mockBuildRequestRow(row: RowShape | null, opts: { adminUpdateRows?: Array<{ builder_job_id: string }> } = {}) {
  // ── apikey client: SELECT only ─────────────────────────────────────────
  // The user-context client is used for the authorization SELECT against
  // `build_requests`. It is NEVER allowed to do UPDATE — that's what this
  // test file is regression-protecting. `apikeyUpdate` is wired so we can
  // assert it never gets called.
  const eqAppId = { maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) }
  const eqJob = { eq: vi.fn().mockReturnValue(eqAppId) }
  const select = { eq: vi.fn().mockReturnValue(eqJob) }
  const apikeyUpdate = vi.fn()
  mockSupabaseApikey.mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      expect(table).toBe('build_requests')
      return { select: vi.fn().mockReturnValue(select), update: apikeyUpdate }
    }),
  })

  // ── admin client: UPDATE only ──────────────────────────────────────────
  // The service-role client is used for the post-analysis flag write.
  // The chain is `.update().eq().eq().select('builder_job_id')` → resolves
  // to `{ data: rows, error }`.
  const updateRows = opts.adminUpdateRows ?? (row ? [{ builder_job_id: 'job-abc' }] : [])
  const adminSelect = vi.fn().mockResolvedValue({ data: updateRows, error: null })
  const adminEqApp = { eq: vi.fn().mockReturnValue({ select: adminSelect }) }
  const adminEqJob = vi.fn().mockReturnValue(adminEqApp)
  const adminUpdate = vi.fn().mockReturnValue({ eq: adminEqJob })
  mockSupabaseAdmin.mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      expect(table).toBe('build_requests')
      return { update: adminUpdate }
    }),
  })

  return { apikeyUpdate, adminUpdate, adminSelect }
}

const apikey = { key: 'apikey-test', user_id: 'user-1' } as any

beforeEach(() => {
  mockSupabaseApikey.mockReset()
  mockSupabaseAdmin.mockReset()
  mockCheckPermission.mockReset()
  mockGetEnv.mockReset()
  mockSendEventToTracking.mockReset()
  mockSendEventToTracking.mockResolvedValue(undefined)
  mockGetEnv.mockImplementation((_: unknown, key: string) => {
    if (key === 'BUILDER_URL')
      return builderUrl
    if (key === 'BUILDER_API_KEY')
      return builderApiKey
    return ''
  })
  globalThis.fetch = vi.fn()
})

function trackingCallsByEvent(eventName: string) {
  return mockSendEventToTracking.mock.calls.filter(([, payload]) => payload.event === eventName)
}

describe('aiAnalyzeBuild', () => {
  it('throws unauthorized when checkPermission denies, fires Result-only with no owner_org', async () => {
    mockCheckPermission.mockResolvedValue(false)
    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'logs'))
      .rejects
      .toThrow(/permission to analyze/i)

    expect(trackingCallsByEvent('AI Build Analysis Requested')).toHaveLength(0)
    const results = trackingCallsByEvent('AI Build Analysis Result')
    expect(results).toHaveLength(1)
    const [, payload] = results[0]
    expect(payload.tags.result).toBe('unauthorized')
    expect(payload.user_id).toBe(apikey.user_id)
    expect(payload.groups).toBeUndefined()
  })

  it('throws unauthorized when build_request row not found, fires Result-only with no owner_org', async () => {
    mockCheckPermission.mockResolvedValue(true)
    mockBuildRequestRow(null)
    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'logs'))
      .rejects
      .toThrow(/permission to analyze/i)

    expect(trackingCallsByEvent('AI Build Analysis Requested')).toHaveLength(0)
    const results = trackingCallsByEvent('AI Build Analysis Result')
    expect(results).toHaveLength(1)
    const [, payload] = results[0]
    expect(payload.tags.result).toBe('unauthorized')
    expect(payload.user_id).toBe(apikey.user_id)
    expect(payload.groups).toBeUndefined()
  })

  it('throws invalid_state when status is not failed; fires Result(invalid_state) only (no Requested)', async () => {
    mockCheckPermission.mockResolvedValue(true)
    mockBuildRequestRow({ app_id: appId, status: 'succeeded', ai_analyzed: false, owner_org: orgId })
    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'logs'))
      .rejects
      .toThrow(/only available for failed builds/i)

    expect(trackingCallsByEvent('AI Build Analysis Requested')).toHaveLength(0)

    const results = trackingCallsByEvent('AI Build Analysis Result')
    expect(results).toHaveLength(1)
    expect(results[0][1].tags.result).toBe('invalid_state')
    expect(results[0][1].user_id).toBe(apikey.user_id)
    expect(results[0][1].groups).toEqual({ organization: orgId })
    expect(results[0][1].tags.org_id).toBe(orgId)
  })

  it('throws already_analyzed when ai_analyzed is true; fires Result(already_analyzed) only (no Requested)', async () => {
    mockCheckPermission.mockResolvedValue(true)
    mockBuildRequestRow({ app_id: appId, status: 'failed', ai_analyzed: true, owner_org: orgId })
    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'logs'))
      .rejects
      .toMatchObject({ status: 409, message: expect.stringMatching(/already requested for this job/i) })

    expect(trackingCallsByEvent('AI Build Analysis Requested')).toHaveLength(0)
    const results = trackingCallsByEvent('AI Build Analysis Result')
    expect(results).toHaveLength(1)
    expect(results[0][1].tags.result).toBe('already_analyzed')
  })

  it('does NOT flip the flag when builder proxy returns non-2xx; fires Requested + Result(builder_error) with duration_ms', async () => {
    mockCheckPermission.mockResolvedValue(true)
    const { apikeyUpdate, adminUpdate } = mockBuildRequestRow({ app_id: appId, status: 'failed', ai_analyzed: false, owner_org: orgId })
    ;(globalThis.fetch as any).mockResolvedValue(new Response('upstream broken', { status: 503 }))

    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'small logs'))
      .rejects
      .toThrow(/AI analysis failed/i)

    // Builder failed → no UPDATE on EITHER client. The flag must stay false.
    expect(apikeyUpdate).not.toHaveBeenCalled()
    expect(adminUpdate).not.toHaveBeenCalled()
    expect(trackingCallsByEvent('AI Build Analysis Requested')).toHaveLength(1)
    const results = trackingCallsByEvent('AI Build Analysis Result')
    expect(results).toHaveLength(1)
    expect(results[0][1].tags.result).toBe('builder_error')
    expect(results[0][1].tags.duration_ms).toBeDefined()
  })

  it('flips the flag via SERVICE-ROLE client (never the apikey client), returns analysis, fires Requested + Result(success); does NOT leak analysis text in tags', async () => {
    mockCheckPermission.mockResolvedValue(true)
    const { apikeyUpdate, adminUpdate } = mockBuildRequestRow({ app_id: appId, status: 'failed', ai_analyzed: false, owner_org: orgId })
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ analysis: '### Likely cause\nfoo' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )

    const result = await aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'small logs')

    // Regression: the UPDATE that flips `ai_analyzed=true` MUST go through
    // the service-role client. The `build_requests` table has no RLS policy
    // granting UPDATE to the user-context apikey client — using it would
    // silently fail and break idempotency. We assert both halves of this:
    // the admin client got called exactly once, and the apikey client's
    // .update was never invoked at all.
    expect(adminUpdate).toHaveBeenCalledTimes(1)
    expect(adminUpdate).toHaveBeenCalledWith(expect.objectContaining({ ai_analyzed: true }))
    expect(apikeyUpdate).not.toHaveBeenCalled()
    expect(await result.json()).toEqual({ analysis: '### Likely cause\nfoo' })

    // Verify the builder URL and headers
    const fetchCall = (globalThis.fetch as any).mock.calls[0]
    expect(fetchCall[0]).toBe(`${builderUrl}/jobs/${jobId}/ai-analyze`)
    expect(fetchCall[1].headers['x-api-key']).toBe(builderApiKey)
    expect(fetchCall[1].method).toBe('POST')
    expect(JSON.parse(fetchCall[1].body)).toEqual({ logs: 'small logs' })

    // Telemetry assertions
    expect(trackingCallsByEvent('AI Build Analysis Requested')).toHaveLength(1)
    const results = trackingCallsByEvent('AI Build Analysis Result')
    expect(results).toHaveLength(1)
    expect(results[0][1].tags.result).toBe('success')
    expect(results[0][1].tags.duration_ms).toBeDefined()

    // Privacy boundary: the analysis text must not appear in any tag.
    for (const call of mockSendEventToTracking.mock.calls) {
      const tagsString = JSON.stringify(call[1].tags || {})
      expect(tagsString).not.toContain('Likely cause')
      expect(tagsString).not.toContain('### ')
    }
  })

  it('still returns the analysis when the admin UPDATE matched zero rows (defensive — analysis already happened, but we log the broken-idempotency case)', async () => {
    mockCheckPermission.mockResolvedValue(true)
    // Simulate the row vanishing between the user-context SELECT and the
    // service-role UPDATE. We still want the caller to get their analysis
    // back (the AI work has already been done and paid for); the fix is
    // that the production code logs this case loudly so it's findable.
    const { adminUpdate } = mockBuildRequestRow(
      { app_id: appId, status: 'failed', ai_analyzed: false, owner_org: orgId },
      { adminUpdateRows: [] }, // <-- 0-row update
    )
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ analysis: '### Likely cause\nfoo' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )

    const result = await aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'small logs')

    // The analysis still comes back to the caller — we don't punish the
    // user for a server-side bookkeeping miss.
    expect(adminUpdate).toHaveBeenCalledTimes(1)
    expect(await result.json()).toEqual({ analysis: '### Likely cause\nfoo' })

    // Success Result event still fires — the AI half of the operation
    // completed; only the persistence bookkeeping was incomplete.
    const results = trackingCallsByEvent('AI Build Analysis Result')
    expect(results).toHaveLength(1)
    expect(results[0][1].tags.result).toBe('success')
  })

  it('fires Result(config_error) when BUILDER_URL is missing', async () => {
    mockCheckPermission.mockResolvedValue(true)
    mockBuildRequestRow({ app_id: appId, status: 'failed', ai_analyzed: false, owner_org: orgId })
    mockGetEnv.mockImplementation(() => '')

    await expect(aiAnalyzeBuild(createContext(), jobId, appId, apikey, 'logs'))
      .rejects
      .toThrow(/Builder service not configured/i)

    const results = trackingCallsByEvent('AI Build Analysis Result')
    expect(results).toHaveLength(1)
    expect(results[0][1].tags.result).toBe('config_error')
    expect(results[0][1].user_id).toBe(apikey.user_id)
    expect(results[0][1].tags.org_id).toBe(orgId)
  })
})
