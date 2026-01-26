import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, parseBody, quickError, simpleError } from '../utils/hono.ts'
import { middlewareKey } from '../utils/hono_middleware.ts'
import { logsnag } from '../utils/logsnag.ts'
import { checkPermission } from '../utils/rbac.ts'
import { s3 } from '../utils/s3.ts'
import { supabaseApikey } from '../utils/supabase.ts'

interface DataUpload {
  app_id: string
  name: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.delete('/', middlewareKey(['all', 'write', 'upload']), async (c) => {
  const body = await parseBody<DataUpload>(c)
  const capgkey = c.get('capgkey') as string
  const { data: userId, error: _errorUserId } = await supabaseApikey(c, capgkey)
    .rpc('get_user_id', { apikey: capgkey, app_id: body.app_id })
  if (_errorUserId) {
    return quickError(404, 'user_not_found', 'Error User not found', { _errorUserId })
  }

  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'bundle.delete', { appId: body.app_id }))) {
    return quickError(401, 'not_authorized', 'You can\'t access this app', { app_id: body.app_id })
  }

  const { error: errorApp } = await supabaseApikey(c, capgkey)
    .from('apps')
    .select('app_id, owner_org')
    .eq('app_id', body.app_id)
    .single()
  if (errorApp) {
    return quickError(404, 'app_not_found', 'Error App not found', { errorApp })
  }

  if (!body.app_id) {
    return quickError(400, 'error_app_id_missing', 'Error bundle name missing', { body })
  }
  if (!body.name) {
    return quickError(400, 'error_bundle_name_missing', 'Error bundle name missing', { body })
  }

  const { data: version, error: errorVersion } = await supabaseApikey(c, capgkey)
    .from('app_versions')
    .select('*')
    .eq('name', body.name)
    .eq('app_id', body.app_id)
    .eq('storage_provider', 'r2-direct')
    .eq('deleted', false)
    .single()
  if (errorVersion) {
    throw simpleError('error_already_deleted', 'Already deleted', { errorVersion })
  }
  // check if object exist in r2
  if (version.r2_path) {
    const exist = await s3.checkIfExist(c, version.r2_path)
    if (exist) {
      throw simpleError('error_already_uploaded_to_s3', 'Error already uploaded to S3, delete is unsafe use the webapp to delete it')
    }
  }

  // delete the version
  const { error: errorDelete } = await supabaseApikey(c, capgkey)
    .from('app_versions')
    .delete()
    .eq('id', version.id)
    .single()
  if (errorDelete) {
    if (errorDelete.code !== 'PGRST116') {
      throw simpleError('error_deleting_version', 'Error deleting version', { errorDelete })
    }
    cloudlog({
      requestId: c.get('requestId'),
      message: 'delete failed version already deleted',
      versionId: version.id,
      errorDelete,
    })
  }

  const LogSnag = logsnag(c)
  await LogSnag.track({
    channel: 'upload-failed',
    event: 'Failed to upload a bundle',
    user_id: version.owner_org,
    icon: '💀',
  })

  return c.json(BRES)
})
