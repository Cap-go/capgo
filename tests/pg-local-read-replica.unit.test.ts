import { describe, expect, it } from 'vitest'

import { getDatabaseURL } from '../supabase/functions/_backend/utils/pg.ts'

describe('getDatabaseURL local read replica', () => {
  it.concurrent('prefers LOCAL_READ_REPLICA_DB_URL for read-only requests', () => {
    const ctx = {
      res: new Response('ok'),
      env: {
        LOCAL_READ_REPLICA_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
        ENV_NAME: 'capgo_plugin-local-eu',
        SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      },
      get: (key: string) => (key === 'requestId' ? 'test-request' : undefined),
      set: () => {},
    } as any

    expect(getDatabaseURL(ctx, true)).toBe('postgresql://postgres:postgres@127.0.0.1:55432/postgres')
  })

  it.concurrent('does not route read-write requests to the local read replica', () => {
    const ctx = {
      res: new Response('ok'),
      env: {
        LOCAL_READ_REPLICA_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
        MAIN_SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        ENV_NAME: 'capgo_plugin-local-eu',
      },
      get: (key: string) => (key === 'requestId' ? 'test-request' : undefined),
      set: () => {},
    } as any

    expect(getDatabaseURL(ctx, false)).not.toBe('postgresql://postgres:postgres@127.0.0.1:55432/postgres')
  })
})
