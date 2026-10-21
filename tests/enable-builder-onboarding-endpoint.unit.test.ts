import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../supabase/functions/_backend/utils/hono.ts'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../supabase/functions/_backend/public/app/index.ts'

const mocks = vi.hoisted(() => ({
  auth: null as AuthInfo | null,
  permission: vi.fn(),
  lockedPermission: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  getPool: vi.fn(),
  getDrizzle: vi.fn(),
  close: vi.fn(),
}))
vi.mock('../supabase/functions/_backend/utils/pg.ts', async original => ({ ...await original<object>(), getPgClient: mocks.getPool, getDrizzleClient: mocks.getDrizzle, closeClient: mocks.close }))
vi.mock('../supabase/functions/_backend/utils/rbac.ts', async original => ({ ...await original<object>(), checkPermission: mocks.permission, checkPermissionPg: mocks.lockedPermission }))
vi.mock('../supabase/functions/_backend/utils/hono_middleware.ts', async (original) => {
  const actual = await original<typeof import('../supabase/functions/_backend/utils/hono_middleware.ts')>()
  return {
    ...actual,
    middlewareAuth: () => async (c: Context<MiddlewareKeyVariables>, next: () => Promise<void>) => {
      if (!mocks.auth)
        return actual.middlewareAuth()(c, next)
      c.set('auth', mocks.auth)
      await next()
    },
  }
})

const appId = 'com.test.builder.activation'
const tx = { execute: mocks.execute }
const pool = {}
const dialect = new PgDialect()
let row: { app_id: string, owner_org: string, onboarding: any, need_onboarding: boolean } | null
let writes: Array<{ sql: string, params: unknown[] }>
let order: string[]
const request = (id = appId) => app.request(`http://local/${encodeURIComponent(id)}/onboarding/builder`, { method: 'POST' })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth = { userId: 'fixture-user', authType: 'jwt', jwt: null, apikey: null } as AuthInfo
  row = { app_id: appId, owner_org: 'fixture-org', need_onboarding: true, onboarding: { setup: { todo_list_version: 3, steps: { add_code: { status: 'done', annotation: 'concurrent progress' } } } } }
  writes = []
  order = []
  mocks.permission.mockResolvedValue(true)
  mocks.lockedPermission.mockImplementation(async () => {
    expect(order.at(-1)).toBe('lock')
    order.push('permission')
    return true
  })
  mocks.getPool.mockReturnValue(pool)
  mocks.getDrizzle.mockReturnValue({ transaction: mocks.transaction })
  mocks.transaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
    order.push('begin')
    const result = await callback(tx)
    order.push('commit')
    return result
  })
  mocks.execute.mockImplementation(async (statement) => {
    const query = dialect.sqlToQuery(statement)
    if (query.sql.includes('lock_rbac_orgs'))
      order.push('org-lock')
    if (query.sql.includes('FOR UPDATE'))
      order.push('lock')
    if (query.sql.includes('UPDATE public.apps')) {
      writes.push(query)
      order.push('write')
      return { rows: [] }
    }
    return { rows: row && query.sql.includes('FROM public.apps') ? [row] : [] }
  })
})

describe('pOST /app/:id/onboarding/builder', () => {
  it.each(['jwt', 'apikey'] as const)('converts the latest locked state after checking %s permissions and closes the connection', async (authType) => {
    mocks.auth = { ...mocks.auth!, authType, apikey: authType === 'apikey' ? { key: 'fixture-key' } : null } as AuthInfo
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { onboarding } = await response.json() as any
    expect(onboarding.setup).toMatchObject({ todo_list_version: 4, paths: ['ota', 'builder'], selected_path: 'builder', steps: { ota: row!.onboarding.setup.steps } })
    expect(order).toEqual(['begin', 'org-lock', 'lock', 'permission', 'write', 'commit'])
    expect(mocks.permission).toHaveBeenCalledWith(expect.anything(), 'app.update_settings', { appId })
    expect(mocks.lockedPermission).toHaveBeenCalledWith(expect.anything(), 'app.update_settings', { appId }, tx, 'fixture-user', authType === 'apikey' ? 'fixture-key' : null)
    expect(writes).toHaveLength(1)
    expect(JSON.parse(writes[0].params[0] as string)).toEqual(onboarding)
    expect(writes[0].params[1]).toBe(appId)
    expect(writes[0].sql).toContain('IS DISTINCT FROM')
    expect(writes[0].sql).not.toContain('need_onboarding')
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(expect.anything(), pool)
  })

  it('rejects anonymous callers before opening a database connection', async () => {
    mocks.auth = null
    expect((await request()).status).toBe(401)
    expect(mocks.getPool).not.toHaveBeenCalled()
  })

  it('rejects invalid app IDs before checking permission', async () => {
    expect((await request('invalid')).status).toBe(400)
    expect(mocks.permission).not.toHaveBeenCalled()
    expect(mocks.getPool).not.toHaveBeenCalled()
  })

  it('rejects readers and unrelated users without reading or writing the app', async () => {
    mocks.permission.mockResolvedValue(false)
    expect((await request()).status).toBe(403)
    expect(mocks.getPool).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })

  it('rejects permission revoked between preflight and acquiring the lock', async () => {
    mocks.lockedPermission.mockResolvedValue(false)
    expect((await request()).status).toBe(403)
    expect(writes).toEqual([])
    expect(order).not.toContain('commit')
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('rejects future checklist versions without writing', async () => {
    row!.onboarding.setup.todo_list_version = 5
    expect((await request()).status).toBe(409)
    expect(writes).toEqual([])
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('handles an app deleted between preflight and locking', async () => {
    row = null
    expect((await request()).status).toBe(404)
    expect(writes).toEqual([])
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('releases the connection when persistence fails', async () => {
    mocks.transaction.mockRejectedValue(new Error('database unavailable'))
    expect((await request()).status).toBe(500)
    expect(mocks.close).toHaveBeenCalledOnce()
  })
})
