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
  const storage = supabaseAdmin(c).storage.from('images')
  const requestId = c.get('requestId')
  const { data: entries, error: listError } = await storage.list(`org/${orgId}`)

  if (listError) {
    cloudlog({
      requestId,
      message: 'error listing org images',
      org_id: orgId,
      folder: `org/${orgId}`,
      error: listError,
    })
    return
  }

  if (!entries?.length) {
    return
  }

  for (const entry of entries) {
    if (entry.id === null) {
      const ok = await deleteOrgAppImages(storage, orgId, entry.name, requestId)
      if (!ok) {
        return
      }
      continue
    }

    const { error: removeError } = await storage.remove([`org/${orgId}/${entry.name}`])
    if (removeError) {
      cloudlog({
        requestId,
        message: 'error deleting org image entry',
        org_id: orgId,
        entry: entry.name,
        error: removeError,
      })
      return
    }
  }

  cloudlog({ requestId, message: 'deleted all org images', org_id: orgId })
}

async function deleteOrgAppImages(storage: StorageBucket, orgId: string, folderName: string, requestId?: string) {
  const folderPath = `org/${orgId}/${folderName}`
  const { data: appFiles, error: listError } = await storage.list(folderPath)

  if (listError) {
    cloudlog({
      requestId,
      message: 'error listing org app images',
      org_id: orgId,
      folder: folderName,
      error: listError,
    })
    return false
  }

  if (!appFiles?.length) {
    return true
  }

  const filePaths = appFiles.map(file => `${folderPath}/${file.name}`)
  const { error: removeError } = await storage.remove(filePaths)
  if (removeError) {
    cloudlog({
      requestId,
      message: 'error deleting org app images',
      org_id: orgId,
      folder: folderName,
      error: removeError,
    })
    return false
  }

  cloudlog({ requestId, message: 'deleted org app images', count: appFiles.length, folder: folderName })
  return true
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
