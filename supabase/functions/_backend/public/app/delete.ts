import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { cloudlogErr } from '../../utils/loggin.ts'

export async function deleteApp(c: Context, appId: string, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!appId) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete app Missing app_id' })
    return c.json({ status: 'Missing app_id' }, 400)
  }

  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'write', apikey.key))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete app, You can\'t access this app', app_id: appId })
    return c.json({ status: 'You can\'t access this app', app_id: appId }, 400)
  }

  try {
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
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete app', error: dbError })
      return c.json({ status: 'Cannot delete app', error: JSON.stringify(dbError) }, 400)
    }

    return c.json(BRES)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete app', error: e })
    return c.json({ status: 'Cannot delete app', error: JSON.stringify(e) }, 500)
  }
}
