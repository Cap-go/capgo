import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { s3 } from '../../utils/s3.ts'
import { middlewareKey } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

interface dataUpload {
  bucket_id: string
  app_id: string
}

export const app = new Hono()

app.post('/', middlewareKey(['all', 'write', 'upload']), async (c: Context) => {
  try {
    const body = await c.req.json<dataUpload>()
    console.log('body', body)
    const apikey = c.get('apikey')
    const capgkey = c.get('capgkey')
    console.log('apikey', apikey)
    console.log('capgkey', capgkey)
    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
      .rpc('get_user_id', { apikey: capgkey, app_id: body.app_id })
    if (_errorUserId) {
      console.log('_errorUserId', _errorUserId)
      return c.json({ status: 'Error User not found' }, 500)
    }
    const filePath = `apps/${userId}/${body.app_id}/versions/${body.bucket_id}`
    // check if app version exist
    const { error: errorVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id')
      .eq('bucket_id', body.bucket_id)
      .eq('app_id', body.app_id)
      .eq('storage_provider', 'r2-direct')
      .eq('user_id', apikey.user_id)
      .single()
    if (errorVersion) {
      console.log('errorVersion', errorVersion)
      return c.json({ status: 'Error App or Version not found' }, 500)
    }
    const { error: errorApp } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id')
      .eq('app_id', body.app_id)
      .eq('user_id', apikey.user_id)
      .single()
    if (errorApp) {
      console.log('errorApp', errorApp)
      return c.json({ status: 'Error App not found' }, 500)
    }
    console.log('s3.checkIfExist', filePath)

    // check if object exist in r2
    const exist = await s3.checkIfExist(c, filePath)
    if (exist) {
      console.log('exist', exist)
      return c.json({ status: 'Error already exist' }, 500)
    }
    console.log('s3.getUploadUrl', filePath)
    const url = await s3.getUploadUrl(c, filePath)
    console.log('url', url)
    if (!url) {
      console.log('no url found')
      return c.json({ status: 'Error unknow' }, 500)
    }
    console.log('url', filePath, url)
    return c.json({ url })
  }
  catch (e) {
    console.log('error', e)
    return c.json({ status: 'Cannot get upload link', error: JSON.stringify(e) }, 500)
  }
})
