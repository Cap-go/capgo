import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase/functions/_backend/utils/hono.ts', () => ({
  simpleError: (code: string, message: string, data?: Record<string, unknown>) => {
    const err: any = new Error(message)
    err.code = code
    err.data = data ?? null
    return err
  },
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
  cloudlogErr: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: vi.fn(),
  supabaseAdmin: vi.fn(),
  recordBuildTime: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: vi.fn().mockResolvedValue(true),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: (_c: unknown, key: string) => {
    if (key === 'BUILDER_URL') return 'https://builder.example.com'
    if (key === 'BUILDER_API_KEY') return 'test-builder-key'
    return ''
  },
}))

const { cloudlogErr } = await import('../supabase/functions/_backend/utils/logging.ts')
const { getBuildStatus } = await import('../supabase/functions/_backend/public/build/status.ts')
const { supabaseApikey, supabaseAdmin } = await import('../supabase/functions/_backend/utils/supabase.ts')

function makeMockContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'req-test-123' : undefined,
    json: vi.fn(),
  } as any
}

function makeMockApikey() {
  return { key: 'test-key', user_id: 'user-abc' } as any
}

describe('getBuildStatus builder error redaction', () => {
  it('does not embed raw builder response body in error message', async () => {
    const sensitiveBody = 'X-Amz-Signature=AKIAIOSFODNN7EXAMPLE&X-Amz-Credential=secret-cred'

    ;(supabaseApikey as any).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { app_id: 'com.test.app', owner_org: 'org-1', platform: 'android' }, error: null }),
            single: () => Promise.resolve({ data: { build_timeout_seconds: 600, build_timeout_updated_at: null }, error: null }),
          }),
        }),
      }),
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve(sensitiveBody),
    } as any)

    const c = makeMockContext()
    const params = { job_id: 'job-xyz', app_id: 'com.test.app', platform: 'android' as const }

    let thrown: any
    try {
      await getBuildStatus(c, params, makeMockApikey())
    }
    catch (e) {
      thrown = e
    }

    expect(thrown).toBeDefined()
    expect(thrown.code).toBe('builder_error')

    // Error message must NOT contain sensitive upstream body
    expect(thrown.message).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(thrown.message).not.toContain('X-Amz-Signature')
    expect(thrown.message).not.toContain(sensitiveBody)

    // data may include HTTP status but not the body
    if (thrown.data) {
      expect(JSON.stringify(thrown.data)).not.toContain('AKIAIOSFODNN7EXAMPLE')
      expect(JSON.stringify(thrown.data)).not.toContain('X-Amz-Signature')
    }
  })

  it('logs body length not body content on builder failure', async () => {
    const sensitiveBody = 'presigned-secret-token-xyz'

    ;(supabaseApikey as any).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { app_id: 'com.test.app', owner_org: 'org-1', platform: 'android' }, error: null }),
            single: () => Promise.resolve({ data: { build_timeout_seconds: 600, build_timeout_updated_at: null }, error: null }),
          }),
        }),
      }),
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve(sensitiveBody),
    } as any)

    const c = makeMockContext()
    const params = { job_id: 'job-xyz', app_id: 'com.test.app', platform: 'android' as const }

    try {
      await getBuildStatus(c, params, makeMockApikey())
    }
    catch {}

    const logCalls = (cloudlogErr as any).mock.calls
    const builderFailLog = logCalls.find((call: any[]) =>
      call[0]?.message === 'Builder status fetch failed',
    )

    expect(builderFailLog).toBeDefined()
    const logEntry = builderFailLog[0]

    // Must NOT log the raw error body
    expect(JSON.stringify(logEntry)).not.toContain('presigned-secret-token-xyz')
    // Must log body length instead
    expect(logEntry.error_length).toBe(sensitiveBody.length)
  })
})
