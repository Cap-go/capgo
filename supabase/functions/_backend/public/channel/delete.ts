import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

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
  allow_device?: boolean
  allow_dev?: boolean
  allow_prod?: boolean
}

export async function deleteChannel(c: Context, body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing app_id', { body })
  }
  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'admin', apikey.key))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }
  if (!body.channel) {
    throw simpleError('missing_channel_name', 'You must provide a channel name')
  }

  // search if that exist first
  const { data: dataChannel, error: dbError } = await supabaseApikey(c, apikey.key)
    .from('channels')
    .select('id')
    .eq('app_id', body.app_id)
    .eq('name', body.channel)
    .single()
  if (dbError || !dataChannel) {
    throw simpleError('cannot_find_channel', 'Cannot find channel', { supabaseError: dbError })
  }
  await supabaseApikey(c, apikey.key)
    .from('channels')
    .delete()
    .eq('app_id', body.app_id)
    .eq('name', body.channel)
  return c.json(BRES)
}
