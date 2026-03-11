import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface DeleteStorageBody {
  orgId: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const body = await parseBody<DeleteStorageBody>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'cron_delete_storage', body })

  if (!body.orgId)
    throw simpleError('no_orgId', 'No orgId', { body })

  const supabase = supabaseAdmin(c)

  // Get all apps owned by this org
  const { data: apps, error: appsError } = await supabase
    .from('apps')
    .select('app_id')
    .eq('owner_org', body.orgId)

  if (appsError)
    throw simpleError('cannot_get_apps', 'Cannot get apps for org', { error: appsError, orgId: body.orgId })

  if (!apps || apps.length === 0) {
    cloudlog({ requestId: c.get('requestId'), message: 'No apps found for org, nothing to delete', orgId: body.orgId })
    return c.json(BRES)
  }

  const appIds = apps.map(a => a.app_id)

  // Mark all non-deleted versions with storage as deleted.
  // The DB trigger set_deleted_at_on_soft_delete automatically sets deleted_at = NOW(),
  // which triggers on_version_update webhook to delete the actual S3/R2 objects.
  // Exclude versions with no r2_path (e.g. 'unknown' placeholder versions).
  const { error: updateError, count } = await supabase
    .from('app_versions')
    .update({ deleted: true })
    .in('app_id', appIds)
    .eq('deleted', false)
    .not('r2_path', 'is', null)

  if (updateError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to delete app versions for org', error: updateError, orgId: body.orgId })
    throw simpleError('cannot_delete_versions', 'Cannot mark app versions as deleted', { error: updateError, orgId: body.orgId })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Storage deletion initiated for non-paying org',
    orgId: body.orgId,
    appCount: appIds.length,
    versionsMarked: count ?? 0,
  })

  return c.json(BRES)
})
