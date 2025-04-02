import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

interface GetDevice {
  app_id: string
  channel?: string
  page?: number
}

export async function get(c: Context, body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id || !(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'read', apikey.key))) {
    console.log('You can\'t access this app', body.app_id)
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
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

  const defaultChannelIds = [(dataApp as any).default_channel_android, (dataApp as any).default_channel_ios].filter(Boolean);

  if (body.channel) {
    const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
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
        version (
          name,
          id
        )
      `)
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel) {
      console.log('Cannot find version', dbError)
      return c.json({ status: 'Cannot find version', error: JSON.stringify(dbError) }, 400)
    }

    const newObject = dataChannel as any
    delete Object.assign(newObject, { disableAutoUpdateUnderNative: dataChannel.disable_auto_update_under_native }).disable_auto_update_under_native
    delete Object.assign(newObject, { disableAutoUpdate: dataChannel.disable_auto_update }).disable_auto_update
    
    newObject.public = defaultChannelIds.includes(dataChannel.id);
    
    return c.json(newObject)
  }
  else {
    const fetchOffset = body.page == null ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    
    const { data: dataChannels, error: dbError } = await supabaseAdmin(c)
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
      console.log('Cannot find channels', dbError)
      return c.json({ status: 'Cannot find channels', error: JSON.stringify(dbError) }, 400)
    }
    
    return c.json(dataChannels.map((o) => {
      const newObject = o as any
      delete Object.assign(newObject, { disableAutoUpdateUnderNative: o.disable_auto_update_under_native }).disable_auto_update_under_native
      delete Object.assign(newObject, { disableAutoUpdate: o.disable_auto_update }).disable_auto_update
      
      newObject.public = defaultChannelIds.includes(o.id);
      
      return newObject
    }))
  }
}
