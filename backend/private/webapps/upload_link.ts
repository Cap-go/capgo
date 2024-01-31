import { Hono } from 'hono'
import type { Context } from 'hono'
import { r2 } from '../../_utils/r2.ts'
import { middlewareKey } from '../../_utils/hono.ts';
import { supabaseAdmin } from '../../_utils/supabase.ts';

interface dataUpload {
  bucket_id: string
  app_id: string
}

export const app = new Hono()

app.post('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<dataUpload>()
    console.log('body', body)
    const apikey = c.get('apikey')
    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
    .rpc('get_user_id', { apikey: c.req.header('authorization')!, app_id: body.app_id })
    if (_errorUserId)
      return c.json({ status: 'Error User not found' }, 500)
    const filePath = `apps/${apikey.user_id}/${body.app_id}/versions/${body.bucket_id}`
    // check if app version exist
    const { error: errorVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id')
      .eq('bucket_id', body.bucket_id)
      .eq('app_id', body.app_id)
      .eq('storage_provider', 'r2-direct')
      .eq('user_id', userId)
      .single()
    if (errorVersion) {
      console.log('errorVersion', errorVersion)
      return c.json({ status: 'Error App or Version not found' }, 500)
    }
    const { error: errorApp } = await supabaseAdmin(c)
      .from('apps')
      .select('app_id')
      .eq('app_id', body.app_id)
      .eq('user_id', userId)
      .single()
    if (errorApp)
      return c.json({ status: 'Error App not found' }, 500)

    // check if object exist in r2
    const exist = await r2.checkIfExist(c, filePath)
    if (exist)
      return c.json({ status: 'Error already exist' }, 500)
    const url = await r2.getUploadUrl(c, filePath)
    if (!url)
      return c.json({ status: 'Error unknow' }, 500)
    console.log('url', filePath, url)
    return c.json({ url })
  } catch (e) {
    return c.json({ status: 'Cannot get upload link', error: JSON.stringify(e) }, 500) 
  }
})
