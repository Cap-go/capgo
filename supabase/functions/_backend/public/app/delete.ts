import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { hasAppRightApikey, supabaseAdmin, supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

export async function deleteApp(c: Context, appId: string, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!appId) {
    throw simpleError('missing_app_id', 'Missing app_id')
  }
  if (!isValidAppId(appId)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: appId })
  }
  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('cannot_delete_app', 'You can\'t access this app', { app_id: appId })
  }

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseApikey(c, apikey.key)

  // Get the app's owner_org for image cleanup
  const { data: app } = await supabase
    .from('apps')
    .select('owner_org')
    .eq('app_id', appId)
    .single()

  // Delete app icon from storage before deleting the app
  // App icons are stored at: images/org/{org_id}/{app_id}/icon
  // Note: Storage operations need admin access
  if (app?.owner_org) {
    try {
      const { data: files } = await supabaseAdmin(c)
        .storage
        .from('images')
        .list(`org/${app.owner_org}/${appId}`)

      if (files && files.length > 0) {
        const filePaths = files.map(file => `org/${app.owner_org}/${appId}/${file.name}`)
        await supabaseAdmin(c)
          .storage
          .from('images')
          .remove(filePaths)
        cloudlog({ requestId: c.get('requestId'), message: 'deleted app images', count: files.length, app_id: appId })
      }
    }
    catch (error) {
      cloudlog({ requestId: c.get('requestId'), message: 'error deleting app images', error, app_id: appId })
    }
  }

  // Admin client for internal stats tables that have restrictive RLS policies
  const admin = supabaseAdmin(c)

  // Run most deletions in parallel with error tracking
  const operationNames = [
    'app_versions_meta',
    'daily_version',
    'version_usage',
    'channel_devices',
    'channels',
    'devices',
    'bandwidth_usage',
    'storage_usage',
    'device_usage',
    'daily_mau',
    'daily_bandwidth',
    'daily_storage',
    'stats',
    'org_users',
    'deploy_history',
  ]

  const results = await Promise.allSettled([
    // Delete version related data (user-facing, has RLS)
    supabase
      .from('app_versions_meta')
      .delete()
      .eq('app_id', appId),

    // Delete daily version stats (internal, needs admin - only has SELECT RLS)
    admin
      .from('daily_version')
      .delete()
      .eq('app_id', appId),

    // Delete version usage (internal, needs admin)
    admin
      .from('version_usage')
      .delete()
      .eq('app_id', appId),

    // Delete app related data
    // Delete channel devices (user-facing, has RLS)
    supabase
      .from('channel_devices')
      .delete()
      .eq('app_id', appId),

    // Delete channels (user-facing, has RLS)
    supabase
      .from('channels')
      .delete()
      .eq('app_id', appId),

    // Delete devices (user-facing, has RLS)
    supabase
      .from('devices')
      .delete()
      .eq('app_id', appId),

    // Delete usage stats (internal, needs admin - has "Disable for all" policy)
    admin
      .from('bandwidth_usage')
      .delete()
      .eq('app_id', appId),

    admin
      .from('storage_usage')
      .delete()
      .eq('app_id', appId),

    admin
      .from('device_usage')
      .delete()
      .eq('app_id', appId),

    // Delete daily metrics (internal, needs admin)
    admin
      .from('daily_mau')
      .delete()
      .eq('app_id', appId),

    admin
      .from('daily_bandwidth')
      .delete()
      .eq('app_id', appId),

    admin
      .from('daily_storage')
      .delete()
      .eq('app_id', appId),

    // Delete stats (internal, needs admin)
    admin
      .from('stats')
      .delete()
      .eq('app_id', appId),

    // Delete org_users with this app_id (user-facing, has RLS)
    supabase
      .from('org_users')
      .delete()
      .eq('app_id', appId),

    // Delete deploy_history (has "Deny delete" policy, needs admin)
    admin
      .from('deploy_history')
      .delete()
      .eq('app_id', appId),
  ])

  // Check for failures (both rejected promises and Supabase errors)
  const failures = results
    .map((result, i) => {
      if (result.status === 'rejected') {
        return { op: operationNames[i], error: result.reason }
      }
      if (result.status === 'fulfilled' && result.value.error) {
        return { op: operationNames[i], error: result.value.error }
      }
      return null
    })
    .filter(Boolean)

  if (failures.length > 0) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Some delete operations failed', app_id: appId, failures })
  }

  // Delete versions (last) - needs admin because no DELETE policy for anon role
  await admin
    .from('app_versions')
    .delete()
    .eq('app_id', appId)

  // Finally delete the app - needs admin because no DELETE policy for anon role
  const { error: dbError } = await admin
    .from('apps')
    .delete()
    .eq('app_id', appId)

  if (dbError) {
    throw simpleError('cannot_delete_app', 'Cannot delete app', { supabaseError: dbError })
  }

  return c.json(BRES)
}
