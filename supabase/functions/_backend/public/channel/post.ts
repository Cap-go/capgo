import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { isInternalVersionName, isValidAppId } from '../../utils/utils.ts'

interface ChannelSet {
  app_id: string
  channel: string
  version?: string
  public?: boolean
  disableAutoUpdateUnderNative?: boolean
  disableAutoUpdate?: Database['public']['Enums']['disable_update']
  ios?: boolean
  android?: boolean
  electron?: boolean
  allow_device_self_set?: boolean
  allow_emulator?: boolean
  allow_device?: boolean
  allow_dev?: boolean
  allow_prod?: boolean
}

async function findVersion(c: Context, appID: string, version: string, ownerOrg: string, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const { data, error: vError } = await supabaseApikey(c, apikey.key)
    .from('app_versions')
    .select('id')
    .eq('app_id', appID)
    .eq('name', version)
    .eq('owner_org', ownerOrg)
    .eq('deleted', false)
    .single()
  if (vError || !data) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', data: { appID, version, ownerOrg, vError } })
    return Promise.reject(new Error(vError?.message ?? 'Cannot find version'))
  }
  return data.id
}

export async function post(c: Context<MiddlewareKeyVariables>, body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing app_id', { body })
  }
  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }
  const apiClient = supabaseApikey(c, apikey.key)
  const { data: existingChannel } = await apiClient
    .from('channels')
    .select('*')
    .eq('app_id', body.app_id)
    .eq('name', body.channel)
    .maybeSingle()

  if (existingChannel) {
    const canUpdateChannel = await checkPermission(c, 'channel.update_settings', { appId: body.app_id, channelId: existingChannel.id })
    if (!canUpdateChannel)
      throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id, channel: body.channel })
  }
  else if (!(await checkPermission(c, 'app.create_channel', { appId: body.app_id }))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }

  const { data: org, error } = await apiClient.from('apps').select('owner_org').eq('app_id', body.app_id).single()
  if (error || !org) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
  }

  const nextVersion = body.version && !isInternalVersionName(body.version)
    ? await findVersion(c, body.app_id, body.version, org.owner_org, apikey)
    : null

  if (existingChannel) {
    if (nextVersion !== existingChannel.version && !(await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id, channelId: existingChannel.id })))
      throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id, channel: body.channel })
  }
  else if (nextVersion !== null && !(await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id }))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id, channel: body.channel })
  }

  const inferredElectron = body.electron ?? (body.public && body.ios !== body.android ? false : undefined)
  const channel: Database['public']['Tables']['channels']['Insert'] = {
    created_by: apikey.user_id,
    app_id: body.app_id,
    name: body.channel,
    ...(body.public == null ? {} : { public: body.public }),
    ...(body.disableAutoUpdateUnderNative == null ? {} : { disable_auto_update_under_native: body.disableAutoUpdateUnderNative }),
    ...(body.disableAutoUpdate == null ? {} : { disable_auto_update: body.disableAutoUpdate }),
    ...(body.allow_device_self_set == null ? {} : { allow_device_self_set: body.allow_device_self_set }),
    ...(body.allow_emulator == null ? {} : { allow_emulator: body.allow_emulator }),
    ...(body.allow_device == null ? {} : { allow_device: body.allow_device }),
    ...(body.allow_dev == null ? {} : { allow_dev: body.allow_dev }),
    ...(body.allow_prod == null ? {} : { allow_prod: body.allow_prod }),
    ...(body.ios == null ? {} : { ios: body.ios }),
    ...(body.android == null ? {} : { android: body.android }),
    ...(inferredElectron == null ? {} : { electron: inferredElectron }),
    version: nextVersion,
    owner_org: org.owner_org,
  }

  const upsertPayload = {
    ...channel,
    created_by: existingChannel?.created_by ?? channel.created_by,
  }
  if (existingChannel) {
    const fieldsDiffer = Object.keys(upsertPayload).some(key =>
      (upsertPayload as any)[key] !== (existingChannel as any)[key] && key !== 'created_at' && key !== 'updated_at',
    )
    if (!fieldsDiffer)
      return c.json(BRES)
  }

  await apiClient
    .from('channels')
    .upsert(upsertPayload, { onConflict: 'app_id, name' })
    .throwOnError()

  return c.json(BRES)
}
