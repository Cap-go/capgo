import type { Context } from 'hono'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { env } from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { getPgClient, closeClient, restoreObjectFromTrash, moveObjectToTrash, deleteObject } = vi.hoisted(() => ({
  getPgClient: vi.fn(),
  closeClient: vi.fn(),
  restoreObjectFromTrash: vi.fn(async (..._args: any[]) => true),
  moveObjectToTrash: vi.fn(),
  deleteObject: vi.fn(),
}))
vi.mock('../supabase/functions/_backend/utils/pg.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../supabase/functions/_backend/utils/pg.ts')>(),
  getPgClient,
  closeClient,
}))
vi.mock('../supabase/functions/_backend/utils/s3.ts', () => ({
  getPath: vi.fn(),
  s3: { restoreObjectFromTrash, moveObjectToTrash, deleteObject },
}))

const { deleteVersionManifestBatch } = await import('../supabase/functions/_backend/utils/manifest_cleanup.ts')
const { persistVersionManifestEntries } = await import('../supabase/functions/_backend/utils/manifest_persist.ts')
const { onVersionUpdateTestUtils } = await import('../supabase/functions/_backend/triggers/on_version_update.ts')

// A separate database preserves test isolation even when files run concurrently.
// The fixture has the production version/manifests key paths and counter types;
// real Drizzle transactions execute the actual cleanup and persistence SQL.
const dbName = `manifest_deletion_${randomUUID().replaceAll('-', '')}`
const parentUrl = env.SUPABASE_DB_URL ?? env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const admin = new Pool({ connectionString: parentUrl, max: 1 })
const dbUrl = new URL(parentUrl)
dbUrl.pathname = `/${dbName}`
const pool = new Pool({ connectionString: dbUrl.toString(), max: 4 })
const database = drizzle({ client: pool })
const c = { get: () => undefined } as unknown as Context
const appId = 'com.test.manifest.deletion'
const record = (id: number) => ({ id, app_id: appId }) as any

async function seedVersion(id: number, count: number, deleted = true, trackedCount = count) {
  await pool.query(`INSERT INTO public.app_versions (id, app_id, deleted, deleted_at, manifest_count)
    VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END, $4)`, [id, appId, deleted, trackedCount])
  if (count > 0) {
    await pool.query(`INSERT INTO public.manifest (app_version_id, file_name, file_hash, s3_path, file_size)
      SELECT $1, 'file-' || i, 'hash-' || i, 'delta/file-' || i, 42 FROM generate_series(1, $2::integer) i`, [id, count])
    await pool.query('UPDATE public.apps SET manifest_bundle_count = manifest_bundle_count + 1 WHERE app_id = $1', [appId])
  }
}

async function state(id: number) {
  const result = await pool.query(`SELECT av.manifest_count, av.manifest, a.manifest_bundle_count,
    (SELECT count(*)::int FROM public.manifest WHERE app_version_id = av.id) AS rows,
    (SELECT count(*)::int FROM public.manifest_trash_restore_pending WHERE app_version_id = av.id) AS pending
    FROM public.app_versions av JOIN public.apps a USING (app_id) WHERE av.id = $1`, [id])
  return result.rows[0]
}

beforeAll(async () => {
  await admin.query(`CREATE DATABASE ${dbName}`)
  await pool.query(`CREATE TABLE public.apps (app_id text PRIMARY KEY, manifest_bundle_count bigint NOT NULL DEFAULT 0, updated_at timestamptz);
    CREATE TABLE public.app_versions (id bigint PRIMARY KEY, app_id text REFERENCES public.apps, deleted boolean DEFAULT false,
      deleted_at timestamptz, manifest_count bigint NOT NULL DEFAULT 0, manifest jsonb, updated_at timestamptz);
    CREATE TABLE public.manifest (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, app_version_id bigint REFERENCES public.app_versions ON DELETE CASCADE,
      file_name text, file_hash text, s3_path text, file_size bigint);
    CREATE INDEX idx_manifest_app_version_id_file_hash ON public.manifest (app_version_id, file_hash) INCLUDE (file_size);
    CREATE INDEX idx_app_versions_deleted_at_id ON public.app_versions (deleted_at, id) WHERE deleted = true;
    CREATE INDEX idx_app_versions_deleted_with_manifest ON public.app_versions (id) WHERE deleted = true AND manifest_count > 0;
    CREATE TABLE public.manifest_per_version (version_id bigint PRIMARY KEY, format_version integer, entry_count integer,
      total_file_size bigint, payload_hash bytea, manifest bytea, size_receipts_provided boolean, manifest_size bigint, manifest_size_payload_hash bytea);
    CREATE TABLE public.manifest_trash_restore_pending (app_version_id bigint REFERENCES public.app_versions ON DELETE CASCADE,
      s3_path text, created_at timestamptz DEFAULT now(), PRIMARY KEY (app_version_id, s3_path));`)
  // Apply the actual migration, including its ownership/permission contract.
  await pool.query(await readFile(new URL('../supabase/migrations/20261013151417_retain_manifest_delta_objects.sql', import.meta.url), 'utf8'))
  getPgClient.mockResolvedValue(pool)
})

beforeEach(async () => {
  vi.clearAllMocks()
  restoreObjectFromTrash.mockResolvedValue(true)
  await pool.query('TRUNCATE public.apps, public.app_versions, public.manifest, public.manifest_per_version, public.manifest_trash_restore_pending CASCADE')
  await pool.query('INSERT INTO public.apps (app_id) VALUES ($1)', [appId])
})

afterAll(async () => {
  await pool.end()
  // All fixture clients must close normally. FORCE can terminate a socket
  // during its graceful shutdown and surface an uncaught pg pool error in CI.
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`)
  await admin.end()
})

describe('manifest deletion Postgres effects', () => {
  it('deletes only its own shared/unreferenced references and finalizes exactly once under concurrent retries', async () => {
    await seedVersion(1, 5000)
    await seedVersion(2, 3000, false)
    await Promise.all(Array.from({ length: 8 }, () => onVersionUpdateTestUtils.deleteManifest(c, record(1))))
    expect(await state(1)).toMatchObject({ rows: 0, manifest_count: '0', manifest_bundle_count: '1' })
    expect(await state(2)).toMatchObject({ rows: 3000, manifest_count: '3000', manifest_bundle_count: '1' })
    expect(pool.totalCount).toBeLessThanOrEqual(4)
    expect(moveObjectToTrash).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
    expect(restoreObjectFromTrash).not.toHaveBeenCalled()
  })

  it('commits partial batches then finishes after interruption without double accounting', async () => {
    await seedVersion(1, 2501)
    expect(await deleteVersionManifestBatch(database, 1)).toEqual({ deleted: 1000, complete: false })
    expect(await state(1)).toMatchObject({ rows: 1501, manifest_count: '2501', manifest_bundle_count: '1' })
    await onVersionUpdateTestUtils.deleteManifest(c, record(1))
    await onVersionUpdateTestUtils.deleteManifest(c, record(1))
    expect(await state(1)).toMatchObject({ rows: 0, manifest_count: '0', manifest_bundle_count: '0' })
  })

  it('rolls back the final row batch when counter finalization fails, including legacy zero-count rows', async () => {
    await seedVersion(1, 1001, true, 0)
    await deleteVersionManifestBatch(database, 1)
    // Force a real error after the last deletion, inside the same transaction.
    await pool.query(`ALTER TABLE public.apps ADD CONSTRAINT reject_finalization CHECK (manifest_bundle_count > 0)`)
    try {
      await expect(deleteVersionManifestBatch(database, 1)).rejects.toThrow()
      expect(await state(1)).toMatchObject({ rows: 1, manifest_bundle_count: '1' })
    }
    finally {
      await pool.query('ALTER TABLE public.apps DROP CONSTRAINT reject_finalization')
    }
    await onVersionUpdateTestUtils.deleteManifest(c, record(1))
    await onVersionUpdateTestUtils.deleteManifest(c, record(1))
    expect(await state(1)).toMatchObject({ rows: 0, manifest_count: '0', manifest_bundle_count: '0' })
  })

  it('clears a JSON-only legacy manifest without decrementing an uncounted bundle', async () => {
    await seedVersion(1, 0)
    await pool.query(`UPDATE public.app_versions SET manifest = '[{"file_name":"legacy"}]' WHERE id = 1`)
    await onVersionUpdateTestUtils.deleteManifest(c, record(1))
    expect(await state(1)).toMatchObject({ manifest: null, manifest_count: '0', manifest_bundle_count: '0' })
  })

  it('sweeps stale counts and pending-only versions without discarding recovery or premature finalization', async () => {
    await seedVersion(1, 0, true, 2)
    await seedVersion(2, 0)
    await pool.query('UPDATE public.apps SET manifest_bundle_count = 1')
    await pool.query(`INSERT INTO public.manifest_trash_restore_pending (app_version_id, s3_path) VALUES (2, 'delta/pending')`)
    expect((await pool.query('SELECT public.sweep_deleted_version_manifests(1) AS count')).rows[0].count).toBe('1')
    expect(await state(1)).toMatchObject({ manifest_count: '2', manifest_bundle_count: '1' })
    expect(await state(2)).toMatchObject({ pending: 1 })
    expect((await pool.query('SELECT public.sweep_deleted_version_manifests(100) AS count')).rows[0].count).toBe('2')
    await onVersionUpdateTestUtils.deleteManifest(c, record(1))
    restoreObjectFromTrash.mockResolvedValue(false)
    await expect(onVersionUpdateTestUtils.deleteManifest(c, record(2))).rejects.toThrow('Cannot restore')
    expect(await state(2)).toMatchObject({ pending: 1 })
    restoreObjectFromTrash.mockResolvedValue(true)
    await onVersionUpdateTestUtils.deleteManifest(c, record(2))
    expect(await state(2)).toMatchObject({ pending: 0, manifest_bundle_count: '0' })
  })

  it('rotates bounded sweeps past permanently failing versions without changing counters', async () => {
    await seedVersion(1, 0)
    await seedVersion(2, 1)
    await seedVersion(3, 1)
    await pool.query('INSERT INTO public.manifest_trash_restore_pending (app_version_id, s3_path) VALUES (1, \'delta/failed\')')
    await pool.query('UPDATE public.app_versions SET updated_at = \'2020-01-01\'::timestamptz + id * interval \'1 second\'')
    const touched: number[] = []
    for (let i = 0; i < 3; i++) {
      await pool.query('SELECT public.sweep_deleted_version_manifests(1)')
      touched.push(Number((await pool.query('SELECT id FROM public.app_versions ORDER BY updated_at DESC LIMIT 1')).rows[0].id))
    }
    expect(touched).toEqual([1, 2, 3])
    expect(await state(1)).toMatchObject({ pending: 1, manifest_bundle_count: '2' })
    expect(await state(2)).toMatchObject({ rows: 1, manifest_count: '1' })
    expect(await state(3)).toMatchObject({ rows: 1, manifest_count: '1' })
  })

  it('rotates a full failed recovery batch so later live objects are recovered on the next pass', async () => {
    await seedVersion(1, 1)
    await pool.query('INSERT INTO public.manifest_trash_restore_pending (app_version_id, s3_path) SELECT 1, \'delta/a-\' || lpad(i::text, 3, \'0\') FROM generate_series(1,100) i')
    await pool.query('INSERT INTO public.manifest_trash_restore_pending (app_version_id, s3_path) VALUES (1, \'delta/z-recoverable\')')
    restoreObjectFromTrash.mockImplementation(async (_c: unknown, path: string) => path === 'delta/z-recoverable')
    await expect(onVersionUpdateTestUtils.deleteManifest(c, record(1))).rejects.toThrow('Cannot restore')
    expect(await state(1)).toMatchObject({ rows: 1, pending: 101 })
    await expect(onVersionUpdateTestUtils.deleteManifest(c, record(1))).rejects.toThrow('Cannot restore')
    expect(await state(1)).toMatchObject({ rows: 1, pending: 100 })
    expect((await pool.query('SELECT count(*)::int AS count FROM public.manifest_trash_restore_pending WHERE s3_path = \'delta/z-recoverable\'')).rows[0].count).toBe(0)
  })

  it('serializes upload finalization with deletion and rejects a stale upload after cleanup', async () => {
    await seedVersion(1, 0, false)
    const upload = [{ file_name: 'file.js', file_hash: 'hash', s3_path: 'delta/file.js', file_size: 5 }]
    const blocker = await pool.connect()
    try {
      await blocker.query('BEGIN')
      await blocker.query('SELECT pg_catalog.pg_advisory_xact_lock(1::bigint)')
      const pending = persistVersionManifestEntries(c, record(1), upload, { trustFileSizes: true })
      // Yield through a database round-trip while persistence waits for the lock.
      await blocker.query('UPDATE public.app_versions SET deleted = true, deleted_at = now() WHERE id = 1')
      await blocker.query('COMMIT')
      await expect(pending).rejects.toThrow('Deleted versions cannot receive manifest entries')
    }
    finally {
      await blocker.query('ROLLBACK')
      blocker.release()
    }
    await onVersionUpdateTestUtils.deleteManifest(c, record(1))
    await expect(persistVersionManifestEntries(c, record(1), upload, { trustFileSizes: true })).rejects.toThrow('Deleted versions cannot receive manifest entries')
    expect(await state(1)).toMatchObject({ rows: 0, manifest_count: '0', manifest_bundle_count: '0' })
  })

  it('leaves tracking intact when an old worker records recovery after the drain', async () => {
    await seedVersion(1, 1)
    await pool.query('INSERT INTO public.manifest_trash_restore_pending (app_version_id, s3_path) VALUES (1, \'delta/recorded\')')
    await expect(deleteVersionManifestBatch(database, 1)).rejects.toThrow('Pending manifest restores remain')
    expect(await state(1)).toMatchObject({ rows: 1, pending: 1, manifest_bundle_count: '1' })
  })

  it('does not remove references or counters for a live version', async () => {
    await seedVersion(1, 1, false)
    expect(await deleteVersionManifestBatch(database, 1)).toEqual({ deleted: 0, complete: true })
    expect(await state(1)).toMatchObject({ rows: 1, manifest_count: '1', manifest_bundle_count: '1' })
  })

  it('cleans a successful finalization that commits before the deletion transition', async () => {
    await seedVersion(1, 0, false)
    await persistVersionManifestEntries(c, record(1), [{ file_name: 'file.js', file_hash: 'hash', s3_path: 'delta/file.js', file_size: 5 }], { trustFileSizes: true })
    await pool.query('UPDATE public.app_versions SET deleted = true, deleted_at = now() WHERE id = 1')
    await onVersionUpdateTestUtils.deleteManifest(c, record(1))
    expect(await state(1)).toMatchObject({ rows: 0, manifest_count: '0', manifest_bundle_count: '0' })
  })
})
