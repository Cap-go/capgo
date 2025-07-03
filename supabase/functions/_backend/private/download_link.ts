import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { getBundleUrl, getManifestUrl } from '../utils/downloadUrl.ts'
import { middlewareAuth, simpleError, useCors } from '../utils/hono.ts'
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
  const body = await c.req.json<DataDownload>()
    .catch((e) => {
      throw simpleError('invalid_json_body', 'Invalid JSON body', { e })
    })
  cloudlog({ requestId: c.get('requestId'), message: 'post download link body', body })
  const authorization = c.req.header('authorization')
  if (!authorization)
    throw simpleError('cannot_find_authorization', 'Cannot find authorization')

  const { data: auth, error } = await supabaseAdmin(c).auth.getUser(
    authorization?.split('Bearer ')[1],
  )
  if (error || !auth?.user?.id)
    throw simpleError('not_authorize', 'Not authorize')

  const userId = auth.user.id

  if (!(await hasAppRight(c, body.app_id, userId, 'read')))
    throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.app_id })

  const { data: bundle, error: getBundleError } = await supabaseAdmin(c)
    .from('app_versions')
    .select('*, owner_org ( created_by )')
    .eq('app_id', body.app_id)
    .eq('id', body.id)
    .single()

  const ownerOrg = (bundle?.owner_org as any).created_by

  if (getBundleError) {
    throw simpleError('cannot_get_bundle', 'Cannot get bundle', { getBundleError })
  }

  if (!ownerOrg) {
    throw simpleError('cannot_get_owner_org', 'Cannot get owner org', { bundle })
  }

  if (body.isManifest) {
    const { data: manifest, error: getManifestError } = await supabaseAdmin(c)
      .from('manifest')
      .select('*')
      .eq('app_id', body.app_id)
      .eq('id', body.id)

    if (getManifestError) {
      throw simpleError('cannot_get_manifest', 'Cannot get manifest', { getManifestError })
    }
    const manifestEntries = getManifestUrl(c, bundle.id, manifest, userId)
    return c.json({ manifest: manifestEntries })
  }
  else {
    const data = await getBundleUrl(c, bundle.id, bundle.r2_path, userId)
    if (!data)
      throw simpleError('cannot_get_bundle_url', 'Cannot get bundle url')

    return c.json({ url: data.url })
  }
})
