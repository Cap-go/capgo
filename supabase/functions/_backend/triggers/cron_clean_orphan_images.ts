import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

// The queue consumer aborts the HTTP call after 15s. Stop starting new folders
// well before that and let the next daily run continue with the rest.
const CLEANUP_BUDGET_MS = 10_000
const CLEANUP_CONCURRENCY = 8
// Keeps PostgREST `in.(...)` filters well under URL length limits.
const LOOKUP_CHUNK_SIZE = 100

function normalizeImageStoragePath(path?: string | null) {
  if (!path)
    return ''

  const pathWithoutQuery = path.split('?')[0]
  const signedUrlRegex = /\/storage\/v1\/object\/(?:public\/|sign\/)?images\/(.+)$/
  const signedUrlMatch = signedUrlRegex.exec(pathWithoutQuery)
  if (signedUrlMatch?.[1])
    return decodePathSegment(signedUrlMatch[1]).replace(/^\/+/, '')

  return decodePathSegment(pathWithoutQuery).replace(/^\/+/, '').replace(/^images\//, '')
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

interface StorageListEntry {
  id: string | null
  name: string
}

export function getStaleOrgLogoPaths(orgId: string, files: StorageListEntry[], linkedLogoPath?: string | null) {
  const normalizedLinkedLogoPath = normalizeImageStoragePath(linkedLogoPath)

  return files
    .filter(file => file.id !== null)
    .map(file => `org/${orgId}/logo/${file.name}`)
    .filter(path => path !== normalizedLinkedLogoPath)
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size))
  return chunks
}

// Random order so a run cut short by the budget does not always revisit the
// same folders. Not security sensitive; crypto source only keeps scanners quiet.
function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  const random = new Uint32Array(result.length)
  crypto.getRandomValues(random)
  for (let i = result.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Runs `worker` over `items` with bounded concurrency and stops starting new
 * items once `deadline` (epoch ms) has passed. Returns how many items started.
 */
export async function runWithDeadline<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  options: { concurrency: number, deadline: number, now?: () => number },
) {
  const now = options.now ?? Date.now
  let next = 0
  const runners = Array.from({ length: Math.min(options.concurrency, items.length) }, async () => {
    while (next < items.length && now() < options.deadline) {
      const item = items[next++]
      await worker(item)
    }
  })
  await Promise.all(runners)
  return next
}

type SupabaseAdmin = ReturnType<typeof supabaseAdmin>

interface CleanupStats {
  deletedUserImages: number
  deletedOrgImages: number
  errors: number
  userFolders: number
  userFoldersProcessed: number
  orgFolders: number
  orgFoldersProcessed: number
}

async function fetchExisting<Row>(
  ids: string[],
  query: (ids: string[]) => PromiseLike<{ data: Row[] | null, error: unknown }>,
) {
  const rows: Row[] = []
  for (const idsChunk of chunk(ids, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await query(idsChunk)
    if (error)
      throw error
    rows.push(...(data ?? []))
  }
  return rows
}

async function cleanUserFolder(
  c: Context<MiddlewareKeyVariables>,
  supabase: SupabaseAdmin,
  stats: CleanupStats,
  userId: string,
  user: { image_url: string | null } | undefined,
) {
  try {
    const { data: files, error: filesListError } = await supabase
      .storage
      .from('images')
      .list(userId)

    if (filesListError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'error listing user images', error: filesListError, userId })
      stats.errors++
      return
    }

    // Deleted user: remove everything. Existing user: remove avatar files not
    // referenced by users.image_url.
    const linkedImagePath = user ? normalizeImageStoragePath(user.image_url) : null
    const filePaths = (files ?? [])
      .filter(file => !user || file.id !== null)
      .map(file => `${userId}/${file.name}`)
      .filter(path => path !== linkedImagePath)

    if (filePaths.length === 0)
      return

    const { error: removeError } = await supabase
      .storage
      .from('images')
      .remove(filePaths)

    if (removeError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'error deleting user images', error: removeError, userId })
      stats.errors++
      return
    }

    stats.deletedUserImages += filePaths.length
    cloudlog({
      requestId: c.get('requestId'),
      message: user ? 'deleted stale user images not linked in profile' : 'deleted orphaned user images',
      count: filePaths.length,
      userId,
    })
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'error cleaning user images', error, userId })
    stats.errors++
  }
}

async function removeOrgFolderContents(supabase: SupabaseAdmin, prefix: string) {
  const { data: files, error } = await supabase
    .storage
    .from('images')
    .list(prefix)
  if (error)
    throw error
  const filePaths = (files ?? []).map(file => `${prefix}/${file.name}`)
  if (filePaths.length === 0)
    return 0
  const { error: removeError } = await supabase
    .storage
    .from('images')
    .remove(filePaths)
  if (removeError)
    throw removeError
  return filePaths.length
}

async function cleanOrgFolder(
  c: Context<MiddlewareKeyVariables>,
  supabase: SupabaseAdmin,
  stats: CleanupStats,
  orgId: string,
  org: { logo: string | null } | undefined,
  deadline: number,
) {
  try {
    const { data: entries, error: listError } = await supabase
      .storage
      .from('images')
      .list(`org/${orgId}`)

    if (listError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'error listing org folder', error: listError, orgId })
      stats.errors++
      return
    }

    // If org doesn't exist, delete all its images
    if (!org) {
      let deleted = 0
      for (const entry of entries ?? []) {
        // Stop at the budget; the next run lists the folder again and finishes.
        if (Date.now() >= deadline)
          break
        if (entry.id === null) {
          deleted += await removeOrgFolderContents(supabase, `org/${orgId}/${entry.name}`)
        }
        else {
          const { error } = await supabase.storage.from('images').remove([`org/${orgId}/${entry.name}`])
          if (error)
            throw error
          deleted++
        }
      }
      if (deleted > 0) {
        stats.deletedOrgImages += deleted
        cloudlog({ requestId: c.get('requestId'), message: 'deleted orphaned org images', orgId, count: deleted })
      }
      return
    }

    const subFolders = (entries ?? []).filter(entry => entry.id === null).map(entry => entry.name)

    // The logo folder is organization-scoped, not app-scoped. Keep the current
    // org logo referenced in public.orgs.logo and only remove stale files.
    if (subFolders.includes('logo')) {
      const { data: files, error: logoListError } = await supabase
        .storage
        .from('images')
        .list(`org/${orgId}/logo`)

      if (logoListError) {
        cloudlogErr({ requestId: c.get('requestId'), message: 'error listing org logo images', error: logoListError, orgId })
        stats.errors++
      }
      else {
        const staleLogoPaths = getStaleOrgLogoPaths(orgId, files ?? [], org.logo)
        if (staleLogoPaths.length > 0) {
          const { error: removeLogoError } = await supabase
            .storage
            .from('images')
            .remove(staleLogoPaths)

          if (removeLogoError) {
            cloudlogErr({ requestId: c.get('requestId'), message: 'error deleting stale org logo images', error: removeLogoError, orgId })
            stats.errors++
          }
          else {
            stats.deletedOrgImages += staleLogoPaths.length
            cloudlog({
              requestId: c.get('requestId'),
              message: 'deleted stale org logo images not linked in org',
              count: staleLogoPaths.length,
              orgId,
            })
          }
        }
      }
    }

    // Org exists, but check if individual apps still exist
    const appIds = subFolders.filter(name => name !== 'logo')
    if (appIds.length === 0)
      return

    const existingApps = await fetchExisting<{ app_id: string }>(appIds, ids => supabase
      .from('apps')
      .select('app_id')
      .in('app_id', ids))
    const existingAppIds = new Set(existingApps.map(row => row.app_id))

    for (const appId of appIds) {
      if (Date.now() >= deadline)
        break
      if (existingAppIds.has(appId))
        continue
      try {
        const deleted = await removeOrgFolderContents(supabase, `org/${orgId}/${appId}`)
        if (deleted > 0) {
          stats.deletedOrgImages += deleted
          cloudlog({ requestId: c.get('requestId'), message: 'deleted orphaned app images', appId, orgId })
        }
      }
      catch (error) {
        cloudlogErr({ requestId: c.get('requestId'), message: 'error deleting orphaned app images', error, appId, orgId })
        stats.errors++
      }
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'error processing org folder', error, orgId })
    stats.errors++
  }
}

async function cleanUserImages(c: Context<MiddlewareKeyVariables>, supabase: SupabaseAdmin, stats: CleanupStats, deadline: number) {
  // List all top-level folders in the images bucket (these are user IDs)
  const { data: topLevelFolders, error: listError } = await supabase
    .storage
    .from('images')
    .list('', { limit: 1000 })

  if (listError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'error listing top-level folders', error: listError })
    stats.errors++
    return
  }

  // Filter out the 'org' folder which contains app icons
  const userIds = shuffle((topLevelFolders ?? []).filter(f => f.name !== 'org' && f.id === null).map(f => f.name))
  stats.userFolders = userIds.length
  if (userIds.length === 0)
    return

  const users = await fetchExisting<{ id: string, image_url: string | null }>(userIds, ids => supabase
    .from('users')
    .select('id, image_url')
    .in('id', ids))
  const usersById = new Map(users.map(user => [user.id, user]))

  stats.userFoldersProcessed = await runWithDeadline(
    userIds,
    userId => cleanUserFolder(c, supabase, stats, userId, usersById.get(userId)),
    { concurrency: CLEANUP_CONCURRENCY, deadline },
  )
}

async function cleanOrgImages(c: Context<MiddlewareKeyVariables>, supabase: SupabaseAdmin, stats: CleanupStats, deadline: number) {
  // List all folders under images/org/
  const { data: orgFolders, error: orgListError } = await supabase
    .storage
    .from('images')
    .list('org', { limit: 1000 })

  if (orgListError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'error listing org folders', error: orgListError })
    stats.errors++
    return
  }

  // Skip files, only process directories
  const orgIds = shuffle((orgFolders ?? []).filter(f => f.id === null).map(f => f.name))
  stats.orgFolders = orgIds.length
  if (orgIds.length === 0)
    return

  const orgs = await fetchExisting<{ id: string, logo: string | null }>(orgIds, ids => supabase
    .from('orgs')
    .select('id, logo')
    .in('id', ids))
  const orgsById = new Map(orgs.map(org => [org.id, org]))

  stats.orgFoldersProcessed = await runWithDeadline(
    orgIds,
    orgId => cleanOrgFolder(c, supabase, stats, orgId, orgsById.get(orgId), deadline),
    { concurrency: CLEANUP_CONCURRENCY, deadline },
  )
}

// This CRON job cleans up orphaned images from storage
// - User avatars stored at: images/{user_id}/*
// - App icons stored at: images/org/{org_id}/{app_id}/icon
// Images become orphaned when their associated user, org, or app is deleted
// but the image cleanup failed or was not implemented at deletion time.
// It also removes stale user avatar files not linked by users.image_url.
// Work is time-boxed; folders not reached are handled by the next run.
app.post('/', middlewareAPISecret, async (c) => {
  cloudlog({ requestId: c.get('requestId'), message: 'starting cron_clean_orphan_images' })

  const startTime = Date.now()
  const deadline = startTime + CLEANUP_BUDGET_MS
  const stats: CleanupStats = {
    deletedUserImages: 0,
    deletedOrgImages: 0,
    errors: 0,
    userFolders: 0,
    userFoldersProcessed: 0,
    orgFolders: 0,
    orgFoldersProcessed: 0,
  }

  const supabase = supabaseAdmin(c)

  await Promise.all([
    cleanUserImages(c, supabase, stats, deadline).catch((error) => {
      cloudlogErr({ requestId: c.get('requestId'), message: 'error in user cleanup phase', error })
      stats.errors++
    }),
    cleanOrgImages(c, supabase, stats, deadline).catch((error) => {
      cloudlogErr({ requestId: c.get('requestId'), message: 'error in org cleanup phase', error })
      stats.errors++
    }),
  ])

  cloudlog({
    requestId: c.get('requestId'),
    context: 'orphan image cleanup completed',
    duration_ms: Date.now() - startTime,
    deleted_user_images: stats.deletedUserImages,
    deleted_org_images: stats.deletedOrgImages,
    user_folders: stats.userFolders,
    user_folders_processed: stats.userFoldersProcessed,
    org_folders: stats.orgFolders,
    org_folders_processed: stats.orgFoldersProcessed,
    errors: stats.errors,
  })

  return c.json(BRES)
})
