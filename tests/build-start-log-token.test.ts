import { jwtVerify } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startBuild } from '../supabase/functions/_backend/public/build/start.ts'

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

describe('build start direct log token', () => {
  const requestId = 'req-build-start-log-token'
  const jobId = 'job-log-token-123'
  const appId = 'com.test.build.logs'
  const userId = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
  const jwtSecret = 'super-secret-jwt-key'
  const publicUrl = 'https://api.capgo.test'
  const builderUrl = 'https://builder.capgo.test'
  const builderApiKey = 'builder-api-key'

  beforeEach(() => {
    mockSupabaseApikey.mockReset()
    mockCheckPermission.mockReset()
    mockGetEnv.mockReset()

    const selectBuilder = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { app_id: appId },
        error: null,
      }),
    }

    const updateBuilder = {
      eq: vi.fn()
        .mockImplementationOnce(() => updateBuilder)
        .mockResolvedValueOnce({ error: null }),
    }

    mockSupabaseApikey.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        expect(table).toBe('build_requests')
        return {
          select: vi.fn().mockReturnValue(selectBuilder),
          update: vi.fn().mockReturnValue(updateBuilder),
        }
      }),
    })

    mockCheckPermission.mockResolvedValue(true)
    mockGetEnv.mockImplementation((_, key: string) => {
      if (key === 'BUILDER_URL')
        return builderUrl
      if (key === 'BUILDER_API_KEY')
        return builderApiKey
      if (key === 'JWT_SECRET')
        return jwtSecret
      if (key === 'PUBLIC_URL')
        return publicUrl
      return ''
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a verifiable direct log token for the builder', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'running',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }))

    const context = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'requestId')
          return requestId
        return undefined
      }),
      json: (data: unknown, status = 200) => new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    }

    try {
      const response = await startBuild(
        context as any,
        jobId,
        appId,
        {
          key: 'cli-api-key',
          user_id: userId,
        } as any,
      )

      expect(response.status).toBe(200)
      const body = await response.json() as {
        status: string
        job_id: string
        logs_url?: string
        logs_token?: string
      }

      expect(body.status).toBe('running')
      expect(body.job_id).toBe(jobId)
      expect(body.logs_url).toBe(`${publicUrl}/build_logs_direct/${jobId}`)
      expect(body.logs_token).toBeTruthy()

      const verification = await jwtVerify(
        body.logs_token!,
        new TextEncoder().encode(jwtSecret),
        {
          issuer: 'capgo',
          audience: 'build-logs',
          subject: userId,
        },
      )

      expect(verification.protectedHeader).toMatchObject({
        alg: 'HS256',
        typ: 'JWT',
      })
      expect(verification.payload.job_id).toBe(jobId)
      expect(verification.payload.app_id).toBe(appId)
      expect(typeof verification.payload.iat).toBe('number')
      expect(typeof verification.payload.exp).toBe('number')
      expect(verification.payload.exp).toBeGreaterThan(verification.payload.iat!)

      expect(fetchMock).toHaveBeenCalledWith(`${builderUrl}/jobs/${jobId}/start`, {
        method: 'POST',
        headers: {
          'x-api-key': builderApiKey,
        },
      })
    }
    finally {
      fetchMock.mockRestore()
    }
  })
})
