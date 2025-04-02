import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin, updateOrCreateChannel } from '../../utils/supabase.ts'

interface ChannelSet {
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

export async function post(c: Context, body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    console.log('You can\'t access this app', body.app_id)
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }
  const { data: org, error } = await supabaseAdmin(c).from('apps').select('owner_org').eq('app_id', body.app_id).single()
  if (error || !org) {
    console.log('Cannot find app', error)
    return c.json({ status: 'Cannot find app', error: JSON.stringify(error) }, 400)
  }
  const channel: Database['public']['Tables']['channels']['Insert'] = {
    created_by: apikey.user_id,
    app_id: body.app_id,
    name: body.channel,
    ...(body.disableAutoUpdateUnderNative == null ? {} : { disable_auto_update_under_native: body.disableAutoUpdateUnderNative }),
    ...(body.disableAutoUpdate == null ? {} : { disable_auto_update: body.disableAutoUpdate }),
    ...(body.allow_device_self_set == null ? {} : { allow_device_self_set: body.allow_device_self_set }),
    ...(body.allow_emulator == null ? {} : { allow_emulator: body.allow_emulator }),
    ...(body.allow_dev == null ? {} : { allow_dev: body.allow_dev }),
    ...(body.ios == null ? {} : { ios: body.ios }),
    ...(body.android == null ? {} : { android: body.android }),
    version: -1,
    owner_org: org.owner_org,
  }

  if (body.version) {
    const { data, error: vError } = await supabaseAdmin(c)
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version)
      .eq('owner_org', org.owner_org)
      .eq('deleted', false)
      .single()
    if (vError || !data) {
      console.log('Cannot find version', body, org, vError)
      return c.json({ status: 'Cannot find version', error: JSON.stringify(vError) }, 400)
    }

    channel.version = data.id
  }
  else {
    const { data: dataVersion, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id')
      .eq('app_id', body.app_id)
      .eq('owner_org', org.owner_org)
      .eq('name', 'unknown')
      .eq('deleted', true)
      .single()
    if (dbError || !dataVersion) {
      console.log('Cannot find unknown version', body, org, dbError)
      return c.json({ status: 'Cannot find version', error: JSON.stringify(dbError) }, 400)
    }

    channel.version = dataVersion.id
  }
  try {
    const rawUpdateInfo = await updateOrCreateChannel(c, channel)
    if (rawUpdateInfo.error) {
      console.log('Cannot create channel', rawUpdateInfo.error)
      return c.json({ status: 'Cannot create channel', error: JSON.stringify(rawUpdateInfo.error) }, 400)
    }
    const channelId = rawUpdateInfo.id
    
    if (body.public) {
      const updateData: any = {};
      
      if (channel.ios) {
        updateData.default_channel_ios = channelId;
      }
      
      if (channel.android) {
        updateData.default_channel_android = channelId;
      }
      
      if (Object.keys(updateData).length > 0) {
        const { error: dbError } = await supabaseAdmin(c)
          .from('apps')
          .update(updateData)
          .eq('app_id', body.app_id);
          
        if (dbError) {
          console.log('Cannot update default channel', dbError)
          return c.json({ status: 'Cannot update default channel', error: JSON.stringify(dbError) }, 400)
        }
      }
    }
  }
  catch (e) {
    console.log('Cannot create channel', e)
    return c.json({ status: 'Cannot create channel', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES)
}
