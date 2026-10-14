/**
 * Requeue legacy deleted versions whose manifest rows have a zero counter.
 * Database only: no object listing, trash, deletion or restoration.
 * After deploying the handler and draining old workers, run once before the
 * retirement migration. Rerun with the same checkpoint to resume interruptions.
 *
 * SUPABASE_DB_URL=... bun scripts/reclaim_deleted_version_manifests.ts
 */
import type { PoolClient } from 'pg'
import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'
import { Client } from 'pg'

export interface ManifestRequeueCursor {
  phase: 'dated' | 'undated' | 'done'
  deletedAt: string
  id: string
}

export const INITIAL_MANIFEST_REQUEUE_CURSOR: ManifestRequeueCursor = { phase: 'dated', deletedAt: '-infinity', id: '0' }

export async function requeueDeletedManifestBatch(client: Pick<PoolClient, 'query'>, cursor: ManifestRequeueCursor) {
  if (cursor.phase === 'done')
    return { cursor, scanned: 0, requeued: 0 }
  await client.query('BEGIN')
  let versionIds: string[] = []
  try {
    await client.query('SET LOCAL statement_timeout = \'5s\'')
    await client.query('SET LOCAL lock_timeout = \'2s\'')
    // Both phases use idx_app_versions_deleted_at_id. Preserve timestamp
    // microseconds and bigint IDs as text only in output, never in key filters.
    const rows = cursor.phase === 'dated'
      ? await client.query<{ id: string, deleted_at: string }>(`
          SELECT av.id::text, av.deleted_at::text FROM public.app_versions AS av
          WHERE av.deleted = true AND av.deleted_at IS NOT NULL
            AND (av.deleted_at, av.id) > ($1::timestamptz, $2::bigint)
          ORDER BY av.deleted_at, av.id LIMIT 50`, [cursor.deletedAt, cursor.id])
      : await client.query<{ id: string, deleted_at: null }>(`
          SELECT av.id::text, av.deleted_at::text FROM public.app_versions AS av
          WHERE av.deleted = true AND av.deleted_at IS NULL AND av.id > $1::bigint
          ORDER BY av.deleted_at, av.id LIMIT 50`, [cursor.id])
    if (rows.rows.length === 0) {
      await client.query('COMMIT')
      return { cursor: { phase: cursor.phase === 'dated' ? 'undated' : 'done', deletedAt: '-infinity', id: '0' } as ManifestRequeueCursor, scanned: 0, requeued: 0 }
    }
    const ids = rows.rows.map(row => row.id)
    versionIds = ids
    // Share the handler/persistence version lock before rechecking references.
    // At most 50 locks, with no per-file work or extra database connections.
    await client.query(`SELECT pg_catalog.pg_advisory_xact_lock(id)
      FROM (SELECT id FROM pg_catalog.unnest($1::bigint[]) AS ids(id) ORDER BY id) AS ordered`, [ids])
    const updated = await client.query(`UPDATE public.app_versions AS av
      SET manifest_count = 1, updated_at = pg_catalog.now()
      WHERE av.id = ANY($1::bigint[]) AND av.deleted = true AND av.manifest_count = 0
        AND EXISTS (SELECT 1 FROM public.manifest AS m WHERE m.app_version_id = av.id)`, [ids])
    await client.query('COMMIT')
    const last = rows.rows.at(-1)!
    return { cursor: { phase: cursor.phase, deletedAt: last.deleted_at ?? '-infinity', id: last.id }, scanned: rows.rows.length, requeued: updated.rowCount ?? 0 }
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw Object.assign(error as Error, { versionIds })
  }
}

async function main() {
  const databaseUrl = env.SUPABASE_DB_URL
  if (!databaseUrl)
    throw new Error('Set SUPABASE_DB_URL explicitly')
  const database = createHash('sha256').update(databaseUrl).digest('hex')
  const checkpointPath = env.MANIFEST_REQUEUE_CHECKPOINT ?? join(tmpdir(), `manifest-requeue-${database.slice(0, 12)}.json`)
  let cursor = INITIAL_MANIFEST_REQUEUE_CURSOR
  try {
    const saved = JSON.parse(await readFile(checkpointPath, 'utf8'))
    if (saved.database !== database)
      throw new Error('Checkpoint belongs to another database')
    if (!['dated', 'undated', 'done'].includes(saved.cursor?.phase)
      || typeof saved.cursor.deletedAt !== 'string'
      || typeof saved.cursor.id !== 'string' || !/^\d+$/.test(saved.cursor.id)) {
      throw new Error('Invalid checkpoint cursor')
    }
    cursor = saved.cursor
  }
  catch (error: any) {
    if (error.code !== 'ENOENT')
      throw error
  }
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    while (cursor.phase !== 'done') {
      const progress = await requeueDeletedManifestBatch(client, cursor)
      cursor = progress.cursor
      await writeFile(`${checkpointPath}.tmp`, JSON.stringify({ database, cursor }), { mode: 0o600 })
      await rename(`${checkpointPath}.tmp`, checkpointPath)
      console.log(JSON.stringify(progress))
    }
  }
  catch (error: any) {
    // Keep the previous committed checkpoint; report the failed key range so
    // an operator can inspect it before resuming. Do not swallow failed work.
    await writeFile(`${checkpointPath}.failed.json`, JSON.stringify({ cursor, versionIds: error.versionIds, code: error.code, message: error.message }), { mode: 0o600 })
    throw error
  }
  finally {
    await client.end()
  }
}

if (import.meta.main)
  await main()
