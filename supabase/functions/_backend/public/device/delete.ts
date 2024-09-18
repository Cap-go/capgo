import type { Context } from '@hono/hono'
import { BRES } from '../../utils/hono.ts'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import type { Database } from '../../utils/supabase.types.ts'

export interface DeviceLink {
  app_id: string
  device_id: string
  version_id?: string
  channel?: string
}

export async function deleteOverride(c: Context, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'write')))
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  try {
    const { error } = await supabaseAdmin(c)
      .from('devices_override')
      .delete()
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
    if (error)
      return c.json({ status: 'Cannot delete override', error: JSON.stringify(error) }, 400)

    const { error: errorChannel } = await supabaseAdmin(c)
      .from('channel_devices')
      .delete()
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
    if (errorChannel)
      return c.json({ status: 'Cannot delete channel override', error: JSON.stringify(errorChannel) }, 400)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete override', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES)
}
