import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { middlewareKey } from '../../_utils/hono.ts'
import { isAdmin, supabaseAdmin } from '../../_utils/supabase.ts'
import { getBundleUrl } from '../../_utils/downloadUrl.ts'

interface DataDownload {
  app_id: string
  storage_provider: string
  user_id?: string
  bucket_id: string
}

export const app = new Hono()

app.post('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<DataDownload>()
    console.log('body', body)
    const authorization = c.req.header('authorization')
    if (!authorization)
      return c.json({ status: 'Cannot find authorization' }, 400)

    const { data: auth, error } = await supabaseAdmin(c).auth.getUser(
      authorization?.split('Bearer ')[1],
    )
    if (error || !auth || !auth.user)
      return c.json({status: 'not authorize' }, 400)

    const admin = await isAdmin(c, auth.user.id)
    const userId = (admin && body.user_id) ? body.user_id : auth.user.id
    const url = await getBundleUrl(c, body.storage_provider, `apps/${userId}/${body.app_id}/versions`, body.bucket_id)
    if (!url)
      return c.json({ status: 'Error unknow' }, 500)  
    return c.json({ url })
  } catch (e) {
    return c.json({ status: 'Cannot get download link', error: JSON.stringify(e) }, 500) 
  }
})
