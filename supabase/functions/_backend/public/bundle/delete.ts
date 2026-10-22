import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { HTTPException } from 'hono/http-exception'
import { CAPGO_API_2026_10_22, resolveCapgoApiVersion } from '../../utils/api_version.ts'
import { lockBundleLifecycles, softDeleteLockedBundles } from '../../utils/bundle_soft_delete.ts'
import { BRES, quickError, simpleError } from '../../utils/hono.ts'
import { beginWriteTransaction, checkoutPgClient, closeClient, getPgClient, logPgError, releasePgClient } from '../../utils/pg.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

interface GetLatest {
  app_id: string
  version?: string
  page?: number
}

async function getLinkedChannelVersionIds(c: Context<MiddlewareKeyVariables>, apikey: Database['public']['Tables']['apikeys']['Row'], appId: string) {
  const { data, error } = await supabaseApikey(c, apikey.key)
    .from('channels')
    .select('version, rollout_version')
    .eq('app_id', appId)

  if (error)
    throw simpleError('cannot_check_linked_channels', 'Cannot check linked channels', { supabaseError: error })

  return new Set((data ?? []).flatMap(channel => [channel.version, channel.rollout_version]).filter((id): id is number => typeof id === 'number'))
}

/** True when the caller opted into the 2026-10-22 delete contract. Invalid headers keep the default. */
function wantsDistinctDeleteErrors(c: Context<MiddlewareKeyVariables>) {
  try {
    return resolveCapgoApiVersion(c).atLeast(CAPGO_API_2026_10_22)
  }
  catch {
    return false
  }
}

type DeleteByNameOutcome
  = | { status: 'deleted', id: number }
    | { status: 'not_found' }
    | { status: 'linked', id: number, channels: string[] }

/**
 * capgo_api >= 2026-10-22: one request resolves the name, reports a missing bundle (404
 * bundle_not_found) or a linked one (409 bundle_linked with its id and channels, so a client
 * can offer to unlink without another lookup), and soft-deletes. Lookup, link check and delete
 * run in one transaction holding the bundle lifecycle lock (see bundle_soft_delete.ts), so a concurrent promotion or unlink cannot make the answer
 * stale. Authorization is the bundle.delete check in deleteBundle.
 */
async function deleteBundleByName(c: Context<MiddlewareKeyVariables>, appId: string, name: string, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const effectiveApikey = apikey.key ?? c.get('capgkey')
  if (!effectiveApikey)
    throw simpleError('cannot_delete_bundle', 'You can\'t access this app', { app_id: appId })

  const pgClient = await getPgClient(c)
  let dbClient: Awaited<ReturnType<typeof checkoutPgClient>> | null = null
  let transactionStarted = false
  let outcome: DeleteByNameOutcome
  try {
    dbClient = await checkoutPgClient(pgClient)
    await beginWriteTransaction(dbClient)
    transactionStarted = true
    outcome = await deleteBundleByNameInTransaction(dbClient, effectiveApikey, appId, name)
    await dbClient.query('COMMIT')
  }
  catch (error) {
    if (dbClient && transactionStarted) {
      try {
        await dbClient.query('ROLLBACK')
      }
      catch {
        // Preserve the original error when rollback itself fails.
      }
    }
    if (error instanceof HTTPException)
      throw error
    logPgError(c, 'delete_bundle_by_name', error)
    throw simpleError('cannot_delete_version', 'Cannot delete version', { error: (error as Error)?.message })
  }
  finally {
    releasePgClient(pgClient, dbClient)
    await closeClient(c, pgClient)
  }

  if (outcome.status === 'not_found')
    quickError(404, 'bundle_not_found', 'Bundle not found', { app_id: appId, version: name })
  if (outcome.status === 'linked')
    quickError(409, 'bundle_linked', 'Cannot delete a bundle linked to a channel', { app_id: appId, version: name, bundle_id: outcome.id, channels: outcome.channels })
  return c.json({ ...BRES, id: outcome.id, name })
}

async function deleteBundleByNameInTransaction(
  dbClient: Awaited<ReturnType<typeof checkoutPgClient>>,
  effectiveApikey: string,
  appId: string,
  name: string,
): Promise<DeleteByNameOutcome> {
  const found = await dbClient.query<{ id: string | number }>(
    `SELECT id FROM public.app_versions
     WHERE app_id = $1 AND name = $2 AND deleted = false
     ORDER BY id DESC
     LIMIT 1`,
    [appId, name],
  )
  if (!found.rows.length)
    return { status: 'not_found' }
  const id = Number(found.rows[0].id)

  await lockBundleLifecycles(dbClient, [id])
  // Re-read under the lock: it may have been deleted while we waited.
  const live = await dbClient.query('SELECT 1 FROM public.app_versions WHERE id = $1 AND deleted = false', [id])
  if (!live.rows.length)
    return { status: 'not_found' }

  const channels = await dbClient.query<{ name: string }>(
    `SELECT name FROM public.channels
     WHERE app_id = $1 AND (version = $2 OR rollout_version = $2)
     ORDER BY name`,
    [appId, id],
  )
  if (channels.rows.length)
    return { status: 'linked', id, channels: channels.rows.map(row => row.name) }

  await softDeleteLockedBundles(dbClient, effectiveApikey, appId, [id], false)
  return { status: 'deleted', id }
}

export async function deleteBundle(c: Context<MiddlewareKeyVariables>, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing app_id', { body })
  }
  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }
  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'bundle.delete', { appId: body.app_id }))) {
    throw simpleError('cannot_delete_bundle', 'You can\'t access this app', { app_id: body.app_id })
  }

  if (body.version && wantsDistinctDeleteErrors(c))
    return deleteBundleByName(c, body.app_id, body.version, apikey)

  if (body.version) {
    const supabase = supabaseApikey(c, apikey.key)
    const { data: version, error: versionError } = await supabase
      .from('app_versions')
      .select('id, name')
      .eq('app_id', body.app_id)
      .eq('name', body.version)
      .eq('deleted', false)
      .single()
    if (versionError || !version)
      throw simpleError('cannot_delete_version', 'Cannot delete version', { supabaseError: versionError })

    const linkedVersionIds = await getLinkedChannelVersionIds(c, apikey, body.app_id)
    if (linkedVersionIds.has(version.id))
      throw simpleError('cannot_delete_linked_version', 'Cannot delete a bundle linked to a channel', { app_id: body.app_id, version: body.version })

    const { data, error: dbError } = await supabase
      .from('app_versions')
      .update({
        deleted: true,
      })
      .eq('id', version.id)
      .select()
      .single()
    if (dbError || !data) {
      throw simpleError('cannot_delete_version', 'Cannot delete version', { supabaseError: dbError })
    }
  }
  else {
    const linkedVersionIds = await getLinkedChannelVersionIds(c, apikey, body.app_id)
    let query = supabaseApikey(c, apikey.key)
      .from('app_versions')
      .update({
        deleted: true,
      })
      .eq('app_id', body.app_id)

    if (linkedVersionIds.size > 0)
      query = query.not('id', 'in', `(${[...linkedVersionIds].join(',')})`)

    const { error: dbError } = await query
    if (dbError) {
      throw simpleError('cannot_delete_all_version', 'Cannot delete all version', { supabaseError: dbError })
    }
  }

  return c.json(BRES)
}
