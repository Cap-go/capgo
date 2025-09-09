import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseApikey } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

interface GetDevice {
  app_id: string
  channel?: string
  page?: number
}

async function getAll(c: Context, body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row'], dataApp: { default_channel_android: number | null, default_channel_ios: number | null }) {
  const fetchOffset = body.page ?? 0
  const from = fetchOffset * fetchLimit
  const to = (fetchOffset + 1) * fetchLimit - 1
  const { data: dataChannels, error: dbError } = await supabaseApikey(c, apikey.key)
    .from('channels')
    .select(`
      id,
      created_at,
      name,
      app_id,
      created_by,
      updated_at,
      disable_auto_update_under_native,
      disable_auto_update,
      allow_device_self_set,
      allow_emulator,
      allow_dev,
      version (
        name,
        id
      )
  `)
    .eq('app_id', body.app_id)
    .range(from, to)
    .order('created_at', { ascending: true })
  if (dbError || !dataChannels) {
    throw simpleError('cannot_find_channels', 'Cannot find channels', { supabaseError: dbError })
  }
  return c.json(dataChannels.map((o) => {
    const { disable_auto_update_under_native, disable_auto_update, ...rest } = o
    return {
      ...rest,
      disableAutoUpdateUnderNative: disable_auto_update_under_native,
      disableAutoUpdate: disable_auto_update,
      public: o.id === dataApp.default_channel_android || o.id === dataApp.default_channel_ios,
    }
  }))
}

async function getOne(c: Context, body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row'], dataApp: { default_channel_android: number | null, default_channel_ios: number | null }) {
  const { data: dataChannel, error: dbError } = await supabaseApikey(c, apikey.key)
    .from('channels')
    .select(`
    id,
    created_at,
    name,
    app_id,
    created_by,
    updated_at,
    disable_auto_update_under_native,
    disable_auto_update,
    allow_device_self_set,
    allow_emulator,
    allow_dev,
    version (
      name,
      id
    )
  `)
    .eq('app_id', body.app_id)
    .eq('name', body.channel!)
    .single()
  if (dbError || !dataChannel) {
    throw simpleError('cannot_find_version', 'Cannot find version', { supabaseError: dbError })
  }

  const { disable_auto_update_under_native, disable_auto_update, ...rest } = dataChannel
  const newObject = {
    ...rest,
    disableAutoUpdateUnderNative: disable_auto_update_under_native,
    disableAutoUpdate: disable_auto_update,
    public: dataChannel.id === dataApp.default_channel_android || dataChannel.id === dataApp.default_channel_ios,
  }

  return c.json(newObject)
}

export async function get(c: Context, body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id || !(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'read', apikey.key))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }

  const { data: dataApp, error: dbError } = await supabaseAdmin(c)
    .from('apps')
    .select('default_channel_android, default_channel_ios')
    .eq('app_id', body.app_id)
    .single()
  if (dbError || !dataApp) {
    console.log('Cannot find app', dbError)
    return c.json({ status: 'Cannot find app', error: JSON.stringify(dbError) }, 400)
  }

  // get one channel or all channels
  if (body.channel) {
    return getOne(c, body, apikey, dataApp)
  }
  return getAll(c, body, apikey, dataApp)
}
