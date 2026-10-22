import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { CAPGO_API_2026_10_22, resolveCapgoApiVersion } from '../../utils/api_version.ts'
import { BRES, quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'
import { softDeleteBundles } from './cleanup.ts'

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

/**
 * capgo_api >= 2026-10-22: one request resolves the name, reports a missing bundle (404
 * bundle_not_found) or a linked one (409 bundle_linked with its id and channels, so a client
 * can offer to unlink without another lookup), and soft-deletes under the bundle lifecycle lock.
 */
async function deleteBundleByName(c: Context<MiddlewareKeyVariables>, appId: string, name: string, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const effectiveApikey = apikey.key ?? c.get('capgkey')
  if (!effectiveApikey)
    throw simpleError('cannot_delete_bundle', 'You can\'t access this app', { app_id: appId })
  const supabase = supabaseApikey(c, apikey.key)
  const { data: bundle, error: bundleError } = await supabase
    .from('app_versions')
    .select('id, name')
    .eq('app_id', appId)
    .eq('name', name)
    .eq('deleted', false)
    .maybeSingle()
  if (bundleError)
    throw simpleError('cannot_delete_version', 'Cannot delete version', { supabaseError: bundleError })
  if (!bundle)
    quickError(404, 'bundle_not_found', 'Bundle not found', { app_id: appId, version: name })

  const deleted = await softDeleteBundles(c, effectiveApikey, appId, [bundle.id], false)
  if (deleted.includes(bundle.id))
    return c.json({ ...BRES, id: bundle.id, name: bundle.name })

  // Not deleted: either a channel targets it, or it was deleted concurrently.
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('name')
    .eq('app_id', appId)
    .or(`version.eq.${bundle.id},rollout_version.eq.${bundle.id}`)
  if (channelsError)
    throw simpleError('cannot_check_linked_channels', 'Cannot check linked channels', { supabaseError: channelsError })
  if (channels?.length)
    quickError(409, 'bundle_linked', 'Cannot delete a bundle linked to a channel', { app_id: appId, version: name, bundle_id: bundle.id, channels: channels.map(channel => channel.name) })
  quickError(404, 'bundle_not_found', 'Bundle not found', { app_id: appId, version: name })
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
