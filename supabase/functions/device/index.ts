import { serve } from 'https://deno.land/std@0.207.0/http/server.ts'
import { checkAppOwner, getSDevice, supabaseAdmin } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import type { BaseHeaders } from '../_utils/types.ts'
import { checkKey, fetchLimit, methodJson, sendRes } from '../_utils/utils.ts'
import { redisDeviceInvalidate } from '../_utils/redis.ts'

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

function filterDeviceKeys(devices: Database['public']['Tables']['devices']['Row'][]) {
  return devices.map((device) => {
    const { created_at, updated_at, device_id, custom_id, is_prod, is_emulator, version, app_id, platform, plugin_version, os_version, version_build } = device
    return { created_at, updated_at, device_id, custom_id, is_prod, is_emulator, version, app_id, platform, plugin_version, os_version, version_build }
  })
}

async function get(body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id || !(await checkAppOwner(apikey.user_id, body.app_id)))
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  // if device_id get one device
  if (body.device_id) {
    const res = await getSDevice('', body.app_id, undefined, [body.device_id])
    if (!res || !res.data || !res.data.length)
      return sendRes({ status: 'Cannot find device' }, 400)
    const dataDevice = filterDeviceKeys(res.data)[0]
    // get version from device
    const { data: dataVersion, error: dbErrorVersion } = await supabaseAdmin()
      .from('app_versions')
      .select('id, name')
      .eq('id', dataDevice.version)
      .single()
    if (dbErrorVersion || !dataVersion)
      return sendRes({ status: 'Cannot find version', error: dbErrorVersion }, 400)
    dataDevice.version = dataVersion as any
    return sendRes(dataDevice)
  }
  else {
    // get all devices
    const fetchOffset = body.page == null ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const res = await getSDevice('', body.app_id, undefined, undefined, undefined, undefined, from, to)
    if (!res || !res.data)
      return sendRes([])
    const dataDevices = filterDeviceKeys(res.data)
    // get versions from all devices
    const versionIds = dataDevices.map(device => device.version)
    const { data: dataVersions, error: dbErrorVersions } = await supabaseAdmin()
      .from('app_versions')
      .select('id, name')
      .in('id', versionIds)
    // replace version with object from app_versions table
    if (dbErrorVersions || !dataVersions || !dataVersions.length)
      return sendRes([])
    dataDevices.forEach((device) => {
      const version = dataVersions.find(version => version.id === device.version)
      if (version)
        device.version = version as any
    })
    return sendRes(dataDevices)
  }
}

async function post(body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.device_id || !body.app_id)
    return sendRes({ status: 'Cannot find device' }, 400)

  if (!(await checkAppOwner(apikey.user_id, body.app_id)))
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  // find device
  const res = await getSDevice('', body.app_id, undefined, [body.device_id])
  if (!res || !res.data || !res.data.length)
    return sendRes({ status: 'Cannot find device' }, 400)

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
  await redisDeviceInvalidate(body.app_id, body.device_id)
  return sendRes()
}

export async function deleteOverride(body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
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
  await redisDeviceInvalidate(body.app_id, body.device_id)
  return sendRes()
}

async function main(url: URL, headers: BaseHeaders, method: string, body: any) {
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
