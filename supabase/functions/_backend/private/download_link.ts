import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { getBundleUrl, getManifestUrl } from '../utils/downloadUrl.ts'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'

interface DataDownload {
  app_id: string
  storage_provider: string
  user_id?: string
  id: number
  isManifest?: boolean
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  try {
    const body = await c.req.json<DataDownload>()
    cloudlog({ requestId: c.get('requestId'), message: 'post download link body', body })
    const authorization = c.req.header('authorization')
    if (!authorization)
      return c.json({ status: 'Cannot find authorization' }, 400)

    const { data: auth, error } = await supabaseAdmin(c as any).auth.getUser(
      authorization?.split('Bearer ')[1],
    )
    if (error || !auth || !auth.user)
      return c.json({ status: 'not authorize' }, 400)

    const userId = auth.user.id

    if (!(await hasAppRight(c as any, body.app_id, userId, 'read')))
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

    const { data: bundle, error: getBundleError } = await supabaseAdmin(c as any)
      .from('app_versions')
      .select('*, owner_org ( created_by )')
      .eq('app_id', body.app_id)
      .eq('id', body.id)
      .single()

    const ownerOrg = (bundle?.owner_org as any).created_by

    if (getBundleError) {
      console.error({ requestId: c.get('requestId'), message: 'getBundleError', error: getBundleError })
      return c.json({ status: 'Error unknown' }, 500)
    }

    if (!ownerOrg) {
      console.error({ requestId: c.get('requestId'), message: 'cannotGetOwnerOrg', bundle })
      return c.json({ status: 'Error unknown' }, 500)
    }

    if (body.isManifest) {
      const { data: manifest, error: getManifestError } = await supabaseAdmin(c as any)
        .from('manifest')
        .select('*')
        .eq('app_id', body.app_id)
        .eq('id', body.id)

      if (getManifestError) {
        console.error({ requestId: c.get('requestId'), message: 'getManifestError', error: getManifestError })
        return c.json({ status: 'Error unknown' }, 500)
      }
      const manifestEntries = getManifestUrl(c as any, bundle.id, manifest, userId)
      return c.json({ manifest: manifestEntries })
    }
    else {
      const data = await getBundleUrl(c as any, bundle.id, bundle.r2_path, userId)
      if (!data)
        return c.json({ status: 'Error unknown' }, 500)

      return c.json({ url: data.url })
    }
  }
  catch (e) {
    return c.json({ status: 'Cannot get download link', error: JSON.stringify(e) }, 500)
  }
})
