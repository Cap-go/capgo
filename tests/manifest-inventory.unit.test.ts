import type { ClientBase } from 'pg'
import { Hono } from 'hono/tiny'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inventoryCandidatePath, reserveManifestPaths } from '../supabase/functions/_backend/utils/manifest_inventory.ts'
import { createManifestUploadResponse, validateManifestUploadRequest } from '../supabase/functions/_backend/utils/manifest_upload.ts'
import { verifyManifestUploadCapability } from '../supabase/functions/_backend/utils/manifest_upload_capability.ts'

vi.mock('../supabase/functions/_backend/utils/r2_inventory.ts', async importOriginal => ({
  ...await importOriginal<object>(),
  inventoryTransaction: async (_db: unknown, run: () => Promise<unknown>) => run(),
}))

describe('bounded manifest reservations', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('performs exactly two rechecks and one UUID attempt on reservation conflicts, only for unresolved files', async () => {
    const query = vi.fn().mockImplementation(async (sql: string, values: unknown[]) => {
      if (sql.startsWith('SELECT'))
        return { rows: [] }
      const selected = JSON.parse(values[1] as string) as { key: string }[]
      return { rows: selected.filter(file => file.key.endsWith('/stable')).map(file => ({ r2_key: file.key })) }
    })
    await expect(reserveManifestPaths({ query } as unknown as ClientBase, 'fake-bucket', 'delta/', ['stable', 'contended'], [1, 1], () => 'fake-uuid')).rejects.toThrow('Manifest objects')
    const reads = query.mock.calls.filter(([sql]) => sql.startsWith('SELECT'))
    const writes = query.mock.calls.filter(([sql]) => sql.startsWith('INSERT'))
    expect(reads).toHaveLength(3)
    expect(writes).toHaveLength(4)
    expect(reads.map(([, args]) => args[1].length)).toEqual([40, 20, 20])
    expect(JSON.parse(writes[3][1][1])).toEqual([{ index: 1, size: 1, key: 'delta/fake-uuid/contended' }])
  })

  it('aborts immediately on database failure without UUID fallback', async () => {
    const uuid = vi.fn()
    const query = vi.fn().mockRejectedValue(new Error('Database unavailable'))
    await expect(reserveManifestPaths({ query } as unknown as ClientBase, 'fake', 'delta/', ['file'], [1], uuid)).rejects.toThrow('Database unavailable')
    expect(query).toHaveBeenCalledTimes(1)
    expect(uuid).not.toHaveBeenCalled()
  })

  it.each([5000, 10_000])('keeps candidate expansion bounded for %i files', async (count) => {
    const query = vi.fn().mockImplementation(async (sql: string, args: unknown[]) => sql.startsWith('SELECT')
      ? { rows: [] }
      : { rows: (JSON.parse(args[1] as string) as { key: string }[]).map(file => ({ r2_key: file.key })) })
    const suffixes = Array.from({ length: count }, (_, i) => `file-${i}`)
    const paths = await reserveManifestPaths({ query } as unknown as ClientBase, 'fake', 'delta/', suffixes, suffixes.map(() => 1))
    expect(paths).toHaveLength(count)
    const reads = query.mock.calls.filter(([sql]) => sql.startsWith('SELECT'))
    expect(reads).toHaveLength(count / 100)
    expect(Math.max(...reads.map(([, args]) => args[1].length))).toBe(2000)
  })

  it('preserves generation zero, encryption prefix and both path bounds', () => {
    expect(inventoryCandidatePath('delta/', 'hash_index.js.br', 0)).toBe('delta/hash_index.js.br')
    expect(inventoryCandidatePath('delta/session/', 'hash_index.js.br', 1)).toBe('delta/session/1/hash_index.js.br')
    expect(() => inventoryCandidatePath('delta/', 'a'.repeat(1020), 1)).toThrow('storage limits')
  })

  it.each([false, true])('binds the capability to the reserved key after the existing session path (encrypted=%s)', async (encrypted) => {
    const secret = '0123456789abcdef0123456789abcdef'
    const request = validateManifestUploadRequest({ protocol_version: 1, version_id: 1, delta_encryption: { enabled: encrypted }, manifest_upload_auto_enabled: false, file_hash_format: encrypted ? 'rsa_v3_hex' : 'sha256_hex', entries: [{ id: 1, file_name: 'index.js.br', compression: 'brotli', file_hash: 'a'.repeat(encrypted ? 512 : 64), uploaded_bytes_sha256: 'b'.repeat(64), uploaded_bytes_size: 42 }] })
    const response = await createManifestUploadResponse(request, { ownerOrg: 'fake-org', appId: 'com.example.fake', sessionKey: encrypted ? 'session' : null, secret, keyId: 'test-v1', publicBaseUrl: 'https://api.example.com', reservePaths: async (_prefix, suffixes) => suffixes.map(suffix => `1/${suffix}`) })
    expect(response.entries[0].s3_path_suffix).toMatch(/^1\/[a-f0-9]{64}_index.js.br$/)
    expect(response.default_s3_path_prefix).toBe(`orgs/fake-org/apps/com.example.fake/delta/${encrypted ? '73657373696f6e/' : ''}`)
    const target = response.upload_targets[0]
    const token = `${target.authorization.token_prefix}${response.entries[0].upload_token}`
    const path = `${response.default_s3_path_prefix}${response.entries[0].s3_path_suffix}`
    const app = new Hono()
    app.get('/', async c => c.json(await verifyManifestUploadCapability(c, token, c.req.query('path')!)))
    const env = { MANIFEST_UPLOAD_CAPABILITY_SECRET: secret, MANIFEST_UPLOAD_CAPABILITY_KEY_ID: 'test-v1' }
    vi.stubEnv('MANIFEST_UPLOAD_CAPABILITY_SECRET', secret)
    vi.stubEnv('MANIFEST_UPLOAD_CAPABILITY_KEY_ID', 'test-v1')
    expect(await (await app.request(`/?path=${encodeURIComponent(path)}`, undefined, env)).json()).toMatchObject({ ok: true })
    expect(await (await app.request(`/?path=${encodeURIComponent(path.replace('/1/', '/'))}`, undefined, env)).json()).toMatchObject({ ok: false })
  })
})
