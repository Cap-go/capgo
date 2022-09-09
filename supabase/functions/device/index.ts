import { serve } from 'https://deno.land/std@0.155.0/http/server.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'

interface DeviceLink {
  app_id: string
  device_id: string
  version_id?: string
  channel?: string
}
interface GetDevice {
  app_id: string
  device_id?: string
}

const get = async (event: Request, apikey: definitions['apikeys']): Promise<Response> => {
  const body = await event.json() as GetDevice
  if (!body.app_id || !(await checkAppOwner(apikey.user_id, body.app_id))) {
    console.error('You can\'t access this app', body.app_id)
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }
  // if device_id get one device
  if (body.device_id) {
    const { data: dataDevice, error: dbError } = await supabaseAdmin
      .from<definitions['devices']>('devices')
      .select()
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
      .single()
    if (dbError || !dataDevice) {
      console.log('Cannot find device')
      return sendRes({ status: 'Cannot find device', error: dbError }, 400)
    }
    return sendRes(dataDevice)
  }
  else {
    // get all devices
    const { data: dataDevices, error: dbError } = await supabaseAdmin
      .from<definitions['devices']>('devices')
      .select()
      .eq('app_id', body.app_id)
    if (dbError || !dataDevices || !dataDevices.length)
      return sendRes([])
    return sendRes(dataDevices)
  }
}

const post = async (event: Request, apikey: definitions['apikeys']): Promise<Response> => {
  const body = await event.json() as DeviceLink
  if (!body.device_id || !body.app_id) {
    console.log('Cannot find device or appi_id')
    return sendRes({ status: 'Cannot find device' }, 400)
  }
  if (!(await checkAppOwner(apikey.user_id, body.app_id))) {
    console.error('You can\'t access this app', body.app_id)
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }
  // find device
  const { data: dataDevice, error: dbError } = await supabaseAdmin
    .from<definitions['devices']>('devices')
    .select()
    .eq('app_id', body.app_id)
    .eq('device_id', body.device_id)
    .single()
  if (dbError || !dataDevice) {
    console.log('Cannot find device', dbError)
    return sendRes({ status: 'Cannot find device', error: dbError }, 400)
  }
  // if version_id set device_override to it
  if (body.version_id) {
    const { data: dataVersion, error: dbError } = await supabaseAdmin
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version_id)
      .single()
    if (dbError || !dataVersion) {
      console.log('Cannot find version', dbError)
      return sendRes({ status: 'Cannot find version', error: dbError }, 400)
    }
    const { data: dataDev, error: dbErrorDev } = await supabaseAdmin
      .from<definitions['devices_override']>('devices_override')
      .upsert({
        device_id: body.device_id,
        version: dataVersion.id,
        app_id: body.app_id,
        created_by: apikey.user_id,
      })
    if (dbErrorDev || !dataDev) {
      console.log('Cannot save device override', dbErrorDev)
      return sendRes({ status: 'Cannot save device override', error: dbErrorDev }, 400)
    }
  }
  else {
    // delete device_override
    await supabaseAdmin
      .from<definitions['devices_override']>('devices_override')
      .delete()
      .eq('device_id', body.device_id)
      .eq('app_id', body.app_id)
  }
  // if channel_id set channel_override to it
  if (body.channel) {
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabaseAdmin
      .from<definitions['channels']>('channels')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel) {
      console.log('Cannot find channel', dbError)
      return sendRes({ status: 'Cannot find channel', error: dbError }, 400)
    }
    const { data: dataChannelDev, error: dbErrorDev } = await supabaseAdmin
      .from<definitions['channel_devices']>('channel_devices')
      .upsert({
        device_id: body.device_id,
        channel_id: dataChannel.id,
        app_id: body.app_id,
        created_by: apikey.user_id,
      })
    if (dbErrorDev || !dataChannelDev) {
      console.log('Cannot find channel override', dbErrorDev)
      return sendRes({ status: 'Cannot save channel override', error: dbErrorDev }, 400)
    }
  }
  else {
    // delete channel_override
    const { error: dbErrorDel } = await supabaseAdmin
      .from<definitions['channel_devices']>('channel_devices')
      .delete()
      .eq('device_id', body.device_id)
      .eq('app_id', body.app_id)
    if (dbErrorDel) {
      console.log('Cannot delete channel override', dbErrorDel)
      return sendRes({ status: 'Cannot delete channel override', error: dbErrorDel }, 400)
    }
  }
  return sendRes()
}

export const deleteDev = async (event: Request, apikey: definitions['apikeys']): Promise<Response> => {
  const body = (await event.json()) as DeviceLink

  if (!(await checkAppOwner(apikey.user_id, body.app_id))) {
    console.error('You can\'t access this app', body.app_id)
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }
  try {
    const { error } = await supabaseAdmin
      .from<definitions['devices_override']>('devices_override')
      .delete()
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
    if (error) {
      console.log('Cannot create channel')
      return sendRes({ status: 'Cannot create channel', error: JSON.stringify(error) }, 400)
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
  const apikey: definitions['apikeys'] | null = await checkKey(apikey_string, supabaseAdmin, ['all', 'write'])
  if (!apikey) {
    console.log('Missing apikey')
    return sendRes({ status: 'Missing apikey' }, 400)
  }

  if (api_mode_string === 'POST')
    return post(event, apikey)
  else if (api_mode_string === 'GET')
    return get(event, apikey)
  else if (api_mode_string === 'DELETE')
    return deleteDev(event, apikey)
  console.log('Method not allowed')
  return sendRes({ status: 'Method now allowed' }, 400)
})
