import { describe, expect, it, vi } from 'vitest'
import { X_UPLOAD_HANDLER_RETRYABLE } from '../supabase/functions/_backend/files/util.ts'
import { existInEnv, getEnv } from '../supabase/functions/_backend/utils/utils.ts'

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

  it.concurrent('retries retryable durable object responses for empty-body upload creation requests', async () => {
    const { filesTestUtils } = await import('../supabase/functions/_backend/files/files.ts')

    const handler = {
      fetch: vi.fn(),
    } as any

    handler.fetch
      .mockImplementationOnce(async (request: Request) => {
        expect(request.body).toBeNull()
        return new Response(JSON.stringify({
          error: 'durable_object_temporarily_unavailable',
        }), {
          status: 503,
          headers: {
            [X_UPLOAD_HANDLER_RETRYABLE]: '1',
          },
        })
      })
      .mockImplementationOnce(async (request: Request) => {
        expect(request.body).toBeNull()
        return new Response(null, { status: 201 })
      })

    const response = await filesTestUtils.fetchUploadHandlerWithRetry(
      createTestContext(),
      handler,
      new Request('http://localhost/files/upload/attachments/test.zip', {
        method: 'POST',
        headers: {
          'Content-Length': '0',
          'Tus-Resumable': '1.0.0',
        },
      }),
    )

    expect(response.status).toBe(201)
    expect(handler.fetch).toHaveBeenCalledTimes(2)
  })

  it.concurrent('forwards a replayable zero-byte TUS creation-with-upload body', async () => {
    const { filesTestUtils } = await import('../supabase/functions/_backend/files/files.ts')

    const forwardedBodyLengths: number[] = []
    const handler = {
      fetch: vi.fn(async (request: Request) => {
        expect(request.body).not.toBeNull()
        forwardedBodyLengths.push((await request.arrayBuffer()).byteLength)

        if (forwardedBodyLengths.length === 1) {
          return new Response(JSON.stringify({
            error: 'durable_object_temporarily_unavailable',
          }), {
            status: 503,
            headers: {
              [X_UPLOAD_HANDLER_RETRYABLE]: '1',
            },
          })
        }

        return new Response(null, { status: 201 })
      }),
    } as any

    const response = await filesTestUtils.fetchUploadHandlerWithRetry(
      createTestContext(),
      handler,
      new Request('http://localhost/files/upload/attachments/test.zip', {
        method: 'POST',
        headers: {
          'Content-Length': '0',
          'Content-Type': 'application/offset+octet-stream',
          'Tus-Resumable': '1.0.0',
          'Upload-Length': '0',
        },
        body: new ArrayBuffer(0),
      }),
    )

    expect(response.status).toBe(201)
    expect(handler.fetch).toHaveBeenCalledTimes(2)
    expect(forwardedBodyLengths).toEqual([0, 0])
  })

  it.concurrent('forwards a replayable zero-byte TUS patch body', async () => {
    const { filesTestUtils } = await import('../supabase/functions/_backend/files/files.ts')

    const forwardedBodyLengths: number[] = []
    const handler = {
      fetch: vi.fn(async (request: Request) => {
        expect(request.body).not.toBeNull()
        forwardedBodyLengths.push((await request.arrayBuffer()).byteLength)

        if (forwardedBodyLengths.length === 1) {
          return new Response(JSON.stringify({
            error: 'durable_object_temporarily_unavailable',
          }), {
            status: 503,
            headers: {
              [X_UPLOAD_HANDLER_RETRYABLE]: '1',
            },
          })
        }

        return new Response(null, { status: 204 })
      }),
    } as any

    const response = await filesTestUtils.fetchUploadHandlerWithRetry(
      createTestContext(),
      handler,
      new Request('http://localhost/files/upload/attachments/test.zip', {
        method: 'PATCH',
        headers: {
          'Content-Length': '0',
          'Content-Type': 'application/offset+octet-stream',
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': '0',
        },
        body: new ArrayBuffer(0),
      }),
    )

    expect(response.status).toBe(204)
    expect(handler.fetch).toHaveBeenCalledTimes(2)
    expect(forwardedBodyLengths).toEqual([0, 0])
  })

  it.concurrent('recovers upload offset after a retryable durable object patch response', async () => {
    const { filesTestUtils } = await import('../supabase/functions/_backend/files/files.ts')

    const handler = {
      fetch: vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          error: 'durable_object_temporarily_unavailable',
        }), {
          status: 503,
          headers: {
            [X_UPLOAD_HANDLER_RETRYABLE]: '1',
          },
        }))
        .mockResolvedValueOnce(new Response(null, {
          status: 200,
          headers: {
            'Upload-Offset': '5242880',
            'Tus-Resumable': '1.0.0',
          },
        })),
    } as any

    const response = await filesTestUtils.fetchUploadHandlerWithRetry(
      createTestContext(),
      handler,
      new Request('http://localhost/files/upload/attachments/test.zip', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': '0',
          'Tus-Resumable': '1.0.0',
        },
        body: 'chunk-data',
      }),
    )

    expect(response.status).toBe(409)
    expect(response.headers.get('Upload-Offset')).toBe('5242880')
    expect(handler.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry retryable durable object resets for streaming upload bodies', async () => {
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

    await expect(filesTestUtils.fetchUploadHandlerWithRetry(
      createTestContext(),
      handler,
      new Request('http://localhost/files/upload/attachments/test.zip', {
        method: 'PATCH',
        body: 'chunk-data',
      }),
    )).rejects.toThrow('cannot access storage because object has moved to a different machine')

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

  it.concurrent('retries transient PostgREST statuses for on_manifest_create updates', async () => {
    const { onManifestCreateTestUtils } = await import('../supabase/functions/_backend/triggers/on_manifest_create.ts')

    let attempts = 0
    await onManifestCreateTestUtils.runManifestUpdateWithRetry(
      createTestContext(),
      async () => {
        attempts += 1

        if (attempts === 1) {
          return {
            error: {
              name: 'PostgrestError',
              message: 'error code: 502',
            },
            status: 502,
          }
        }

        return {
          error: null,
          status: 204,
        }
      },
    )

    expect(attempts).toBe(2)
  })

  it.concurrent('returns empty strings when env bindings are missing from the context', () => {
    const context = {
      req: {
        header: () => undefined,
      },
    } as any

    expect(existInEnv(context, 'ENVIRONMENT')).toBe(false)
    expect(getEnv(context, 'ENVIRONMENT')).toBe('')
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
