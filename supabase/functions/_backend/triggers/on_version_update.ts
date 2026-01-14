import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { manifest } from '../utils/postgres_schema.ts'
import { getPath, s3 } from '../utils/s3.ts'
import { createStatsMeta } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

async function v2PathSize(c: Context, record: Database['public']['Tables']['app_versions']['Row'], v2Path: string) {
  // pdate size and checksum
  cloudlog({ requestId: c.get('requestId'), message: 'V2', r2_path: record.r2_path })
  // set checksum in s3
  const size = await s3.getSize(c, v2Path)
  if (!size) {
    cloudlog({ requestId: c.get('requestId'), message: 'no size found for r2_path', r2_path: record.r2_path })
    return
  }
  // allow to update even without checksum, to prevent bad actor to remove checksum to get free storage
  const { error: errorUpdate } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .upsert({
      id: record.id,
      app_id: record.app_id,
      owner_org: record.owner_org,
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
}

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
        file_name: entry.file_name!,
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

async function updateIt(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  const v2Path = await getPath(c, record)

  if (v2Path && record.storage_provider === 'r2') {
    await v2PathSize(c, record, v2Path)
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'no v2 path' })
    const { error: errorUpdate } = await supabaseAdmin(c)
      .from('app_versions_meta')
      .upsert({
        id: record.id,
        app_id: record.app_id,
        owner_org: record.owner_org,
        size: 0,
        checksum: record.checksum ?? '',
      }, {
        onConflict: 'id',
      })
      .eq('id', record.id)
    if (errorUpdate)
      cloudlog({ requestId: c.get('requestId'), message: 'errorUpdate', error: errorUpdate })
  }

  // Handle manifest entries
  if (record.manifest) {
    await handleManifest(c, record)
  }

  return c.json(BRES)
}

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

      // Delete each file from S3
      const promisesDeleteS3 = []
      for (const entry of manifestEntries) {
        if (entry.s3_path) {
          promisesDeleteS3.push(
            // First delete the manifest row from database
            supabaseAdmin(c)
              .from('manifest')
              .delete()
              .eq('id', entry.id)
              .then(() => {
                // After deleting, check if any other rows still reference this file
                // This avoids race condition where concurrent deletes both skip S3 cleanup
                return supabaseAdmin(c)
                  .from('manifest')
                  .select('*', { count: 'exact', head: true })
                  .eq('file_name', entry.file_name)
                  .eq('file_hash', entry.file_hash)
              })
              .then((v) => {
                const count = v.count ?? 0
                if (count) {
                  // Other versions still use this file, S3 cleanup not needed
                  return
                }
                // No other versions use this file, delete from S3
                cloudlog({ requestId: c.get('requestId'), message: 'deleted manifest file from S3', s3_path: entry.s3_path })
                return s3.deleteObject(c, entry.s3_path)
              }),
          )
        }
      }
      await backgroundTask(c, Promise.all(promisesDeleteS3))

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
    cloudlog({ requestId: c.get('requestId'), message: 'error fetch manifest entries', error })
  }
  finally {
    await closeClient(c, pgClient)
  }
}

export async function deleteIt(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  cloudlog({ requestId: c.get('requestId'), message: 'Delete', r2_path: record.r2_path })

  const v2Path = await getPath(c, record)
  if (!v2Path) {
    cloudlog({ requestId: c.get('requestId'), message: 'No r2 path' })
    return c.json(BRES)
  }

  try {
    await s3.deleteObject(c, v2Path)
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cannot delete s3 (v2)', error })
    return c.json(BRES)
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
  if (errorUpdate)
    cloudlog({ requestId: c.get('requestId'), message: 'error', error: errorUpdate })

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
  if (!record.r2_path && !record.manifest) {
    cloudlog({ requestId: c.get('requestId'), message: 'no r2_path and no manifest, skipping update', record })
    return c.json(BRES)
  }
  // // check if not deleted it's present in s3 storage
  if (record.deleted && record.deleted !== oldRecord.deleted)
    return deleteIt(c, record)

  cloudlog({ requestId: c.get('requestId'), message: 'Update but not deleted' })
  return updateIt(c, record)
})
