import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { cloudlogErr } from '../../utils/loggin.ts'

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
    cloudlogErr({ requestId: c.get('requestId'), message: 'You can\'t access this app', app_id: body.app_id })
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }
  if (!body.channel) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'You must provide a channel name' })
    return c.json({ status: 'You must provide a channel name' }, 400)
  }

  try {
    // search if that exist first
    const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
      .from('channels')
      .select('id')
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find channel', error: dbError })
      return c.json({ status: 'Cannot find channel', error: JSON.stringify(dbError) }, 400)
    }
    await supabaseAdmin(c)
      .from('channels')
      .delete()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete channels', error: e })
    return c.json({ status: 'Cannot delete channels', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES)
}
