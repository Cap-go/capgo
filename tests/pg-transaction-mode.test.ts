import type { Context } from 'hono'
import { env } from 'node:process'
import { sql } from 'drizzle-orm'
import { Client, Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { closeClient as closePluginClient, createLazyPgClient, getDrizzleClient as getPluginDrizzleClient, getPgClient as getPluginPgClient } from '../supabase/functions/_backend/plugin_runtime/utils/pg.ts'
import { checkoutPgClient, closeClient, getDrizzleClient, getPgClient, releasePgClient, withPgTransaction } from '../supabase/functions/_backend/utils/pg.ts'

const runtime = vi.hoisted(() => ({ key: 'node' }))
vi.mock('hono/adapter', async importOriginal => ({
  ...await importOriginal<typeof import('hono/adapter')>(),
  env: (c: Context) => c.env,
  getRuntimeKey: () => runtime.key,
}))

const connectionString = env.SUPABASE_DB_URL ?? env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function context() {
  const variables = new Map<string, unknown>([['requestId', 'test-transaction-mode']])
  return {
    env: {
      HYPERDRIVE_CAPGO_DIRECT_EU: { connectionString },
      CAPGO_PREVENT_BACKGROUND_FUNCTIONS: 'true',
      SB_REGION: 'eu-west-3',
    },
    get: (key: string) => variables.get(key),
    set: (key: string, value: unknown) => variables.set(key, value),
    header: vi.fn(),
    req: { header: () => undefined, raw: Object.assign(new Request('https://example.test/updates'), { cf: { continent: 'EU', country: 'FR' } }) },
    res: new Response(null),
  } as unknown as Context
}

describe('pooled PostgreSQL transaction access modes', () => {
  it.each([
    ['API', 'node', getPgClient, closeClient],
    ['API', 'workerd', getPgClient, closeClient],
    ['plugin fallback', 'node', getPluginPgClient, closePluginClient],
    ['plugin fallback', 'workerd', getPluginPgClient, closePluginClient],
  ] as const)('restricts %s primary reads in %s without changing the backend session default', async (_name, runtimeKey, create, close) => {
    runtime.key = runtimeKey
    const c = context()
    const reader = await create(c, true)
    try {
      expect((await reader.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on')
      expect((await reader.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only).toBe('off')
      await expect(reader.query('CREATE TABLE public.readonly_must_not_exist (id int)')).rejects.toMatchObject({ code: '25006' })
    }
    finally {
      await close(c, reader)
      if (runtimeKey === 'workerd') {
        // close() must roll back, but Hyperdrive owns ending the edge connection.
        const rawQuery = Client.prototype.query.bind(reader as Client) as (text: string) => Promise<{ rows: Record<string, string>[] }>
        expect((await rawQuery('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('off')
        expect((await rawQuery('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only).toBe('off')
        await reader.end()
      }
      runtime.key = 'node'
    }
  })

  it('does not let nested root transactions end a primary reader restriction', async () => {
    const c = context()
    const reader = await getPgClient(c, true)
    try {
      await expect(withPgTransaction(reader, async () => undefined)).rejects.toThrow('primary read session')
      await expect(getDrizzleClient(reader, { logger: false }).transaction(async () => undefined)).rejects.toThrow('primary read session')
      expect((await reader.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on')
    }
    finally {
      await closeClient(c, reader)
    }
  })

  it('keeps checked-out primary readers restricted and releases them at close', async () => {
    const c = context()
    const reader = await getPgClient(c, true)
    try {
      const client = await checkoutPgClient(reader)
      expect((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on')
      releasePgClient(reader, client)
      expect((await reader.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on')
    }
    finally {
      await closeClient(c, reader)
      await closeClient(c, reader)
    }
  })

  it('starts raw writer transactions read-write even on a contaminated backend', async () => {
    const pool = new Pool({ connectionString, max: 1 })
    try {
      await pool.query('SET default_transaction_read_only = on')
      const backend = (await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      await withPgTransaction(pool, async (client) => {
        expect((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid).toBe(backend)
        expect((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('off')
        await client.query('CREATE TEMP TABLE transaction_writer (id int)')
      })
      // The transaction override must not mutate session defaults either.
      expect((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only).toBe('on')
    }
    finally {
      await pool.end()
    }
  })

  it('starts Drizzle writer transactions read-write on a contaminated backend', async () => {
    const client = new Client({ connectionString })
    await client.connect()
    try {
      await client.query('SET default_transaction_read_only = on')
      await getDrizzleClient(client, { logger: false }).transaction(async (tx) => {
        expect((await tx.execute(sql`SHOW transaction_read_only`)).rows[0]).toMatchObject({ transaction_read_only: 'off' })
        await tx.execute(sql`CREATE TEMP TABLE drizzle_writer (id int)`)
      })
      expect((await client.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only).toBe('on')
    }
    finally {
      await client.end()
    }
  })

  it('preserves explicitly read-only Drizzle transaction configuration', async () => {
    const client = new Client({ connectionString })
    await client.connect()
    try {
      await getDrizzleClient(client, { logger: false }).transaction(async (tx) => {
        expect((await tx.execute(sql`SHOW transaction_read_only`)).rows[0]).toMatchObject({ transaction_read_only: 'on' })
      }, { accessMode: 'read only', isolationLevel: 'repeatable read' })
    }
    finally {
      await client.end()
    }
  })

  it('preserves a lazy replica reader mode when starting a Drizzle transaction', async () => {
    const c = context()
    c.env.HYPERDRIVE_CAPGO_READ_EU = { connectionString }
    c.set('requireReadReplica', true)
    const lazy = createLazyPgClient(c, true)
    try {
      expect(lazy.isConnected()).toBe(false)
      await getPluginDrizzleClient(lazy.client, { logger: false }).transaction(async (tx) => {
        expect(c.get('databaseSource')).toBe('HYPERDRIVE_CAPGO_READ_EU')
        expect((await tx.execute(sql`SHOW transaction_read_only`)).rows[0]).toMatchObject({ transaction_read_only: 'on' })
      })
    }
    finally {
      await lazy.close()
    }
  })

  it('rejects a read-write upgrade through a lazy replica reader', async () => {
    const c = context()
    c.env.HYPERDRIVE_CAPGO_READ_EU = { connectionString }
    c.set('requireReadReplica', true)
    const lazy = createLazyPgClient(c, true)
    const run = vi.fn(async () => undefined)
    try {
      await expect(getPluginDrizzleClient(lazy.client, { logger: false }).transaction(run, { accessMode: 'read write' })).rejects.toThrow('read-only client')
      expect(run).not.toHaveBeenCalled()
    }
    finally {
      await lazy.close()
    }
  })

  it('does not let a lazy root transaction end its primary read restriction', async () => {
    const c = context()
    const lazy = createLazyPgClient(c, true)
    const run = vi.fn(async () => undefined)
    try {
      await expect(getPluginDrizzleClient(lazy.client, { logger: false }).transaction(run)).rejects.toThrow('primary read session')
      expect(run).not.toHaveBeenCalled()
      expect((await lazy.client.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on')
    }
    finally {
      await lazy.close()
    }
  })

  it('allows a caught failed primary read to fall back inside a fresh read-only transaction', async () => {
    const c = context()
    const reader = await getPgClient(c, true)
    try {
      await expect(reader.query('SELECT nonexistent_transaction_mode_column')).rejects.toMatchObject({ code: '42703' })
      expect((await reader.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on')
      expect((await getDrizzleClient(reader, { logger: false }).execute(sql`SELECT 1 AS ok`)).rows[0]).toMatchObject({ ok: 1 })
      expect((await reader.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only).toBe('off')
    }
    finally {
      await closeClient(c, reader)
    }
  })

  it('keeps queued reads protected while recovering an earlier query failure', async () => {
    const c = context()
    const reader = await getPgClient(c, true)
    try {
      const results = await Promise.allSettled([
        reader.query('SELECT nonexistent_transaction_mode_column'),
        reader.query('SHOW transaction_read_only'),
      ])
      expect(results[0]).toMatchObject({ status: 'rejected', reason: { code: '42703' } })
      expect(results[1]).toMatchObject({ status: 'fulfilled', value: { rows: [{ transaction_read_only: 'on' }] } })
    }
    finally {
      await closeClient(c, reader)
    }
  })

  it('preserves callback queries when recovering a failed primary read', async () => {
    const c = context()
    const reader = await getPgClient(c, true)
    try {
      await new Promise<void>((resolve) => {
        reader.query('SELECT nonexistent_transaction_mode_column', (error) => {
          expect(error).toMatchObject({ code: '42703' })
          resolve()
        })
      })
      const result = await new Promise((resolve, reject) => {
        reader.query('SHOW transaction_read_only', (error, result) => error ? reject(error) : resolve(result))
      })
      expect(result).toMatchObject({ rows: [{ transaction_read_only: 'on' }] })
    }
    finally {
      await closeClient(c, reader)
    }
  })
})
