import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

export async function deleteApp(c: Context, appId: string, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('cannot_delete_app', 'You can\'t access this app', { app_id: appId })
  }

  // Run most deletions in parallel
  await Promise.all([
    // Delete version related data
    supabaseAdmin(c)
      .from('app_versions_meta')
      .delete()
      .eq('app_id', appId),

    // Delete daily version stats
    supabaseAdmin(c)
      .from('daily_version')
      .delete()
      .eq('app_id', appId),

    // Delete version usage
    supabaseAdmin(c)
      .from('version_usage')
      .delete()
      .eq('app_id', appId),

    // Delete app related data
    // Delete channel devices
    supabaseAdmin(c)
      .from('channel_devices')
      .delete()
      .eq('app_id', appId),

    // Delete channels
    supabaseAdmin(c)
      .from('channels')
      .delete()
      .eq('app_id', appId),

    // Delete devices
    supabaseAdmin(c)
      .from('devices')
      .delete()
      .eq('app_id', appId),

    // Delete usage stats
    supabaseAdmin(c)
      .from('bandwidth_usage')
      .delete()
      .eq('app_id', appId),

    supabaseAdmin(c)
      .from('storage_usage')
      .delete()
      .eq('app_id', appId),

    supabaseAdmin(c)
      .from('device_usage')
      .delete()
      .eq('app_id', appId),

    // Delete daily metrics
    supabaseAdmin(c)
      .from('daily_mau')
      .delete()
      .eq('app_id', appId),

    supabaseAdmin(c)
      .from('daily_bandwidth')
      .delete()
      .eq('app_id', appId),

    supabaseAdmin(c)
      .from('daily_storage')
      .delete()
      .eq('app_id', appId),

    // Delete stats
    supabaseAdmin(c)
      .from('stats')
      .delete()
      .eq('app_id', appId),

    // Delete org_users with this app_id
    supabaseAdmin(c)
      .from('org_users')
      .delete()
      .eq('app_id', appId),

    supabaseAdmin(c)
      .from('deploy_history')
      .delete()
      .eq('app_id', appId),
  ])

  // Delete versions (last)
  await supabaseAdmin(c)
    .from('app_versions')
    .delete()
    .eq('app_id', appId)

  // Finally delete the app
  const { error: dbError } = await supabaseAdmin(c)
    .from('apps')
    .delete()
    .eq('app_id', appId)

  if (dbError) {
    throw simpleError('cannot_delete_app', 'Cannot delete app', { supabaseError: dbError })
  }

  return c.json(BRES)
}
