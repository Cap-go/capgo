import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, quickError, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { normalizeLegacyEncodedManifestFileName } from '../utils/manifest_encoding.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { manifest } from '../utils/postgres_schema.ts'
import { retryWithBackoff } from '../utils/retry.ts'
import { s3 } from '../utils/s3.ts'
import { createStatsMeta } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

const BUNDLE_SIZE_RETRY_ATTEMPTS = 3
const BUNDLE_SIZE_RETRY_DELAY_MS = 500

/**
 * Resolves `owner_org` for an app version row.
 *
 * Falls back to the owning app when the trigger payload does not include it.
 */
async function resolveOwnerOrg(c: Context, record: Database['public']['Tables']['app_versions']['Row']): Promise<string | null> {
  if (record.owner_org)
    return record.owner_org
  if (!record.app_id)
    return null

  const { data, error } = await supabaseAdmin(c)
    .from('apps')
    .select('owner_org')
    .eq('app_id', record.app_id)
    .maybeSingle()

  if (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'error resolveOwnerOrg', error, app_id: record.app_id })
    return null
  }

  return data?.owner_org ?? null
}

async function getBundleSizeWithRetry(c: Context, r2Path: string): Promise<{ size: number, lastError?: unknown, attempts: number }> {
  const { result, lastError, attempts } = await retryWithBackoff(
    () => s3.getSize(c, r2Path),
    {
      attempts: BUNDLE_SIZE_RETRY_ATTEMPTS,
      baseDelayMs: BUNDLE_SIZE_RETRY_DELAY_MS,
      shouldRetry: size => size <= 0,
    },
  )

  return { attempts, size: typeof result === 'number' ? result : 0, lastError }
}

/**
 * Handles v2 storage metadata updates (size/checksum/stats) for R2-backed bundles.
 *
 * Returns `false` only when processing must stop (e.g. missing owner org).
 */
async function v2PathSize(c: Context, record: Database['public']['Tables']['app_versions']['Row'], v2Path: string): Promise<boolean> {
  // Update size and checksum.
  cloudlog({ requestId: c.get('requestId'), message: 'V2', r2_path: record.r2_path })
  const { size, lastError, attempts } = await getBundleSizeWithRetry(c, v2Path)
  if (lastError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getSize failed after retries', id: record.id, app_id: record.app_id, r2_path: record.r2_path, attempts, error: lastError })
  }
  if (size <= 0) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getSize returned 0 after retries', id: record.id, app_id: record.app_id, r2_path: record.r2_path, storage_provider: record.storage_provider, attempts })
    // Return non-2xx so queue_consumer keeps the message and applies its 5-read retry budget.
    throw quickError(503, 'bundle_size_not_found', 'Bundle file size metadata was not found', { attempts, app_id: record.app_id, id: record.id, r2_path: record.r2_path }, lastError, { alert: false })
  }

  const ownerOrg = await resolveOwnerOrg(c, record)
  if (!ownerOrg) {
    cloudlog({ requestId: c.get('requestId'), message: 'missing owner_org for app_versions_meta upsert', id: record.id, app_id: record.app_id })
    return false
  }

  // allow to update even without checksum, to prevent bad actor to remove checksum to get free storage
  const { error: errorUpdate } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .upsert({
      id: record.id,
      app_id: record.app_id,
      owner_org: ownerOrg,
      size,
      checksum: record.checksum ?? '',
    }, {
      onConflict: 'id',
    })
    .eq('id', record.id)
  if (errorUpdate)
    cloudlog({ requestId: c.get('requestId'), message: 'errorUpdate', error: errorUpdate })
  const { error } = await createStatsMeta(c, record.app_id, record.id, size)
  if (error)
    cloudlog({ requestId: c.get('requestId'), message: 'error createStatsMeta', error })
  return true
}

/**
 * Persists manifest rows and updates aggregate counters when a version includes a manifest payload.
 */
async function handleManifest(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  cloudlog({ requestId: c.get('requestId'), message: 'manifest', manifest: record.manifest })
  const manifestEntries = record.manifest as Database['public']['CompositeTypes']['manifest_entry'][]

  // Check if entries exist
  const { data: existingEntries } = await supabaseAdmin(c)
    .from('manifest')
    .select('id')
    .eq('app_version_id', record.id)
    .limit(1)

  // Only create entries if none exist
  if (!existingEntries?.length && manifestEntries.length > 0) {
    const validEntries = manifestEntries
      .filter(entry => entry.file_name && entry.file_hash && entry.s3_path)
      .map(entry => ({
        app_version_id: record.id,
        file_name: normalizeLegacyEncodedManifestFileName(entry.file_name, entry.s3_path)!,
        file_hash: entry.file_hash!,
        s3_path: entry.s3_path!,
        file_size: 0,
      }))

    if (validEntries.length > 0) {
      const { error: insertError } = await supabaseAdmin(c)
        .from('manifest')
        .insert(validEntries)
      if (insertError) {
        cloudlog({ requestId: c.get('requestId'), message: 'error insert manifest', error: insertError })
      }
      else {
        // Update manifest_count on the version
        const { error: countError } = await supabaseAdmin(c)
          .from('app_versions')
          .update({ manifest_count: validEntries.length })
          .eq('id', record.id)
        if (countError)
          cloudlog({ requestId: c.get('requestId'), message: 'error update manifest_count', error: countError })

        // Increment manifest_bundle_count on the app using raw SQL
        const pgClient = getPgClient(c, false)
        try {
          await pgClient.query(
            `UPDATE apps
             SET manifest_bundle_count = manifest_bundle_count + 1,
                 updated_at = now()
             WHERE app_id = $1`,
            [record.app_id],
          )
        }
        catch (error) {
          cloudlog({ requestId: c.get('requestId'), message: 'error update manifest_bundle_count', error })
        }
        finally {
          await closeClient(c, pgClient)
        }
      }
    }
  }
  // delete manifest in app_versions
  const { error: deleteError } = await supabaseAdmin(c)
    .from('app_versions')
    .update({ manifest: null })
    .eq('id', record.id)
  if (deleteError)
    cloudlog({ requestId: c.get('requestId'), message: 'error delete manifest in app_versions', error: deleteError })
}

async function upsertZeroVersionMetadata(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  cloudlog({ requestId: c.get('requestId'), message: 'no v2 path' })
  const ownerOrg = await resolveOwnerOrg(c, record)
  if (!ownerOrg) {
    cloudlog({ requestId: c.get('requestId'), message: 'missing owner_org for app_versions_meta upsert', id: record.id, app_id: record.app_id })
    return false
  }
  const { error: errorUpdate } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .upsert({
      id: record.id,
      app_id: record.app_id,
      owner_org: ownerOrg,
      size: 0,
      checksum: record.checksum ?? '',
    }, {
      onConflict: 'id',
    })
    .eq('id', record.id)
  if (errorUpdate)
    cloudlog({ requestId: c.get('requestId'), message: 'errorUpdate', error: errorUpdate })
  return true
}

/**
 * Handles app version metadata updates after insert/update trigger execution.
 */
async function updateIt(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  if (record.storage_provider === 'r2') {
    if (record.r2_path) {
      const shouldContinue = await v2PathSize(c, record, record.r2_path)
      if (!shouldContinue)
        return c.json(BRES)
    }
    else if (isPersistedManifestOnlyVersion(record)) {
      cloudlog({ requestId: c.get('requestId'), message: 'manifest-only r2 version already persisted, skipping bundle metadata retry', id: record.id, app_id: record.app_id, manifest_count: record.manifest_count })
    }
    else if (!record.manifest) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'r2 version missing r2_path', id: record.id, app_id: record.app_id, storage_provider: record.storage_provider })
      throw quickError(503, 'bundle_r2_path_missing', 'Bundle R2 path is not ready', { app_id: record.app_id, id: record.id }, undefined, { alert: false })
    }
    else if (!await upsertZeroVersionMetadata(c, record)) {
      return c.json(BRES)
    }
  }
  else if (record.r2_path) {
    cloudlog({ requestId: c.get('requestId'), message: 'bundle metadata skipped for non-r2 storage provider', id: record.id, app_id: record.app_id, r2_path: record.r2_path, storage_provider: record.storage_provider })
  }
  else if (!await upsertZeroVersionMetadata(c, record)) {
    return c.json(BRES)
  }

  // Handle manifest entries
  if (record.manifest) {
    await handleManifest(c, record)
  }

  return c.json(BRES)
}

export const onVersionUpdateTestUtils = {
  getBundleSizeWithRetry,
  updateIt,
}

function isManifestCleanupUpdate(record: Database['public']['Tables']['app_versions']['Row'], oldRecord: Database['public']['Tables']['app_versions']['Row']) {
  return record.storage_provider === 'r2'
    && !record.r2_path
    && !record.manifest
    && Boolean(oldRecord.manifest)
}

function isPersistedManifestOnlyVersion(record: Database['public']['Tables']['app_versions']['Row']) {
  return record.storage_provider === 'r2'
    && !record.r2_path
    && !record.manifest
    && Number(record.manifest_count ?? 0) > 0
}

/**
 * Deletes manifest rows and moves orphaned S3 assets to the R2 trash prefix.
 */
async function deleteManifest(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  // Delete manifest entries - first get them to delete from S3
  const pgClient = getPgClient(c, true) // READ-ONLY: deletes use SDK, not Drizzle
  const drizzleClient = getDrizzleClient(pgClient)

  try {
    const manifestEntries = await drizzleClient
      .select()
      .from(manifest)
      .where(eq(manifest.app_version_id, record.id))

    if (manifestEntries && manifestEntries.length > 0) {
      const manifestCount = manifestEntries.length

      // Move each unreferenced file to the R2 trash prefix.
      const promisesMoveToTrash = []
      for (const entry of manifestEntries) {
        if (entry.s3_path) {
          promisesMoveToTrash.push(
            // First delete the manifest row from database
            supabaseAdmin(c)
              .from('manifest')
              .delete()
              .eq('id', entry.id)
              .then(({ error: deleteError }) => {
                if (deleteError) {
                  cloudlog({ requestId: c.get('requestId'), message: 'error deleting manifest row', id: entry.id, error: deleteError })
                  return null // Signal to skip S3 cleanup
                }
                // After deleting, check if any other rows still reference this file
                // This avoids race condition where concurrent deletes both skip S3 cleanup
                return supabaseAdmin(c)
                  .from('manifest')
                  .select('id')
                  .eq('file_hash', entry.file_hash)
                  .eq('file_name', entry.file_name)
                  .limit(1)
                  .maybeSingle()
              })
              .then((v) => {
                if (!v)
                  return // Delete failed, skip S3 cleanup
                if (v.error) {
                  cloudlog({ requestId: c.get('requestId'), message: 'error checking manifest references', error: v.error })
                  return // Don't delete S3 if we can't confirm no other references
                }
                if (v.data) {
                  // Other versions still use this file, S3 cleanup not needed
                  return
                }
                // No other versions use this file, move it to the R2 trash prefix.
                cloudlog({ requestId: c.get('requestId'), message: 'moving manifest file to R2 trash', s3_path: entry.s3_path })
                return s3.moveObjectToTrash(c, entry.s3_path)
                  .then((moved) => {
                    if (!moved) {
                      throw simpleError('cannot_move_manifest_s3_to_trash', 'Cannot move S3 object for deleted manifest file to trash', { id: entry.id, s3_path: entry.s3_path })
                    }
                  })
              }),
          )
        }
      }
      await Promise.all(promisesMoveToTrash)

      // After deleting manifest entries, update manifest_count and decrement manifest_bundle_count
      const updatePgClient = getPgClient(c, false)
      try {
        await updatePgClient.query(
          `UPDATE app_versions SET manifest_count = 0 WHERE id = $1`,
          [record.id],
        )

        // Only decrement if this version had manifests
        if (manifestCount > 0) {
          await updatePgClient.query(
            `UPDATE apps
             SET manifest_bundle_count = GREATEST(manifest_bundle_count - 1, 0),
                 updated_at = now()
             WHERE app_id = $1`,
            [record.app_id],
          )
        }
      }
      catch (error) {
        cloudlog({ requestId: c.get('requestId'), message: 'error update counters on delete', error })
      }
      finally {
        await closeClient(c, updatePgClient)
      }
    }
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'error deleting manifest entries', error })
  }
  finally {
    await closeClient(c, pgClient)
  }
}

export async function deleteIt(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  cloudlog({ requestId: c.get('requestId'), message: 'Delete', r2_path: record.r2_path })

  if (record.r2_path) {
    let moved = false
    try {
      moved = await s3.moveObjectToTrash(c, record.r2_path)
    }
    catch (error) {
      cloudlog({ requestId: c.get('requestId'), message: 'Cannot move s3 to trash (v2)', error })
      throw simpleError('cannot_move_s3_to_trash', 'Cannot move S3 object for deleted version to trash', { id: record.id, r2_path: record.r2_path }, error)
    }

    if (!moved) {
      throw simpleError('cannot_move_s3_to_trash', 'Cannot move S3 object for deleted version to trash', { id: record.id, r2_path: record.r2_path })
    }
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'No r2 path for deleted version', id: record.id })
  }

  const { data, error: dbError } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .select()
    .eq('id', record.id)
    .single()
  if (dbError || !data) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot find version meta', id: record.id })
    return c.json(BRES)
  }
  const { error: errorCreateStatsMeta } = await createStatsMeta(c, record.app_id, record.id, -data.size)
  if (errorCreateStatsMeta)
    cloudlog({ requestId: c.get('requestId'), message: 'error createStatsMeta', error: errorCreateStatsMeta })
  // set app_versions_meta versionSize = 0
  const { error: errorUpdate } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .update({ size: 0 })
    .eq('id', record.id)
  if (errorUpdate) {
    cloudlog({ requestId: c.get('requestId'), message: 'error', error: errorUpdate })
    throw simpleError('cannot_update_version_meta', 'Cannot update version metadata for deleted version', { id: record.id }, errorUpdate)
  }

  await deleteManifest(c, record)

  return c.json(BRES)
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('app_versions', 'UPDATE'), (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['app_versions']['Row']
  const oldRecord = c.get('oldRecord') as Database['public']['Tables']['app_versions']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.app_id) {
    cloudlog({ requestId: c.get('requestId'), message: 'no app_id', record })
    return c.json(BRES)
  }
  // check if version was soft-deleted (deleted_at was set)
  if (record.deleted_at && record.deleted_at !== oldRecord.deleted_at)
    return deleteIt(c, record)

  if (isManifestCleanupUpdate(record, oldRecord)) {
    cloudlog({ requestId: c.get('requestId'), message: 'manifest cleanup update, skipping bundle metadata retry', record })
    return c.json(BRES)
  }

  if (isPersistedManifestOnlyVersion(record)) {
    cloudlog({ requestId: c.get('requestId'), message: 'persisted manifest-only update, skipping bundle metadata retry', record })
    return c.json(BRES)
  }

  if (!record.r2_path && !record.manifest && record.storage_provider !== 'r2') {
    cloudlog({ requestId: c.get('requestId'), message: 'no r2_path and no manifest, skipping update', record })
    return c.json(BRES)
  }

  cloudlog({ requestId: c.get('requestId'), message: 'Update but not deleted' })
  return updateIt(c, record)
})
