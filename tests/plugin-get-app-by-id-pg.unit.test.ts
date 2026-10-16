import { Hono } from 'hono/tiny'
import { describe, expect, it } from 'vitest'
import { getAppByIdPg } from '../supabase/functions/_backend/plugin_runtime/utils/pg.ts'

function drizzleRejecting(error: Error) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.reject(error),
        }),
      }),
    }),
  } as any
}

describe('plugin getAppByIdPg', () => {
  it('rethrows database errors instead of reporting a missing app', async () => {
    const failure = new Error('Connection terminated unexpectedly')
    let thrown: unknown
    const app = new Hono()
    app.get('/', async (c) => {
      try {
        await getAppByIdPg(c, 'com.demo.app', drizzleRejecting(failure), ['mau'])
      }
      catch (error) {
        thrown = error
      }
      return c.body(null, 204)
    })

    await app.request('/')

    expect(thrown).toBe(failure)
  })
})
