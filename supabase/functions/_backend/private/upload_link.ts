import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { middlewareKey } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { s3 } from '../utils/s3.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'
import { initMultipartUpload } from './multipart.ts'

interface dataUpload {
  name?: string
  app_id: string
  bucket_id?: string
  version?: number
}

export const app = new Hono()

app.post('/', middlewareKey(['all', 'write', 'upload']), async (c: Context) => {
  try {
    const body = await c.req.json<dataUpload>()
    console.log(c.get('requestId'), 'post upload link body', body)
    const apikey = c.get('apikey')
    const capgkey = c.get('capgkey')
    console.log(c.get('requestId'), 'apikey', apikey)
    console.log(c.get('requestId'), 'capgkey', capgkey)
    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
      .rpc('get_user_id', { apikey: capgkey, app_id: body.app_id })
    if (_errorUserId) {
      console.log(c.get('requestId'), '_errorUserId', _errorUserId)
      return c.json({ status: 'Error User not found' }, 500)
    }

    if (!(await hasAppRight(c, body.app_id, userId, 'read'))) {
      console.log(c.get('requestId'), 'no read')
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
    }

    const { data: app, error: errorApp } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id, owner_org')
      .eq('app_id', body.app_id)
      // .eq('user_id', userId)
      .single()
    if (errorApp) {
      console.log(c.get('requestId'), 'errorApp', errorApp)
      return c.json({ status: 'Error App not found' }, 500)
    }

    if ((body.name && body.bucket_id) || (!body.name && !body.bucket_id))
      return c.json({ status: 'Error name or bucket_id' }, 500)

    // console.log(c.get('requestId'), 'body', body.name ?? body.bucket_id?.split('.')[0] ?? '')
    const { data: version, error: errorVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id')
      .eq(body.name ? 'name' : 'bucket_id', body.name ? body.name : body.bucket_id ?? '')
      .eq('app_id', body.app_id)
      .eq('storage_provider', 'r2-direct')
      .eq('user_id', apikey.user_id)
      .single()
    if (errorVersion) {
      console.log(c.get('requestId'), 'errorVersion', errorVersion)
      return c.json({ status: 'Error App or Version not found' }, 500)
    }

    // const filePath = `apps/${apikey.user_id}/${body.app_id}/versions/${body.bucket_id}`
    // orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/ee.forgr.capacitor_go/11.zip
    const filePath = `orgs/${app.owner_org}/apps/${app.app_id}/${version.id}.zip`
    console.log(c.get('requestId'), 'filePath', filePath)
    // check if app version exist

    console.log(c.get('requestId'), 's3.checkIfExist', filePath)

    // check if object exist in r2
    const exist = await s3.checkIfExist(c, filePath)
    if (exist) {
      console.log(c.get('requestId'), 'exist', exist)
      return c.json({ status: 'Error already exist' }, 500)
    }
    console.log(c.get('requestId'), 's3.getUploadUrl', filePath)

    let response: any
    if (body.version && body.version === 1) {
      console.log(c.get('requestId'), `Multipart upload for ${JSON.stringify(body)}`)
      const uploadId = await createMultipartRequest(c, filePath, app.owner_org)

      response = { uploadId, key: filePath, url: getMultipartServerUrl(c, true) }
    }
    else {
      const url = await s3.getUploadUrl(c, filePath)
      console.log(c.get('requestId'), 'url', url)
      if (!url) {
        console.log(c.get('requestId'), 'no url found')
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

      console.log(c.get('requestId'), 'url', filePath, url)
      response = { url }
    }

    const { error: changeError } = await supabaseAdmin(c)
      .from('app_versions')
      .update({ r2_path: filePath })
      .eq('id', version.id)

    if (changeError) {
      console.error(c.get('requestId'), 'Cannot update supabase', changeError)
      return c.json({ status: 'Error unknow' }, 500)
    }

    return c.json(response)
  }
  catch (e) {
    console.log(c.get('requestId'), 'error', e)
    return c.json({ status: 'Cannot get upload link', error: JSON.stringify(e) }, 500)
  }
})

function getMultipartServerUrl(c: Context, external = false) {
  const raw = !external ? getEnv(c, 'MULTIPART_SERVER') : getEnv(c, 'MULTIPART_SERVER').replace('host.docker.internal', '127.0.0.1')
  return new URL(raw)
}

async function createMultipartRequest(c: Context, path: string, orgid: string): Promise<string | null> {
  const multipart = await initMultipartUpload(c, path)
  if (multipart.error)
    return null

  if (!multipart.uploadId) {
    console.error(c.get('requestId'), 'No upload id (?) for multipart')
    return null
  }

  const LogSnag = logsnag(c)
  await LogSnag.track({
    channel: 'upload-get-link',
    event: 'Upload via multipart',
    icon: '🏗️',
    user_id: orgid,
    notify: false,
  })

  return multipart.uploadId
}
