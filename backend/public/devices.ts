import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { checkAppOwner, getSDevice, supabaseAdmin } from '../_utils/supabase.ts'
import { fetchLimit } from '../_utils/utils.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { BRES, middlewareKey } from '../_utils/hono.ts'


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

async function get(c: Context, body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id || !(await checkAppOwner(apikey.user_id, body.app_id, c)))
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  // if device_id get one device
  if (body.device_id) {
    const res = await getSDevice(c, '', body.app_id, undefined, [body.device_id])
    if (!res || !res.data || !res.data.length)
      return c.json({ status: 'Cannot find device' }, 400)
    const dataDevice = filterDeviceKeys(res.data)[0]
    // get version from device
    const { data: dataVersion, error: dbErrorVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id, name')
      .eq('id', dataDevice.version)
      .single()
    if (dbErrorVersion || !dataVersion)
      return c.json({ status: 'Cannot find version', error: dbErrorVersion }, 400)
    dataDevice.version = dataVersion as any
    return c.json(dataDevice)
  }
  else {
    // get all devices
    const fetchOffset = body.page == null ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const res = await getSDevice(c, '', body.app_id, undefined, undefined, undefined, undefined, from, to)
    if (!res || !res.data)
      return c.json([])
    const dataDevices = filterDeviceKeys(res.data)
    // get versions from all devices
    const versionIds = dataDevices.map(device => device.version)
    const { data: dataVersions, error: dbErrorVersions } = await supabaseAdmin(c)
      .from('app_versions')
      .select(`
              id,
              name
      `)
      .in('id', versionIds)
    // replace version with object from app_versions table
    if (dbErrorVersions || !dataVersions || !dataVersions.length)
      return c.json([])
    dataDevices.forEach((device) => {
      const version = dataVersions.find((v: any) => v.id === device.version)
      if (version)
        device.version = version as any
    })
    return c.json(dataDevices)
  }
}

async function post(c: Context, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.device_id || !body.app_id)
    return c.json({ status: 'Cannot find device' }, 400)

  if (!(await checkAppOwner(apikey.user_id, body.app_id, c)))
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  // find device
  const res = await getSDevice(c, '', body.app_id, undefined, [body.device_id], c)
  if (!res || !res.data || !res.data.length)
    return c.json({ status: 'Cannot find device' }, 400)

  if (!body.channel && body.version_id)
    return c.json({ status: 'Cannot set version without channel' }, 400)

  // if version_id set device_override to it
  if (body.version_id) {
    const { data: dataVersion, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version_id)
      .single()
    if (dbError || !dataVersion)
      return c.json({ status: 'Cannot find version', error: dbError }, 400)

    const { error: dbErrorDev } = await supabaseAdmin(c)
      .from('devices_override')
      .upsert({
        device_id: body.device_id,
        version: dataVersion.id,
        app_id: body.app_id,
        created_by: apikey.user_id,
      })
    if (dbErrorDev)
      return c.json({ status: 'Cannot save device override', error: dbErrorDev }, 400)
  }
  // if channel set channel_override to it
  if (body.channel) {
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
      .from('channels')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel)
      return c.json({ status: 'Cannot find channel', error: dbError }, 400)

    const { error: dbErrorDev } = await supabaseAdmin(c)
      .from('channel_devices')
      .upsert({
        device_id: body.device_id,
        channel_id: dataChannel.id,
        app_id: body.app_id,
        created_by: apikey.user_id,
      })
    if (dbErrorDev)
      return c.json({ status: 'Cannot save channel override', error: dbErrorDev }, 400)
  }
  return c.json(BRES)
}

export async function deleteOverride(c: Context, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await checkAppOwner(apikey.user_id, body.app_id, c)))
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  try {
    const { error } = await supabaseAdmin(c)
      .from('devices_override')
      .delete()
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
    if (error)
      return c.json({ status: 'Cannot delete override', error: JSON.stringify(error) }, 400)

    const { error: errorChannel } = await supabaseAdmin(c)
      .from('channel_devices')
      .delete()
      .eq('app_id', body.app_id)
      .eq('device_id', body.device_id)
    if (errorChannel)
      return c.json({ status: 'Cannot delete channel override', error: JSON.stringify(errorChannel) }, 400)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete override', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES)
}
export const app = new Hono()

app.post('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<DeviceLink>()
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return post(body, apikey, c)
  } catch (e) {
    return c.json({ status: 'Cannot post bundle', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<DeviceLink>()
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return get(body, apikey, c)
  } catch (e) {
    return c.json({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500) 
  }
})

app.delete('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<DeviceLink>()
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return deleteOverride(body, apikey, c)
  } catch (e) {
    return c.json({ status: 'Cannot delete bundle', error: JSON.stringify(e) }, 500)
  }
})
