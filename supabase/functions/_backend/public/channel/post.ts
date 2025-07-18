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
    ...(body.public == null ? {} : { public: body.public }),
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

  channel.version = await findVersion(c, body.app_id, body.version ?? 'unknown', org.owner_org)
  await updateOrCreateChannel(c, channel)
  return c.json(BRES)
}
