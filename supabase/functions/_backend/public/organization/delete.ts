import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { supabaseAdmin, supabaseApikey } from '../../utils/supabase.ts'
import { checkPermission } from '../../utils/rbac.ts'

interface DeleteOrganizationParams {
  orgId?: string
}

export async function deleteOrg(c: Context<MiddlewareKeyVariables>, body: DeleteOrganizationParams, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const orgId = body.orgId

  if (!orgId) {
    throw simpleError('missing_org_id', 'Missing orgId')
  }

  // Check if user has right to delete the organization (requires super_admin equivalent)
  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'org.update_settings', { orgId }))) {
    throw quickError(403, 'invalid_org_id', 'You can\'t delete this organization', { org_id: orgId })
  }

  // Delete all organization images from storage before deleting the org
  // Organization images are stored at: images/org/{org_id}/*
  try {
    // List all files under the org folder recursively
    const { data: folders } = await supabaseAdmin(c)
      .storage
      .from('images')
      .list(`org/${orgId}`)

    if (folders && folders.length > 0) {
      // For each subfolder (app_id), list and delete files
      for (const folder of folders) {
        if (folder.id === null) {
          // This is a directory (app folder), list its contents
          const { data: appFiles } = await supabaseAdmin(c)
            .storage
            .from('images')
            .list(`org/${orgId}/${folder.name}`)

          if (appFiles && appFiles.length > 0) {
            const filePaths = appFiles.map(file => `org/${orgId}/${folder.name}/${file.name}`)
            await supabaseAdmin(c)
              .storage
              .from('images')
              .remove(filePaths)
            cloudlog({ requestId: c.get('requestId'), message: 'deleted org app images', count: appFiles.length, folder: folder.name })
          }
        }
        else {
          // This is a file directly in the org folder
          await supabaseAdmin(c)
            .storage
            .from('images')
            .remove([`org/${orgId}/${folder.name}`])
        }
      }
      cloudlog({ requestId: c.get('requestId'), message: 'deleted all org images', org_id: orgId })
    }
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'error deleting org images', error, org_id: orgId })
  }

  const { error } = await supabaseApikey(c, apikey.key)
    .from('orgs')
    .delete()
    .eq('id', orgId)

  if (error) {
    throw simpleError('cannot_delete_organization', 'Cannot delete organization', { error })
  }

  return c.json({ status: 'Organization deleted' })
}
