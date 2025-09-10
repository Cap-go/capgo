import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseApikey } from '../../utils/supabase.ts'

interface UpdateApp {
  name?: string
  icon?: string
  retention?: number
  // Accept names (string) or null
  default_channel_ios?: string | null
  default_channel_android?: string | null
  default_channel_sync?: boolean
  default_upload_channel?: string
}

export async function put(c: Context, appId: string, body: UpdateApp, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'write', apikey.key))) {
    throw quickError(401, 'cannot_access_app', 'You can\'t access this app', { app_id: appId })
  }

  // Translate channel names to ids when provided as strings
  let defaultChannelIosId: number | null | undefined = undefined
  let defaultChannelAndroidId: number | null | undefined = undefined

  if (body.default_channel_ios !== undefined) {
    if (body.default_channel_ios === null) {
      defaultChannelIosId = null
    }
    else if (typeof body.default_channel_ios === 'string') {
      const { data: ch, error } = await supabaseApikey(c, apikey.key)
        .from('channels')
        .select('id, ios')
        .eq('app_id', appId)
        .eq('name', body.default_channel_ios)
        .single()
      if (error || !ch)
        throw simpleError('channel_not_found', 'Cannot find iOS default channel by name for this app', { app_id: appId, name: body.default_channel_ios })
      if (ch.ios !== true)
        throw simpleError('invalid_default_channel_ios', 'Cannot assign iOS default to a channel that does not support iOS', { app_id: appId, name: body.default_channel_ios })
      defaultChannelIosId = ch.id as unknown as number
    }
    else {
      throw simpleError('invalid_channel_param', 'default_channel_ios must be a string (channel name) or null')
    }
  }

  if (body.default_channel_android !== undefined) {
    if (body.default_channel_android === null) {
      defaultChannelAndroidId = null
    }
    else if (typeof body.default_channel_android === 'string') {
      const { data: ch, error } = await supabaseApikey(c, apikey.key)
        .from('channels')
        .select('id, android')
        .eq('app_id', appId)
        .eq('name', body.default_channel_android)
        .single()
      if (error || !ch)
        throw simpleError('channel_not_found', 'Cannot find Android default channel by name for this app', { app_id: appId, name: body.default_channel_android })
      if (ch.android !== true)
        throw simpleError('invalid_default_channel_android', 'Cannot assign Android default to a channel that does not support Android', { app_id: appId, name: body.default_channel_android })
      defaultChannelAndroidId = ch.id as unknown as number
    }
    else {
      throw simpleError('invalid_channel_param', 'default_channel_android must be a string (channel name) or null')
    }
  }

  const updatePayload: Database['public']['Tables']['apps']['Update'] = {
    ...(body.name == null ? {} : { name: body.name }),
    ...(body.icon == null ? {} : { icon_url: body.icon }),
    ...(body.retention == null ? {} : { retention: body.retention }),
    ...(defaultChannelIosId === undefined ? {} : { default_channel_ios: defaultChannelIosId as any }),
    ...(defaultChannelAndroidId === undefined ? {} : { default_channel_android: defaultChannelAndroidId as any }),
    ...(body.default_channel_sync == null ? {} : { default_channel_sync: body.default_channel_sync }),
    ...(body.default_upload_channel == null ? {} : { default_upload_channel: body.default_upload_channel }),
  }

  const { data, error: dbError } = await supabaseApikey(c, apikey.key)
    .from('apps')
    .update(updatePayload)
    .eq('app_id', appId)
    .select()
    .single()

  if (dbError || !data) {
    throw simpleError('cannot_update_app', 'Cannot update app', { supabaseError: dbError })
  }

  return c.json(data)
}
