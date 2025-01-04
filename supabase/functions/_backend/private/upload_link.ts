import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { middlewareKey } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { s3 } from '../utils/s3.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'

interface dataUpload {
  name: string
  app_id: string
  version?: number
}

export const app = new Hono()

app.post('/', middlewareKey(['all', 'write', 'upload']), async (c: Context) => {
  try {
    const body = await c.req.json<dataUpload>()
    console.log({ requestId: c.get('requestId'), context: 'post upload link body', body })
    const apikey = c.get('apikey')
    const capgkey = c.get('capgkey')
    console.log({ requestId: c.get('requestId'), context: 'apikey', apikey })
    console.log({ requestId: c.get('requestId'), context: 'capgkey', capgkey })
    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
      .rpc('get_user_id', { apikey: capgkey, app_id: body.app_id })
    if (_errorUserId) {
      console.log({ requestId: c.get('requestId'), context: '_errorUserId', error: _errorUserId })
      return c.json({ status: 'Error User not found' }, 500)
    }

    if (!(await hasAppRight(c, body.app_id, userId, 'read'))) {
      console.log({ requestId: c.get('requestId'), context: 'no read' })
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
    }

    const { data: app, error: errorApp } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id, owner_org')
      .eq('app_id', body.app_id)
      // .eq('user_id', userId)
      .single()
    if (errorApp) {
      console.log({ requestId: c.get('requestId'), context: 'errorApp', error: errorApp })
      return c.json({ status: 'Error App not found' }, 500)
    }

    const { data: version, error: errorVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id, name')
      .eq('name', body.name)
      .eq('app_id', body.app_id)
      .eq('storage_provider', 'r2-direct')
      .eq('user_id', apikey.user_id)
      .single()
    if (errorVersion) {
      console.log({ requestId: c.get('requestId'), context: 'errorVersion', error: errorVersion })
      return c.json({ status: 'Error App or Version not found' }, 500)
    }

    // orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/ee.forgr.capacitor_go/11.zip
    const filePath = `orgs/${app.owner_org}/apps/${app.app_id}/${version.name}.zip`
    console.log({ requestId: c.get('requestId'), context: 'filePath', filePath })
    // check if app version exist

    console.log({ requestId: c.get('requestId'), context: 's3.checkIfExist', filePath })

    // check if object exist in r2
    const exist = await s3.checkIfExist(c, filePath)
    if (exist) {
      console.log({ requestId: c.get('requestId'), context: 'exist', exist })
      return c.json({ status: 'Error already exist' }, 500)
    }
    console.log({ requestId: c.get('requestId'), context: 's3.getUploadUrl', filePath })

    const url = await s3.getUploadUrl(c, filePath)
    console.log({ requestId: c.get('requestId'), context: 'url', url })
    if (!url) {
      console.log({ requestId: c.get('requestId'), context: 'no url found' })
      return c.json({ status: 'Error unknow' }, 500)
    }

    const LogSnag = logsnag(c)
    await LogSnag.track({
      channel: 'upload-get-link',
      event: 'Upload via single file',
      icon: '🏛️',
      user_id: app.owner_org,
      notify: false,
    })

    console.log({ requestId: c.get('requestId'), context: 'url', filePath, url })
    const response = { url }

    const { error: changeError } = await supabaseAdmin(c)
      .from('app_versions')
      .update({ r2_path: filePath })
      .eq('id', version.id)

    if (changeError) {
      console.error({ requestId: c.get('requestId'), context: 'Cannot update supabase', changeError })
      return c.json({ status: 'Error unknow' }, 500)
    }

    return c.json(response)
  }
  catch (e) {
    console.log({ requestId: c.get('requestId'), context: 'error', error: e })
    return c.json({ status: 'Cannot get upload link', error: JSON.stringify(e) }, 500)
  }
})
