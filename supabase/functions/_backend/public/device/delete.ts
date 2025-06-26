import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

export interface DeviceLink {
  app_id: string
  device_id: string
  channel?: string
}

export async function deleteOverride(c: Context, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete override', app_id: body.app_id })
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }

  try {
    const { error: errorChannel } = await supabaseAdmin(c)
      .from('channel_devices')
      .delete()
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id.toLowerCase())
    if (errorChannel) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete channel override', error: errorChannel })
      return c.json({ status: 'Cannot delete channel override', error: JSON.stringify(errorChannel) }, 400)
    }
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete override', error: e })
    return c.json({ status: 'Cannot delete override', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES)
}
