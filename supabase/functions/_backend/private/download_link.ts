import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { getBundleUrl, getManifestUrl } from '../utils/downloadUrl.ts'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

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
  const body = await parseBody<DataDownload>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post download link body', body })

  // Auth context is already set by middlewareAuth
  if (!(await checkPermission(c, 'app.read_bundles', { appId: body.app_id })))
    return simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.app_id })

  const auth = c.get('auth')!
  const userId = auth.userId

  const { data: bundle, error: getBundleError } = await supabaseAdmin(c)
    .from('app_versions')
    .select('*, owner_org ( created_by )')
    .eq('app_id', body.app_id)
    .eq('id', body.id)
    .single()

  const ownerOrg = (bundle?.owner_org as any).created_by

  if (getBundleError) {
    return simpleError('cannot_get_bundle', 'Cannot get bundle', { getBundleError })
  }

  if (!ownerOrg) {
    return simpleError('cannot_get_owner_org', 'Cannot get owner org', { bundle })
  }

  if (body.isManifest) {
    const { data: manifest, error: getManifestError } = await supabaseAdmin(c)
      .from('manifest')
      .select('*')
      .eq('app_id', body.app_id)
      .eq('id', body.id)

    if (getManifestError) {
      return simpleError('cannot_get_manifest', 'Cannot get manifest', { getManifestError })
    }
    const manifestEntries = getManifestUrl(c, bundle.id, manifest, userId)
    return c.json({ manifest: manifestEntries })
  }
  else {
    const url = await getBundleUrl(c, bundle.r2_path, userId, bundle.checksum ?? '')
    if (!url)
      return simpleError('cannot_get_bundle_url', 'Cannot get bundle url')

    return c.json({ url })
  }
})
