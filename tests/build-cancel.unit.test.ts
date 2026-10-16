import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { checkPermissionMock, apikeyFromMock, adminFromMock } = vi.hoisted(() => ({
  checkPermissionMock: vi.fn(),
  apikeyFromMock: vi.fn(),
  adminFromMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: checkPermissionMock,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: vi.fn(() => ({ from: apikeyFromMock })),
  supabaseAdmin: vi.fn(() => ({ from: adminFromMock })),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: vi.fn((_c: unknown, key: string) => key === 'BUILDER_URL' ? 'https://builder.test' : 'builder-key'),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
  cloudlogErr: vi.fn(),
}))

const { cancelBuild } = await import('../supabase/functions/_backend/public/build/cancel.ts')
const { NATIVE_BUILD_TERMINAL_STATUSES } = await import('../supabase/functions/_backend/public/build/concurrency.ts')

function context() {
  return {
    get: vi.fn(() => 'test-request-id'),
    json: vi.fn((body: unknown, status: number) => new Response(JSON.stringify(body), { status })),
  }
}

function selectChain(result: { data: unknown, error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    update: vi.fn(),
  }
  return chain
}

function updateChain() {
  const calls: { update?: unknown, eq: [string, unknown][], not: [string, string, string][] } = { eq: [], not: [] }
  const chain: any = {
    update: vi.fn((values: unknown) => {
      calls.update = values
      return chain
    }),
    eq: vi.fn((column: string, value: unknown) => {
      calls.eq.push([column, value])
      return chain
    }),
    not: vi.fn((column: string, op: string, value: string) => {
      calls.not.push([column, op, value])
      return chain
    }),
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
  }
  return { chain, calls }
}

describe('cancelBuild', () => {
  const apikey = { key: 'test-key', user_id: 'user-1' }
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists cancelled status with the admin client so the concurrency slot frees', async () => {
    checkPermissionMock.mockResolvedValueOnce(true)
    const lookup = selectChain({ data: { app_id: 'com.test.app' }, error: null })
    apikeyFromMock.mockReturnValue(lookup)
    const { chain: adminChain, calls } = updateChain()
    adminFromMock.mockReturnValue(adminChain)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ jobId: 'job-1', status: 'cancelled' }), { status: 200 }))

    const response = await cancelBuild(context() as any, 'job-1', 'com.test.app', apikey as any)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith('https://builder.test/jobs/job-1/cancel', expect.objectContaining({ method: 'POST' }))
    // The API-key client has no UPDATE RLS policy on build_requests; it must only be used for the lookup.
    expect(lookup.update).not.toHaveBeenCalled()
    expect(adminFromMock).toHaveBeenCalledWith('build_requests')
    expect(calls.update).toMatchObject({ status: 'cancelled' })
    expect(calls.eq).toEqual([['builder_job_id', 'job-1'], ['app_id', 'com.test.app']])
    expect(calls.not).toHaveLength(1)
    expect(calls.not[0][0]).toBe('status')
    expect(calls.not[0][1]).toBe('in')
    for (const status of ['succeeded', 'failed', 'cancelled'])
      expect(calls.not[0][2]).toContain(status)
    // 'cancelled' is terminal, so the concurrency reservation no longer counts this row.
    expect(NATIVE_BUILD_TERMINAL_STATUSES).toContain('cancelled')
  })

  it('does not touch the row when the job is not bound to the app', async () => {
    checkPermissionMock.mockResolvedValueOnce(true)
    apikeyFromMock.mockReturnValue(selectChain({ data: null, error: null }))

    await expect(cancelBuild(context() as any, 'job-1', 'com.test.app', apikey as any)).rejects.toThrow()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(adminFromMock).not.toHaveBeenCalled()
  })
})
