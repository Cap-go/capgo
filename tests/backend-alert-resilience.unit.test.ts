import { describe, expect, it, vi } from 'vitest'

function createTestContext() {
  return {
    get(key: string) {
      if (key === 'requestId')
        return 'req-test'
      if (key === 'fileId')
        return 'orgs/test-org/apps/test-app/test.zip'
      return undefined
    },
  } as any
}

describe('backend alert resilience helpers', () => {
  it('clears stale thrown errors after a later retry succeeds', async () => {
    const { retryWithBackoff } = await import('../supabase/functions/_backend/utils/retry.ts')

    let attempts = 0
    const outcome = await retryWithBackoff(async () => {
      attempts += 1

      if (attempts === 1) {
        throw new Error('temporary queue failure')
      }

      return { ok: true }
    }, {
      attempts: 3,
      baseDelayMs: 1,
    })

    expect(attempts).toBe(2)
    expect(outcome.result).toEqual({ ok: true })
    expect(outcome.lastError).toBeUndefined()
    expect(outcome.attempts).toBe(2)
  })

  it('retries retryable durable object resets for replayable upload requests', async () => {
    const { filesTestUtils } = await import('../supabase/functions/_backend/files/files.ts')

    const handler = {
      fetch: vi.fn(),
    } as any

    let attempts = 0
    handler.fetch.mockImplementation(async () => {
      attempts += 1
      if (attempts === 1) {
        throw Object.assign(
          new Error('cannot access storage because object has moved to a different machine'),
          {
            retryable: true,
            durableObjectReset: true,
          },
        )
      }

      return new Response(null, { status: 204 })
    })

    const response = await filesTestUtils.fetchUploadHandlerWithRetry(
      createTestContext(),
      handler,
      new Request('http://localhost/files/upload/attachments/test.zip', {
        method: 'HEAD',
      }),
    )

    expect(response.status).toBe(204)
    expect(handler.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns retryable response for streaming upload bodies when a durable object moves', async () => {
    const { filesTestUtils } = await import('../supabase/functions/_backend/files/files.ts')

    const handler = {
      fetch: vi.fn(),
    } as any

    handler.fetch.mockImplementation(async () => {
      throw Object.assign(
        new Error('cannot access storage because object has moved to a different machine'),
        {
          retryable: true,
          durableObjectReset: true,
        },
      )
    })

    const response = await filesTestUtils.fetchUploadHandlerWithRetry(
      createTestContext(),
      handler,
      new Request('http://localhost/files/upload/attachments/test.zip', {
        method: 'PATCH',
        body: 'chunk-data',
      }),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('1')
    expect(response.headers.get('Tus-Resumable')).toBe('1.0.0')
    await expect(response.json()).resolves.toEqual({
      error: 'upload_retryable',
      message: 'Upload worker moved during this request. Retry the upload request.',
    })
    expect(handler.fetch).toHaveBeenCalledTimes(1)
  })

  it('retries transient PostgREST 502 responses for cron_stat_app', async () => {
    const { cronStatAppTestUtils } = await import('../supabase/functions/_backend/triggers/cron_stat_app.ts')

    let attempts = 0
    const result = await cronStatAppTestUtils.runSupabaseResultWithRetry(
      createTestContext(),
      'test_postgrest_retry',
      async () => {
        attempts += 1

        if (attempts === 1) {
          return {
            data: null,
            error: {
              name: 'PostgrestError',
              message: 'error code: 502',
            },
          }
        }

        return {
          data: { ok: true },
          error: null,
        }
      },
    )

    expect(attempts).toBe(2)
    expect(result.data).toEqual({ ok: true })
  })

  it('retries transient PostgREST top-level 502 statuses for cron_stat_app', async () => {
    const { cronStatAppTestUtils } = await import('../supabase/functions/_backend/triggers/cron_stat_app.ts')

    let attempts = 0
    const result = await cronStatAppTestUtils.runSupabaseResultWithRetry(
      createTestContext(),
      'test_postgrest_top_level_status_retry',
      async () => {
        attempts += 1

        if (attempts === 1) {
          return {
            data: null,
            error: {
              name: 'PostgrestError',
              message: 'temporary upstream failure',
            },
            status: 502,
          }
        }

        return {
          data: { ok: true },
          error: null,
          status: 200,
        }
      },
    )

    expect(attempts).toBe(2)
    expect(result.data).toEqual({ ok: true })
  })

  it('skips stale cron_stat_app jobs when the app no longer exists', async () => {
    vi.resetModules()
    vi.doMock('../supabase/functions/_backend/utils/hono.ts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../supabase/functions/_backend/utils/hono.ts')>()
      return {
        ...actual,
        middlewareAPISecret: async (_c: any, next: any) => {
          await next()
        },
      }
    })
    vi.doMock('../supabase/functions/_backend/utils/supabase.ts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../supabase/functions/_backend/utils/supabase.ts')>()
      return {
        ...actual,
        supabaseAdmin: () => ({
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    })

    const { app: cronStatApp } = await import('../supabase/functions/_backend/triggers/cron_stat_app.ts')
    const response = await cronStatApp.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appId: 'missing-app',
          orgId: 'test-org',
        }),
      }),
      {} as any,
      { waitUntil: () => undefined } as any,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      reason: 'app_not_found',
      status: 'skipped',
    })
  })
})
