import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { normalizeLegacyEncodedManifestFileName } from '../utils/manifest_encoding.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { manifest } from '../utils/postgres_schema.ts'
import { getPath, s3 } from '../utils/s3.ts'
import { createStatsMeta } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

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

function getManifestEntryCount(value: unknown): number {
  if (Array.isArray(value))
    return value.length
  return value ? 1 : 0
}

function versionUpdateLogFields(
  record: Database['public']['Tables']['app_versions']['Row'],
  oldRecord?: Database['public']['Tables']['app_versions']['Row'] | null,
) {
  return {
    app_id: record.app_id,
    deleted_at: record.deleted_at,
    id: record.id,
    manifest_count: record.manifest_count,
    manifest_entries: getManifestEntryCount(record.manifest),
    old_deleted_at: oldRecord?.deleted_at ?? null,
    old_r2_path: oldRecord?.r2_path ?? null,
    old_storage_provider: oldRecord?.storage_provider ?? null,
    old_updated_at: oldRecord?.updated_at ?? null,
    r2_path: record.r2_path,
    storage_provider: record.storage_provider,
    updated_at: record.updated_at,
    version_name: record.name,
  }
}

type DeletedVersionAction = 'continue' | 'delete' | 'cleanup_manifest' | 'skip'

function getDeletedVersionAction(
  record: Database['public']['Tables']['app_versions']['Row'],
  oldRecord?: Database['public']['Tables']['app_versions']['Row'] | null,
): DeletedVersionAction {
  if (!record.deleted_at)
    return 'continue'
  if (record.deleted_at !== oldRecord?.deleted_at)
    return 'delete'
  if (record.manifest || (record.manifest_count ?? 0) > 0)
    return 'cleanup_manifest'
  return 'skip'
}

function getMetadataBranch(storageProvider: string | null, resolvedR2Path: string | null) {
  if (storageProvider === 'r2' && resolvedR2Path)
    return 'r2_bundle_size'
  if (storageProvider === 'r2')
    return 'zero_metadata_r2_path_unavailable'
  if (storageProvider === 'r2-direct')
    return 'zero_metadata_r2_direct_not_finalized'
  return 'zero_metadata_non_r2_storage'
}

/**
 * Handles v2 storage metadata updates (size/checksum/stats) for R2-backed bundles.
 *
 * Returns `false` only when processing must stop (e.g. missing owner org).
 */
async function v2PathSize(c: Context, record: Database['public']['Tables']['app_versions']['Row'], v2Path: string): Promise<boolean> {
  cloudlog({
    requestId: c.get('requestId'),
    message: 'on_version_update reading bundle size',
    ...versionUpdateLogFields(record),
    resolved_r2_path: v2Path,
  })

  const diagnostics = await s3.getSizeDiagnostics(c, v2Path)
  const size = diagnostics.size
  if (!size) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'no size found for r2_path',
      ...versionUpdateLogFields(record),
      resolved_r2_path: v2Path,
      size,
      storageDiagnostics: diagnostics,
    })
    return true
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'on_version_update resolved bundle size',
    ...versionUpdateLogFields(record),
    resolved_r2_path: v2Path,
    selectedCandidateKey: diagnostics.selectedCandidateKey,
    size,
  })

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
  if (errorUpdate) {
    cloudlog({ requestId: c.get('requestId'), message: 'errorUpdate', error: errorUpdate, ...versionUpdateLogFields(record), size })
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'app_versions_meta size upserted', ...versionUpdateLogFields(record), owner_org: ownerOrg, size })
  }
  const { error } = await createStatsMeta(c, record.app_id, record.id, size)
  if (error)
    cloudlog({ requestId: c.get('requestId'), message: 'error createStatsMeta', error })
  return true
}

/**
 * Reloads `app_versions.manifest` when the queue payload omitted it to stay under size limits.
 */
async function ensureVersionManifest(
  c: Context,
  record: Database['public']['Tables']['app_versions']['Row'],
): Promise<Database['public']['Tables']['app_versions']['Row']> {
  if (record.manifest)
    return record

  const { data, error } = await supabaseAdmin(c)
    .from('app_versions')
    .select('manifest')
    .eq('id', record.id)
    .maybeSingle()

  if (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'error reload app_versions.manifest', error, id: record.id })
    throw simpleError('manifest_reload_failed', 'Failed to reload app_versions.manifest', { id: record.id }, error)
  }

  if (!data?.manifest)
    return record

  cloudlog({
    requestId: c.get('requestId'),
    message: 'on_version_update reloaded manifest from database',
    id: record.id,
    manifest_entries: getManifestEntryCount(data.manifest),
  })
  return { ...record, manifest: data.manifest }
}

/**
 * Persists manifest rows and updates aggregate counters when a version includes a manifest payload.
 */
async function handleManifest(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  cloudlog({ requestId: c.get('requestId'), message: 'manifest', manifest: record.manifest })
  const manifestEntries = record.manifest as Database['public']['CompositeTypes']['manifest_entry'][]
  if (!Array.isArray(manifestEntries))
    return

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

/**
 * Handles app version metadata updates after insert/update trigger execution.
 */
async function updateIt(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  const v2Path = await getPath(c, record)
  const metadataBranch = getMetadataBranch(record.storage_provider, v2Path)
  cloudlog({
    requestId: c.get('requestId'),
    message: 'on_version_update metadata branch selected',
    ...versionUpdateLogFields(record),
    metadataBranch,
    resolved_r2_path: v2Path,
  })

  if (metadataBranch === 'r2_bundle_size' && v2Path) {
    const shouldContinue = await v2PathSize(c, record, v2Path)
    if (!shouldContinue)
      return c.json(BRES)
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'on_version_update zero metadata branch selected', ...versionUpdateLogFields(record), metadataBranch, resolved_r2_path: v2Path })
    const ownerOrg = await resolveOwnerOrg(c, record)
    if (!ownerOrg) {
      cloudlog({ requestId: c.get('requestId'), message: 'missing owner_org for app_versions_meta upsert', id: record.id, app_id: record.app_id })
      return c.json(BRES)
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
    if (errorUpdate) {
      cloudlog({ requestId: c.get('requestId'), message: 'errorUpdate', error: errorUpdate, ...versionUpdateLogFields(record), metadataBranch, size: 0 })
    }
    else {
      cloudlog({ requestId: c.get('requestId'), message: 'app_versions_meta zero size upserted', ...versionUpdateLogFields(record), metadataBranch, owner_org: ownerOrg, size: 0 })
    }
  }

  // Handle manifest entries (reload when the queue payload omitted the jsonb column)
  const recordWithManifest = await ensureVersionManifest(c, record)
  if (recordWithManifest.manifest)
    await handleManifest(c, recordWithManifest)

  return c.json(BRES)
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
          `UPDATE app_versions SET manifest_count = 0, manifest = NULL WHERE id = $1`,
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

app.post('/', middlewareAPISecret, triggerValidator('app_versions', 'UPDATE'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['app_versions']['Row']
  const oldRecord = c.get('oldRecord') as Database['public']['Tables']['app_versions']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'on_version_update received', ...versionUpdateLogFields(record, oldRecord) })
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.app_id) {
    cloudlog({ requestId: c.get('requestId'), message: 'no app_id', record })
    return c.json(BRES)
  }
  // Queue payloads omit app_versions.manifest; reload before deleted-version decisions.
  let workRecord = record
  if (!workRecord.manifest)
    workRecord = await ensureVersionManifest(c, workRecord)

  const deletedVersionAction = getDeletedVersionAction(workRecord, oldRecord)
  if (deletedVersionAction === 'delete')
    return deleteIt(c, workRecord)
  if (deletedVersionAction === 'cleanup_manifest') {
    cloudlog({ requestId: c.get('requestId'), message: 'cleaning manifest for already deleted version', ...versionUpdateLogFields(workRecord, oldRecord) })
    await deleteManifest(c, workRecord)
    return c.json(BRES)
  }
  if (deletedVersionAction === 'skip')
    return c.json(BRES)

  if (!workRecord.r2_path && !workRecord.manifest) {
    cloudlog({ requestId: c.get('requestId'), message: 'no r2_path and no manifest, skipping update', ...versionUpdateLogFields(workRecord, oldRecord) })
    return c.json(BRES)
  }

  cloudlog({ requestId: c.get('requestId'), message: 'Update but not deleted', ...versionUpdateLogFields(workRecord, oldRecord) })
  return updateIt(c, workRecord)
})

export const onVersionUpdateTestUtils = {
  getDeletedVersionAction,
}
