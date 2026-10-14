import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono/tiny'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../supabase/functions/_backend/private/request_manifest_upload.ts'
import { ManifestInventoryConflict } from '../supabase/functions/_backend/utils/manifest_inventory.ts'

const mocks = vi.hoisted(() => ({ reserve: vi.fn(), close: vi.fn(), log: vi.fn() }))
vi.mock('../supabase/functions/_backend/utils/hono_middleware.ts', () => ({ middlewareKey: () => async (c: Context, next: () => Promise<void>) => {
  c.set('auth', { userId: '00000000-0000-0000-0000-000000000001' })
  await next()
} }))
vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({ checkPermissionPg: async () => true }))
vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  getPgClient: async () => ({}),
  closeClient: mocks.close,
  logPgError: mocks.log,
  getAppByIdPg: async () => ({ owner_org: 'fake-org', plan_valid: true }),
  getDrizzleClient: () => {
    const chain = { select: () => chain, from: () => chain, where: () => chain, limit: async () => [{ id: 1, appId: 'com.example.fake', deleted: false, deletedAt: null, storageProvider: 'r2-direct', sessionKey: null }] }
    return chain
  },
}))
vi.mock('../supabase/functions/_backend/utils/manifest_inventory.ts', async original => ({ ...await original<object>(), usesManifestInventory: () => true, withManifestInventory: async (_c: unknown, run: (db: unknown) => Promise<unknown>) => run({}), reserveManifestPaths: mocks.reserve }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('MANIFEST_UPLOAD_CAPABILITY_SECRET', 'synthetic-capability-secret-for-tests')
  vi.stubEnv('MANIFEST_UPLOAD_CAPABILITY_KEY_ID', 'test-v1')
  vi.stubEnv('MANIFEST_SIZE_RECEIPT_SECRET', 'synthetic-separate-receipt-secret')
})
afterEach(() => vi.unstubAllEnvs())
async function request() {
  const server = new Hono()
  server.onError((error, c) => error instanceof HTTPException ? c.json(error.cause as object, error.status) : c.json({ error: 'unexpected' }, 500))
  server.route('/', app)
  return server.request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ protocol_version: 1, version_id: 1, delta_encryption: { enabled: false }, manifest_upload_auto_enabled: false, file_hash_format: 'sha256_hex', entries: [{ id: 1, file_name: 'index.js', compression: 'none', file_hash: 'a'.repeat(64), uploaded_bytes_sha256: 'b'.repeat(64), uploaded_bytes_size: 42 }] }) })
}
describe('reservation failure responses', () => {
  it('identifies terminal physical-key conflicts with 409 and releases primary authorization state', async () => {
    mocks.reserve.mockRejectedValue(new ManifestInventoryConflict(['orgs/fake-org/apps/com.example.fake/delta/retired']))
    const response = await request()
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'error_manifest_inventory_conflict', moreInfo: { entries: ['orgs/fake-org/apps/com.example.fake/delta/retired'] } })
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })
  it('keeps database failures distinct as 503 without disguising them as path conflicts', async () => {
    mocks.reserve.mockRejectedValue(new Error('Synthetic inventory connection failure'))
    const response = await request()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'upstream_unavailable' })
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })
})
