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

type StorageBucket = ReturnType<ReturnType<typeof supabaseAdmin>['storage']['from']>

async function deleteOrgImages(c: Context<MiddlewareKeyVariables>, orgId: string) {
  try {
    const storage = supabaseAdmin(c).storage.from('images')
    const requestId = c.get('requestId')
    const { data: entries } = await storage.list(`org/${orgId}`)

    if (!entries?.length) {
      return
    }

    for (const entry of entries) {
      if (entry.id === null) {
        await deleteOrgAppImages(storage, orgId, entry.name, requestId)
        continue
      }

      await storage.remove([`org/${orgId}/${entry.name}`])
    }

    cloudlog({ requestId, message: 'deleted all org images', org_id: orgId })
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'error deleting org images', error, org_id: orgId })
  }
}

async function deleteOrgAppImages(storage: StorageBucket, orgId: string, folderName: string, requestId?: string) {
  const { data: appFiles } = await storage.list(`org/${orgId}/${folderName}`)

  if (!appFiles?.length) {
    return
  }

  const filePaths = appFiles.map(file => `org/${orgId}/${folderName}/${file.name}`)
  await storage.remove(filePaths)
  cloudlog({ requestId, message: 'deleted org app images', count: appFiles.length, folder: folderName })
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

  await deleteOrgImages(c, orgId)

  const { error } = await supabaseApikey(c, apikey.key)
    .from('orgs')
    .delete()
    .eq('id', orgId)

  if (error) {
    throw simpleError('cannot_delete_organization', 'Cannot delete organization', { error })
  }

  return c.json({ status: 'Organization deleted' })
}
