import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareKey, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
import { s3 } from '../utils/s3.ts'
import { hasAppRightApikey, supabaseAdmin } from '../utils/supabase.ts'

interface DataUpload {
  app_id: string
  name: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.delete('/', middlewareKey(['all', 'write', 'upload']), async (c) => {
  const body = await c.req.json<DataUpload>()
  cloudlog({ requestId: c.get('requestId'), message: 'delete failed version body', body })
  const apikey = c.get('apikey')
  const capgkey = c.get('capgkey') as string
  cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })
  cloudlog({ requestId: c.get('requestId'), message: 'capgkey', capgkey })
  const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
    .rpc('get_user_id', { apikey: capgkey, app_id: body.app_id })
  if (_errorUserId) {
    throw simpleError('error_user_not_found', 'Error User not found', { _errorUserId })
  }

  if (!(await hasAppRightApikey(c, body.app_id, userId, 'read', capgkey))) {
    throw simpleError('not_authorized', 'You can\'t access this app', { app_id: body.app_id })
  }

  const { error: errorApp } = await supabaseAdmin(c)
    .from('apps')
    .select('app_id, owner_org')
    .eq('app_id', body.app_id)
    .single()
  if (errorApp) {
    throw simpleError('error_app_not_found', 'Error App not found', { errorApp })
  }

  if (!body.app_id || !body.name) {
    throw simpleError('error_app_id_or_bundle_name_missing', 'Error app_id or bundle name missing', { body })
  }

  const { data: version, error: errorVersion } = await supabaseAdmin(c)
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
  const { error: errorDelete } = await supabaseAdmin(c)
    .from('app_versions')
    .delete()
    .eq('id', version.id)
    .single()
  if (errorDelete) {
    throw simpleError('error_deleting_version', 'Error deleting version', { errorDelete })
  }

  const LogSnag = logsnag(c)
  await LogSnag.track({
    channel: 'upload-failed',
    event: 'Failed to upload a bundle',
    user_id: version.owner_org,
    icon: '💀',
  })

  cloudlog({ requestId: c.get('requestId'), message: 'delete version', id: version.id })
  return c.json({ status: 'Version deleted' })
})
