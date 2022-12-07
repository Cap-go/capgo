import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { checkAppOwner, supabaseAdmin, updateOrCreateChannel } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, fetchLimit, sendRes } from '../_utils/utils.ts'

interface ChannelSet {
  app_id: string
  channel: string
  version?: string
  public?: boolean
}
interface GetDevice {
  app_id: string
  channel?: string
  page?: number
}

export const get = async (event: Request, apikey: definitions['apikeys']): Promise<Response> => {
  const body = (await event.json()) as GetDevice
  if (!body.app_id || !(await checkAppOwner(apikey.user_id, body.app_id))) {
    console.error('You can\'t access this app', body.app_id)
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }
  // get one channel or all channels
  if (body.channel) {
    const { data: dataChannel, error: dbError } = await supabaseAdmin()
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
        is_emulator,
        is_prod,
        version (
          name,
          id
        )
      `)
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
    if (dbError || !dataChannel || !dataChannel.length) {
      console.log('Cannot find channel')
      return sendRes({ status: 'Cannot find channel', error: dbError }, 400)
    }
    return sendRes(dataChannel[0])
  }
  else {
    const fetchOffset = body.page === undefined ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const { data: dataChannels, error: dbError } = await supabaseAdmin()
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
      return sendRes([])
    return sendRes(dataChannels)
  }
}

export const deleteChannel = async (event: Request, apikey: definitions['apikeys']): Promise<Response> => {
  const body = (await event.json()) as ChannelSet

  if (!(await checkAppOwner(apikey.user_id, body.app_id))) {
    console.error('You can\'t access this app', body.app_id)
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }
  try {
    const { error: dbError } = await supabaseAdmin()
      .from('channels')
      .delete()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
    if (dbError) {
      console.log('Cannot delete channel')
      return sendRes({ status: 'Cannot delete channel', error: JSON.stringify(dbError) }, 400)
    }
  }
  catch (e) {
    console.log('Cannot delete channel', e)
    return sendRes({ status: 'Cannot delete channels', error: e }, 500)
  }
  return sendRes()
}

export const post = async (event: Request, apikey: definitions['apikeys']): Promise<Response> => {
  const body = (await event.json()) as ChannelSet

  const channel: Partial<definitions['channels']> = {
    created_by: apikey.user_id,
    app_id: body.app_id,
    name: body.channel,
  }
  if (body.version) {
    const { data, error: vError } = await supabaseAdmin()
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version)
      .eq('user_id', apikey.user_id)
      .eq('deleted', false)
      .single()
    if (vError || !data) {
      console.log(`Cannot find version ${body.version}`)
      return sendRes({ status: `Cannot find version ${body.version}`, error: JSON.stringify(vError) }, 400)
    }
    channel.version = data.id
  }
  if (Object.prototype.hasOwnProperty.call(body, 'public'))
    channel.public = body.public

  try {
    const { error: dbError } = await updateOrCreateChannel(channel)
    if (dbError) {
      console.log('Cannot create channel')
      return sendRes({ status: 'Cannot create channel', error: JSON.stringify(dbError) }, 400)
    }
  }
  catch (e) {
    console.log('Cannot create channel', e)
    return sendRes({ status: 'Cannot set channels', error: e }, 500)
  }
  return sendRes()
}

serve(async (event: Request) => {
  const apikey_string = event.headers.get('authorization')
  const api_mode_string = event.headers.get('api_mode')

  if (!apikey_string) {
    console.log('Missing apikey')
    return sendRes({ status: 'Missing apikey' }, 400)
  }
  const apikey: definitions['apikeys'] | null = await checkKey(apikey_string, supabaseAdmin(), ['all', 'write'])
  if (!apikey) {
    console.log('Missing apikey')
    return sendRes({ status: 'Missing apikey' }, 400)
  }

  if (api_mode_string === 'POST' || (!api_mode_string && event.method === 'POST'))
    return post(event, apikey)
  else if (api_mode_string === 'GET' || (!api_mode_string && event.method === 'GET'))
    return get(event, apikey)
  else if (api_mode_string === 'DELETE' || (!api_mode_string && event.method === 'DELETE'))
    return deleteChannel(event, apikey)
  console.log('Method not allowed')
  return sendRes({ status: 'Method now allowed' }, 400)
})
