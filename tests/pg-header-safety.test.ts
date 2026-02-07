import { describe, expect, it } from 'vitest'

import { getDatabaseURL } from '../supabase/functions/_backend/utils/pg.ts'

describe('getDatabaseURL header safety', () => {
  it.concurrent('does not try to mutate headers when response body was already consumed', async () => {
    const res = new Response('ok')
    await res.text() // mark bodyUsed=true

    let headerCalls = 0
    const ctx = {
      res,
      env: {
        // Provide a deterministic code path that doesn't depend on host env vars.
        HYPERDRIVE_CAPGO_DIRECT_EU: { connectionString: 'postgres://postgres:postgres@localhost:5432/postgres' },
        // Included to satisfy environments where `getEnv()` might read from `c.env`.
        SUPABASE_DB_URL: 'postgres://postgres:postgres@localhost:5432/postgres',
      },
      header: () => {
        headerCalls++
        throw new TypeError('This ReadableStream is disturbed (has already been read from), and cannot be used as a body.')
      },
      get: (key: string) => (key === 'requestId' ? 'test-request' : undefined),
      set: () => {},
    } as any

    expect(() => getDatabaseURL(ctx)).not.toThrow()
    expect(headerCalls).toBe(0)
  })

  it.concurrent('does not try to mutate headers when response body stream is locked', () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('ok'))
        controller.close()
      },
    })
    const res = new Response(stream)
    // Lock the response body as if the runtime started streaming it already.
    res.body?.getReader()

    let headerCalls = 0
    const ctx = {
      res,
      env: {
        // Provide a deterministic code path that doesn't depend on host env vars.
        HYPERDRIVE_CAPGO_DIRECT_EU: { connectionString: 'postgres://postgres:postgres@localhost:5432/postgres' },
        // Included to satisfy environments where `getEnv()` might read from `c.env`.
        SUPABASE_DB_URL: 'postgres://postgres:postgres@localhost:5432/postgres',
      },
      header: () => {
        headerCalls++
        throw new TypeError('This ReadableStream is disturbed (has already been read from), and cannot be used as a body.')
      },
      get: (key: string) => (key === 'requestId' ? 'test-request' : undefined),
      set: () => {},
    } as any

    expect(() => getDatabaseURL(ctx)).not.toThrow()
    expect(headerCalls).toBe(0)
  })
})
