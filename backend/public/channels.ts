import { Hono } from 'https://deno.land/x/hono/mod.ts'
import type { Context } from 'https://deno.land/x/hono/mod.ts'
import { checkAppOwner, supabaseAdmin, updateOrCreateChannel } from '../_utils/supabase.ts'
import { fetchLimit } from '../_utils/utils.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { BRES, middlewareKey } from '../_utils/hono.ts'

interface ChannelSet {
  app_id: string
  channel: string
  version?: string
  public?: boolean
  disableAutoUpdateUnderNative?: boolean
  disableAutoUpdateToMajor?: boolean
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

export async function get(body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row'], c: Context): Promise<Response> {
  if (!body.app_id || !(await checkAppOwner(apikey.user_id, body.app_id, c)))
    return c.send({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

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
        disableAutoUpdateUnderNative,
        disableAutoUpdateToMajor,
        allow_device_self_set,
        is_emulator,
        is_prod,
        version (
          name,
          id
        )
      `)
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel)
      return c.send({ status: 'Cannot find version', error: JSON.stringify(dbError) }, 400)

    return c.send(dataChannel)
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
        disableAutoUpdateUnderNative,
        disableAutoUpdateToMajor,
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
    if (dbError || !dataChannels || !dataChannels.length)
      return c.send([])
    return c.send(dataChannels)
  }
}

export async function deleteChannel(body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row'], c: Context): Promise<Response> {
  if (!(await checkAppOwner(apikey.user_id, body.app_id, c)))
    return c.send({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  try {
    const { error: dbError } = await supabaseAdmin(c)
      .from('channels')
      .delete()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
    if (dbError)
      return c.send({ status: 'Cannot delete channels', error: JSON.stringify(dbError) }, 400)
  }
  catch (e) {
    return c.send({ status: 'Cannot delete channels', error: JSON.stringify(e) }, 500)
  }
  return c.send(BRES)
}

export async function post(body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row'], c: Context): Promise<Response> {
  const channel: Database['public']['Tables']['channels']['Insert'] = {
    created_by: apikey.user_id,
    app_id: body.app_id,
    name: body.channel,
    ...(body.public == null ? {} : { public: body.public }),
    ...(body.disableAutoUpdateUnderNative == null ? {} : { disableAutoUpdateUnderNative: body.disableAutoUpdateUnderNative }),
    ...(body.disableAutoUpdateToMajor == null ? {} : { disableAutoUpdateToMajor: body.disableAutoUpdateToMajor }),
    ...(body.allow_device_self_set == null ? {} : { allow_device_self_set: body.allow_device_self_set }),
    ...(body.allow_emulator == null ? {} : { allow_emulator: body.allow_emulator }),
    ...(body.allow_dev == null ? {} : { allow_dev: body.allow_dev }),
    ...(body.ios == null ? {} : { ios: body.ios }),
    ...(body.android == null ? {} : { android: body.android }),
    version: -1,
  }
  if (body.version) {
    const { data, error: vError } = await supabaseAdmin(c)
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version)
      .eq('user_id', apikey.user_id)
      .eq('deleted', false)
      .single()
    if (vError || !data)
      return c.send({ status: 'Cannot find version', error: JSON.stringify(vError) }, 400)

    channel.version = data.id
  }
  try {
    const { error: dbError } = await updateOrCreateChannel(channel, c)
    if (dbError)
      return c.send({ status: 'Cannot create channel', error: JSON.stringify(dbError) }, 400)
  }
  catch (e) {
    return c.send({ status: 'Cannot create channel', error: JSON.stringify(e) }, 500)
  }
  return c.send(BRES)
}
export const app = new Hono()

app.post('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<ChannelSet>()
    const apikey = c.get('apikey')
    return post(body, apikey, c)
  } catch (e) {
    return c.send({ status: 'Cannot create channel', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<ChannelSet>()
    const apikey = c.get('apikey')
    return get(body, apikey, c)
  } catch (e) {
    return c.send({ status: 'Cannot get channel', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<ChannelSet>()
    const apikey = c.get('apikey')
    return deleteChannel(body, apikey, c)
  } catch (e) {
    return c.send({ status: 'Cannot delete channel', error: JSON.stringify(e) }, 500)
  }
})
