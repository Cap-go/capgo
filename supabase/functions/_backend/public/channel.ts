import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { hasAppRight, supabaseAdmin, updateOrCreateChannel } from '../utils/supabase.ts'
import { fetchLimit } from '../utils/utils.ts'
import type { Database } from '../utils/supabase.types.ts'
import { BRES, getBody, middlewareKey } from '../utils/hono.ts'

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
interface GetDevice {
  app_id: string
  channel?: string
  page?: number
}

export async function get(c: Context, body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id || !(await hasAppRight(c, body.app_id, apikey.user_id, 'read'))) {
    console.log('You can\'t access this app', body.app_id)
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }

  // get one channel or all channels
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
        public,
        disable_auto_update_under_native,
        disable_auto_update,
        allow_device_self_set,
        allow_emulator,
        public,
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

    return c.json(dataChannel)
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
        public,
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
      return newObject
    }))
  }
}

export async function deleteChannel(c: Context, body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'admin'))) {
    console.log('You can\'t access this app', body.app_id)
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }
  if (!body.channel) {
    console.log('You must provide a channel name')
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
      console.log('Cannot find channel', dbError)
      return c.json({ status: 'Cannot find channel', error: JSON.stringify(dbError) }, 400)
    }
    await supabaseAdmin(c)
      .from('channels')
      .delete()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
  }
  catch (e) {
    console.log('Cannot delete channels', e)
    return c.json({ status: 'Cannot delete channels', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES)
}

export async function post(c: Context, body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const { data: org, error } = await supabaseAdmin(c).from('apps')
    .select('owner_org')
    .eq('app_id', body.app_id)
    .single()
  if (error || !org) {
    console.log('Cannot find app', error)
    return c.json({ status: 'Cannot find app', error: JSON.stringify(error) }, 400)
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
      console.log('Cannot find unknown version', vError)
      return c.json({ status: 'Cannot find version', error: JSON.stringify(vError) }, 400)
    }

    channel.version = data.id
  }
  else {
    // find the unknown version
    const { data: dataVersion, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id')
      .eq('app_id', body.app_id)
      .eq('owner_org', org.owner_org)
      .eq('name', 'unknown')
      .eq('deleted', true)
      .single()
    if (dbError || !dataVersion) {
      console.log('Cannot find unknown version', dbError)
      return c.json({ status: 'Cannot find version', error: JSON.stringify(dbError) }, 400)
    }

    channel.version = dataVersion.id
  }
  try {
    const { error: dbError } = await updateOrCreateChannel(c, channel)
    if (dbError) {
      console.log('Cannot create channel', dbError)
      return c.json({ status: 'Cannot create channel', error: JSON.stringify(dbError) }, 400)
    }
  }
  catch (e) {
    console.log('Cannot create channel', e)
    return c.json({ status: 'Cannot create channel', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES)
}
export const app = new Hono()

app.post('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await c.req.json<ChannelSet>()
    const apikey = c.get('apikey')
    return post(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot create channel', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<ChannelSet>(c)
    const apikey = c.get('apikey')
    return get(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot get channel', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<ChannelSet>(c)
    const apikey = c.get('apikey')
    return deleteChannel(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete channel', error: JSON.stringify(e) }, 500)
  }
})
