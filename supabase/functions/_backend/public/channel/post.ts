import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
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

async function findVersion(c: Context, appID: string, version: string, ownerOrg: string) {
  const { data, error: vError } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id')
    .eq('app_id', appID)
    .eq('name', version)
    .eq('owner_org', ownerOrg)
    .eq('deleted', version === 'unknown')
    .single()
  if (vError || !data) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', data: { appID, version, ownerOrg, vError } })
    return Promise.reject(new Error(vError?.message ?? 'Cannot find version'))
  }
  return data.id
}

export async function post(c: Context, body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
  }
  const { data: org, error } = await supabaseAdmin(c).from('apps').select('owner_org').eq('app_id', body.app_id).single()
  if (error || !org) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
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

  try {
    // Use the existing findVersion function from main
    channel.version = await findVersion(c, body.app_id, body.version ?? 'unknown', org.owner_org)

    const rawUpdateInfo = await updateOrCreateChannel(c, channel)
    if (rawUpdateInfo.error) {
      console.log('Cannot create channel', rawUpdateInfo.error)
      return c.json({ status: 'Cannot create channel', error: JSON.stringify(rawUpdateInfo.error) }, 400)
    }

    // Handle public channel logic from HEAD
    // Get the channel ID from the created/updated channel
    const { data: channelData, error: channelError } = await supabaseAdmin(c)
      .from('channels')
      .select('id')
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()

    if (channelError || !channelData) {
      console.log('Cannot find created channel', channelError)
      return c.json({ status: 'Cannot find created channel', error: JSON.stringify(channelError) }, 400)
    }

    const channelId = channelData.id

    if (body.public) {
      if (channel.ios) {
        const { error: dbError } = await supabaseAdmin(c).from('apps').update({
          default_channel_ios: channelId,
        }).eq('app_id', body.app_id)
        if (dbError) {
          console.log('Cannot update default channel', dbError)
          return c.json({ status: 'Cannot update default channel', error: JSON.stringify(dbError) }, 400)
        }
      }
      if (channel.android) {
        const { error: dbError } = await supabaseAdmin(c).from('apps').update({
          default_channel_android: channelId,
        }).eq('app_id', body.app_id)
        if (dbError) {
          console.log('Cannot update default channel', dbError)
          return c.json({ status: 'Cannot update default channel', error: JSON.stringify(dbError) }, 400)
        }
      }
    }
    else {
      const { data: appData, error: appError } = await supabaseAdmin(c).from('apps').select('default_channel_android, default_channel_ios').eq('app_id', body.app_id).single()
      if (appError) {
        console.log('Cannot get app', appError)
        return c.json({ status: 'Cannot get app', error: JSON.stringify(appError) }, 400)
      }
      if (appData.default_channel_android === channelId) {
        const { error: dbError } = await supabaseAdmin(c).from('apps').update({
          default_channel_android: null,
        }).eq('app_id', body.app_id)
        if (dbError) {
          console.log('Cannot update default channel', dbError)
          return c.json({ status: 'Cannot update default channel', error: JSON.stringify(dbError) }, 400)
        }
      }
      if (appData.default_channel_ios === channelId) {
        const { error: dbError } = await supabaseAdmin(c).from('apps').update({
          default_channel_ios: null,
        }).eq('app_id', body.app_id)
        if (dbError) {
          console.log('Cannot update default channel', dbError)
          return c.json({ status: 'Cannot update default channel', error: JSON.stringify(dbError) }, 400)
        }
      }
    }
    return c.json(BRES)
  }
  catch (e) {
    console.log('Cannot create channel', e)
    return c.json({ status: 'Cannot create channel', error: JSON.stringify(e) }, 500)
  }
}
