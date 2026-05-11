import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  checkPermissionMock,
  cloudlogErrMock,
  getEnvMock,
  recordBuildTimeMock,
  supabaseAdminMock,
  supabaseApikeyMock,
} = vi.hoisted(() => ({
  checkPermissionMock: vi.fn(),
  cloudlogErrMock: vi.fn(),
  getEnvMock: vi.fn(),
  recordBuildTimeMock: vi.fn(),
  supabaseAdminMock: vi.fn(),
  supabaseApikeyMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
  cloudlogErr: (...args: unknown[]) => cloudlogErrMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  recordBuildTime: (...args: unknown[]) => recordBuildTimeMock(...args),
  supabaseAdmin: (...args: unknown[]) => supabaseAdminMock(...args),
  supabaseApikey: (...args: unknown[]) => supabaseApikeyMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: (...args: unknown[]) => getEnvMock(...args),
}))

const { getBuildStatus } = await import('../supabase/functions/_backend/public/build/status.ts')

function createContext() {
  return {
    get: (key: string) => {
      if (key === 'requestId')
        return 'build-status-redaction-test'
      return undefined
    },
    json: (data: unknown, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  } as any
}

function createSelectBuilder(result: { data: unknown, error: unknown }, terminal: 'maybeSingle' | 'single') {
  const builder = {
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(result),
  }

  if (terminal === 'maybeSingle')
    builder.single = vi.fn()
  else
    builder.maybeSingle = vi.fn()

  return builder
}

describe('build status builder error redaction', () => {
  const appId = 'com.test.build.status'
  const builderUrl = 'https://builder.capgo.test'
  const jobId = 'job-build-status-redaction'

  beforeEach(() => {
    vi.clearAllMocks()
    checkPermissionMock.mockResolvedValue(true)
    getEnvMock.mockImplementation((_, key: string) => {
      if (key === 'BUILDER_URL')
        return builderUrl
      if (key === 'BUILDER_API_KEY')
        return 'builder-api-secret'
      return ''
    })

    const buildRequestBuilder = createSelectBuilder({
      data: {
        app_id: appId,
        owner_org: 'org-build-status',
        platform: 'ios',
      },
      error: null,
    }, 'maybeSingle')
    const appSettingsBuilder = createSelectBuilder({
      data: {
        build_timeout_seconds: null,
        build_timeout_updated_at: null,
      },
      error: null,
    }, 'single')

    supabaseApikeyMock.mockReturnValue({
      from: (table: string) => {
        if (table === 'build_requests')
          return buildRequestBuilder
        if (table === 'apps')
          return appSettingsBuilder
        throw new Error(`Unexpected table ${table}`)
      },
    })
  })

  it('does not expose raw builder error bodies to API callers or logs', async () => {
    const upstreamBody = 'failed upload https://s3.example/upload?X-Amz-Credential=SECRET&token=abc'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(upstreamBody, {
      status: 502,
    }))

    try {
      let thrown: HTTPException | undefined
      try {
        await getBuildStatus(createContext(), {
          app_id: appId,
          job_id: jobId,
          platform: 'ios',
        }, {
          key: 'api-key',
          user_id: 'user-build-status',
        } as any)
      }
      catch (error) {
        expect(error).toBeInstanceOf(HTTPException)
        thrown = error as HTTPException
      }

      if (!thrown)
        throw new Error('Expected getBuildStatus to throw')

      expect(thrown.status).toBe(400)
      expect(thrown.cause).toMatchObject({
        error: 'builder_error',
        message: 'Failed to get build status',
        moreInfo: { status: 502 },
      })

      const serializedCause = JSON.stringify(thrown.cause)
      expect(serializedCause).not.toContain('SECRET')
      expect(serializedCause).not.toContain('X-Amz-Credential')
      expect(serializedCause).not.toContain('s3.example')
      expect(serializedCause).not.toContain('token=abc')

      const serializedLogs = JSON.stringify(cloudlogErrMock.mock.calls)
      expect(serializedLogs).not.toContain('SECRET')
      expect(serializedLogs).not.toContain('X-Amz-Credential')
      expect(serializedLogs).not.toContain('s3.example')
      expect(serializedLogs).not.toContain('token=abc')
      expect(serializedLogs).toContain('"error_body_length"')
      expect(fetchMock).toHaveBeenCalledWith(`${builderUrl}/jobs/${jobId}`, {
        method: 'GET',
        headers: {
          'x-api-key': 'builder-api-secret',
        },
      })
    }
    finally {
      fetchMock.mockRestore()
    }
  })
})
