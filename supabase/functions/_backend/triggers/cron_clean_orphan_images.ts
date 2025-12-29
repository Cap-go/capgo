import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

// This CRON job cleans up orphaned images from storage
// - User avatars stored at: images/{user_id}/*
// - App icons stored at: images/org/{org_id}/{app_id}/icon
// Images become orphaned when their associated user, org, or app is deleted
// but the image cleanup failed or was not implemented at deletion time.
app.post('/', middlewareAPISecret, async (c) => {
  cloudlog({ requestId: c.get('requestId'), message: 'starting cron_clean_orphan_images' })

  const startTime = Date.now()
  let deletedUserImages = 0
  let deletedOrgImages = 0
  let errors = 0

  const supabase = supabaseAdmin(c)

  // 1. Clean orphaned user avatar images
  // List all top-level folders in the images bucket (these are user IDs)
  try {
    const { data: topLevelFolders, error: listError } = await supabase
      .storage
      .from('images')
      .list('', { limit: 1000 })

    if (listError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'error listing top-level folders', error: listError })
      errors++
    }
    else if (topLevelFolders) {
      // Filter out the 'org' folder which contains app icons
      const userFolders = topLevelFolders.filter(f => f.name !== 'org' && f.id === null)

      for (const folder of userFolders) {
        const userId = folder.name

        // Check if user exists
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .maybeSingle()

        if (userError) {
          cloudlogErr({ requestId: c.get('requestId'), message: 'error checking user', error: userError, userId })
          errors++
          continue
        }

        // If user doesn't exist, delete their images
        if (!user) {
          try {
            const { data: files } = await supabase
              .storage
              .from('images')
              .list(userId)

            if (files && files.length > 0) {
              const filePaths = files.map(file => `${userId}/${file.name}`)
              await supabase
                .storage
                .from('images')
                .remove(filePaths)
              deletedUserImages += files.length
              cloudlog({ requestId: c.get('requestId'), message: 'deleted orphaned user images', count: files.length, userId })
            }
          }
          catch (error) {
            cloudlogErr({ requestId: c.get('requestId'), message: 'error deleting orphaned user images', error, userId })
            errors++
          }
        }
      }
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'error in user cleanup phase', error })
    errors++
  }

  // 2. Clean orphaned org/app images
  // List all folders under images/org/
  try {
    const { data: orgFolders, error: orgListError } = await supabase
      .storage
      .from('images')
      .list('org', { limit: 1000 })

    if (orgListError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'error listing org folders', error: orgListError })
      errors++
    }
    else if (orgFolders) {
      for (const orgFolder of orgFolders) {
        if (orgFolder.id !== null)
          continue // Skip files, only process directories

        const orgId = orgFolder.name

        // Check if org exists
        const { data: org, error: orgError } = await supabase
          .from('orgs')
          .select('id')
          .eq('id', orgId)
          .maybeSingle()

        if (orgError) {
          cloudlogErr({ requestId: c.get('requestId'), message: 'error checking org', error: orgError, orgId })
          errors++
          continue
        }

        // If org doesn't exist, delete all its images
        if (!org) {
          try {
            const { data: appFolders } = await supabase
              .storage
              .from('images')
              .list(`org/${orgId}`)

            if (appFolders && appFolders.length > 0) {
              for (const appFolder of appFolders) {
                if (appFolder.id === null) {
                  // Directory - list and delete files
                  const { data: files } = await supabase
                    .storage
                    .from('images')
                    .list(`org/${orgId}/${appFolder.name}`)

                  if (files && files.length > 0) {
                    const filePaths = files.map(file => `org/${orgId}/${appFolder.name}/${file.name}`)
                    await supabase
                      .storage
                      .from('images')
                      .remove(filePaths)
                    deletedOrgImages += files.length
                  }
                }
                else {
                  // File - delete directly
                  await supabase
                    .storage
                    .from('images')
                    .remove([`org/${orgId}/${appFolder.name}`])
                  deletedOrgImages++
                }
              }
              cloudlog({ requestId: c.get('requestId'), message: 'deleted orphaned org images', orgId })
            }
          }
          catch (error) {
            cloudlogErr({ requestId: c.get('requestId'), message: 'error deleting orphaned org images', error, orgId })
            errors++
          }
          continue
        }

        // Org exists, but check if individual apps still exist
        try {
          const { data: appFolders } = await supabase
            .storage
            .from('images')
            .list(`org/${orgId}`)

          if (appFolders) {
            for (const appFolder of appFolders) {
              if (appFolder.id !== null)
                continue // Skip files

              const appId = appFolder.name

              // Check if app exists
              const { data: appCheck, error: appError } = await supabase
                .from('apps')
                .select('app_id')
                .eq('app_id', appId)
                .maybeSingle()

              if (appError) {
                cloudlogErr({ requestId: c.get('requestId'), message: 'error checking app', error: appError, appId })
                errors++
                continue
              }

              // If app doesn't exist, delete its images
              if (!appCheck) {
                try {
                  const { data: files } = await supabase
                    .storage
                    .from('images')
                    .list(`org/${orgId}/${appId}`)

                  if (files && files.length > 0) {
                    const filePaths = files.map(file => `org/${orgId}/${appId}/${file.name}`)
                    await supabase
                      .storage
                      .from('images')
                      .remove(filePaths)
                    deletedOrgImages += files.length
                    cloudlog({ requestId: c.get('requestId'), message: 'deleted orphaned app images', appId, orgId })
                  }
                }
                catch (error) {
                  cloudlogErr({ requestId: c.get('requestId'), message: 'error deleting orphaned app images', error, appId, orgId })
                  errors++
                }
              }
            }
          }
        }
        catch (error) {
          cloudlogErr({ requestId: c.get('requestId'), message: 'error processing org app folders', error, orgId })
          errors++
        }
      }
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'error in org cleanup phase', error })
    errors++
  }

  const endTime = Date.now()
  const duration = endTime - startTime

  cloudlog({
    requestId: c.get('requestId'),
    context: 'orphan image cleanup completed',
    duration_ms: duration,
    deleted_user_images: deletedUserImages,
    deleted_org_images: deletedOrgImages,
    errors,
  })

  return c.json(BRES)
})
