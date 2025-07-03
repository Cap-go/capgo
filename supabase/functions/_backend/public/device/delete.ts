import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

export interface DeviceLink {
  app_id: string
  device_id: string
  channel?: string
}

export async function deleteOverride(c: Context, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
  }

  const { error: errorChannel } = await supabaseAdmin(c)
    .from('channel_devices')
    .delete()
    .eq('app_id', body.app_id)
    .eq('device_id', body.device_id.toLowerCase())
  if (errorChannel) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
  }
  return c.json(BRES)
}
