import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import type { DeviceLink } from './delete.ts'
import { BRES } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { hasAppRightApikey, supabaseAdmin, updateOrCreateChannelDevice } from '../../utils/supabase.ts'

export async function post(c: Context<MiddlewareKeyVariables, any, object>, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']) {
  if (!body.device_id || !body.app_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Missing device_id or app_id' })
    return c.json({ status: 'Missing device_id or app_id' }, 400)
  }
  body.device_id = body.device_id.toLowerCase()

  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'You can\'t access this app', app_id: body.app_id })
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }

  if ((body as any).version_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot set version to device, use channel instead' })
    return c.json({ status: 'Cannot set version to device, use channel instead' }, 400)
  }

  // if channel set channel_override to it
  if (body.channel) {
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
      .from('channels')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find channel', error: dbError })
      return c.json({ status: 'Cannot find channel', error: dbError }, 400)
    }

    if (dataChannel.public) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot set channel override for public channel' })
      // if channel is public, we don't set channel_override
      return c.json({ status: 'Cannot set channel override for public channel' }, 400)
    }
    try {
      await updateOrCreateChannelDevice(c, {
        device_id: body.device_id,
        channel_id: dataChannel.id,
        app_id: body.app_id,
        owner_org: dataChannel.owner_org,
      })
    }
    catch (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot save channel override', error })
      return c.json({ status: 'Cannot save channel override', error }, 400)
    }
  }
  return c.json(BRES)
}
