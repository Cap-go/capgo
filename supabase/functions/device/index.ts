import { serve } from 'https://deno.land/std@0.179.0/http/server.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { checkKey, fetchLimit, methodJson, sendRes } from '../_utils/utils.ts'

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

const get = async (body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
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
    const fetchOffset = body.page == null ? 0 : body.page
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

const post = async (body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
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
  if (dbError || !dataDevice)
    return sendRes({ status: 'Cannot find device', error: dbError, payload: body }, 400)

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

export const deleteOverride = async (body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
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
    return sendRes({ status: 'Cannot delete override', error: JSON.stringify(e) }, 500)
  }
  return sendRes()
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  const apikey_string = headers.authorization

  if (!apikey_string)
    return sendRes({ status: 'Missing apikey' }, 400)

  try {
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(), ['all', 'write'])
    if (!apikey)
      return sendRes({ status: 'Missing apikey' }, 400)

    if (method === 'POST')
      return post(body, apikey)
    else if (method === 'GET')
      return get(body, apikey)
    else if (method === 'DELETE')
      return deleteOverride(body, apikey)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
  return sendRes({ status: 'Method now allowed' }, 400)
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
