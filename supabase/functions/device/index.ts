import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { checkKey, fetchLimit, sendRes } from '../_utils/utils.ts'

interface DeviceLink {
  app_id: string
  device_id: string
  version_id?: string
  channel?: string
}
interface GetDevice {
  app_id: string
  device_id?: string
  page?: number
}

const get = async (event: Request, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
  const body = await event.json() as GetDevice
  if (!body.app_id || !(await checkAppOwner(apikey.user_id, body.app_id)))
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  // if device_id get one device
  if (body.device_id) {
    const { data: dataDevice, error: dbError } = await supabaseAdmin()
      .from('devices')
      .select(`
          created_at,
          updated_at,
          device_id,
          custom_id,
          is_prod,
          is_emulator,
          version (
            name,
            id
          ),
          app_id,
          platform,
          plugin_version,
          os_version,
          version_build,
          is_emulator,
          is_prod
      `)
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
      .single()
    if (dbError || !dataDevice)
      return sendRes({ status: 'Cannot find device', error: dbError }, 400)

    return sendRes(dataDevice)
  }
  else {
    // get all devices
    const fetchOffset = body.page === undefined ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const { data: dataDevices, error: dbError } = await supabaseAdmin()
      .from('devices')
      .select(`
          created_at,
          updated_at,
          device_id,
          custom_id,
          is_prod,
          is_emulator,
          version (
            name,
            id
          ),
          app_id,
          platform,
          plugin_version,
          os_version,
          version_build,
          is_emulator,
          is_prod
      `)
      .eq('app_id', body.app_id)
      .range(from, to)
      .order('created_at', { ascending: true })
    if (dbError || !dataDevices || !dataDevices.length)
      return sendRes([])
    return sendRes(dataDevices)
  }
}

const post = async (event: Request, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
  const body = await event.json() as DeviceLink
  if (!body.device_id || !body.app_id)
    return sendRes({ status: 'Cannot find device' }, 400)

  if (!(await checkAppOwner(apikey.user_id, body.app_id)))
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  // find device
  const { data: dataDevice, error: dbError } = await supabaseAdmin()
    .from('devices')
    .select()
    .eq('app_id', body.app_id)
    .eq('device_id', body.device_id)
    .single()
  if (dbError || !dataDevice) {
    console.log('Cannot find device', body, dbError)
    return sendRes({ status: 'Cannot find device', error: dbError, payload: body }, 400)
  }
  if (!body.channel && body.version_id)
    return sendRes({ status: 'Nothing to update' }, 400)

  // if version_id set device_override to it
  if (body.version_id) {
    const { data: dataVersion, error: dbError } = await supabaseAdmin()
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version_id)
      .single()
    if (dbError || !dataVersion)
      return sendRes({ status: 'Cannot find version', error: dbError }, 400)

    const { error: dbErrorDev } = await supabaseAdmin()
      .from('devices_override')
      .upsert({
        device_id: body.device_id,
        version: dataVersion.id,
        app_id: body.app_id,
        created_by: apikey.user_id,
      })
    if (dbErrorDev)
      return sendRes({ status: 'Cannot save device override', error: dbErrorDev }, 400)
  }
  // if channel set channel_override to it
  if (body.channel) {
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabaseAdmin()
      .from('channels')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel)
      return sendRes({ status: 'Cannot find channel', error: dbError }, 400)

    const { error: dbErrorDev } = await supabaseAdmin()
      .from('channel_devices')
      .upsert({
        device_id: body.device_id,
        channel_id: dataChannel.id,
        app_id: body.app_id,
        created_by: apikey.user_id,
      })
    if (dbErrorDev)
      return sendRes({ status: 'Cannot save channel override', error: dbErrorDev }, 400)
  }
  return sendRes()
}

export const deleteOverride = async (event: Request, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
  const body = (await event.json()) as DeviceLink

  if (!(await checkAppOwner(apikey.user_id, body.app_id)))
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  try {
    const { error } = await supabaseAdmin()
      .from('devices_override')
      .delete()
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
    if (error)
      return sendRes({ status: 'Cannot delete override', error: JSON.stringify(error) }, 400)

    const { error: errorChannel } = await supabaseAdmin()
      .from('channel_devices')
      .delete()
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
    if (errorChannel)
      return sendRes({ status: 'Cannot delete override', error: JSON.stringify(error) }, 400)
  }
  catch (e) {
    console.log('Cannot delete override', e)
    return sendRes({ status: 'Cannot delete override', error: e }, 500)
  }
  return sendRes()
}

serve(async (event: Request) => {
  const apikey_string = event.headers.get('authorization')

  if (!apikey_string)
    return sendRes({ status: 'Missing apikey' }, 400)

  try {
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(), ['all', 'write'])
    if (!apikey)
      return sendRes({ status: 'Missing apikey' }, 400)

    if (event.method === 'POST')
      return post(event, apikey)
    else if (event.method === 'GET')
      return get(event, apikey)
    else if (event.method === 'DELETE')
      return deleteOverride(event, apikey)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
  return sendRes({ status: 'Method now allowed' }, 400)
})
