import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

export interface ChannelSet {
  app_id: string
  channel: string
  version?: string
  public?: boolean
  disableAutoUpdateUnderNative?: boolean
  disableAutoUpdate?: Database['public']['Enums']['disable_update']
  ios?: boolean
  android?: boolean
  allow_device_self_set?: boolean
  allow_emulator?: boolean
  allow_dev?: boolean
}

export async function deleteChannel(c: Context, body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'admin', apikey.key))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }
  if (!body.channel) {
    throw simpleError('missing_channel_name', 'You must provide a channel name')
  }

  // search if that exist first
  const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
    .from('channels')
    .select('id')
    .eq('app_id', body.app_id)
    .eq('name', body.channel)
    .single()
  if (dbError || !dataChannel) {
    throw simpleError('cannot_find_channel', 'Cannot find channel', { supabaseError: dbError })
  }
  await supabaseAdmin(c)
    .from('channels')
    .delete()
    .eq('app_id', body.app_id)
    .eq('name', body.channel)
  return c.json(BRES)
}
