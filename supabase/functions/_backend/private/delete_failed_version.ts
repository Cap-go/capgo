import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareKey } from '../utils/hono.ts'
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
  try {
    const body = await c.req.json<DataUpload>()
    cloudlog({ requestId: c.get('requestId'), message: 'delete failed version body', body })
    const apikey = c.get('apikey')
    const capgkey = c.get('capgkey') as string
    cloudlog({ requestId: c.get('requestId'), message: 'apikey', apikey })
    cloudlog({ requestId: c.get('requestId'), message: 'capgkey', capgkey })
    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
      .rpc('get_user_id', { apikey: capgkey, app_id: body.app_id })
    if (_errorUserId) {
      cloudlog({ requestId: c.get('requestId'), message: '_errorUserId', error: _errorUserId })
      return c.json({ status: 'Error User not found' }, 500)
    }

    if (!(await hasAppRightApikey(c, body.app_id, userId, 'read', capgkey))) {
      cloudlog({ requestId: c.get('requestId'), message: 'not has app right', userId, app_id: body.app_id })
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
    }

    const { error: errorApp } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id, owner_org')
      .eq('app_id', body.app_id)
      .single()
    if (errorApp) {
      cloudlog({ requestId: c.get('requestId'), message: 'errorApp', error: errorApp })
      return c.json({ status: 'Error App not found' }, 500)
    }

    if (!body.app_id || !body.name) {
      cloudlog({ requestId: c.get('requestId'), message: 'Error app_id or bundle name missing', body })
      return c.json({ status: 'Error app_id or bundle name missing' }, 500)
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
      cloudlog({ requestId: c.get('requestId'), message: 'errorVersion', error: errorVersion })
      return c.json({ status: 'Already deleted' })
    }

    cloudlog({ requestId: c.get('requestId'), message: 'r2_path', r2_path: version.r2_path })
    // check if app version exist

    cloudlog({ requestId: c.get('requestId'), message: 's3.checkIfExist', r2_path: version.r2_path })

    // check if object exist in r2
    if (version.r2_path) {
      const exist = await s3.checkIfExist(c, version.r2_path)
      if (exist) {
        cloudlog({ requestId: c.get('requestId'), message: 'exist', exist })
        return c.json({ status: 'Error already uploaded to S3, delete is unsafe use the webapp to delete it' }, 500)
      }
    }

    // delete the version
    const { error: errorDelete } = await supabaseAdmin(c)
      .from('app_versions')
      .delete()
      .eq('id', version.id)
      .single()
    if (errorDelete) {
      cloudlog({ requestId: c.get('requestId'), message: 'errorDelete', error: errorDelete })
      return c.json({ status: 'Error deleting version' }, 500)
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
  }
  catch (e) {
    cloudlog({ requestId: c.get('requestId'), message: 'error', error: e })
    return c.json({ status: 'Cannot get upload link', error: JSON.stringify(e) }, 500)
  }
})
