import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { EMPTY_UUID, hasAppRight, supabaseAdmin } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { BRES, getBody, middlewareKey } from '../utils/hono.ts'
import { readDevices } from '../utils/stats.ts'
import { fetchLimit } from '../utils/utils.ts'

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
    const { updated_at, device_id, custom_id, is_prod, is_emulator, version, app_id, platform, plugin_version, os_version, version_build } = device
    return { updated_at, device_id, custom_id, is_prod, is_emulator, version, app_id, platform, plugin_version, os_version, version_build }
  })
}

async function get(c: Context, body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id || !(await hasAppRight(c, body.app_id, apikey.user_id, 'read')))
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  // start is 30 days ago
  const rangeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  // end is now
  const rangeEnd = (new Date()).toISOString()

  console.log('rangeStart', rangeStart)
  console.log('rangeEnd', rangeEnd)
  // if device_id get one device
  if (body.device_id) {
    const res = await readDevices(c, body.app_id, 0, 1, undefined, [body.device_id])
    console.log('res', res)

    if (!res || !res.length)
      return c.json({ status: 'Cannot find device' }, 400)
    const dataDevice = filterDeviceKeys(res as any)[0]
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
    const fetchOffset = body.page == null ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const res = await readDevices(c, body.app_id, from, to, undefined)

    if (!res)
      return c.json([])
    const dataDevices = filterDeviceKeys(res as any)
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
  if (!body.device_id || !body.app_id) {
    console.log('Missing device_id or app_id')
    return c.json({ status: 'Missing device_id or app_id' }, 400)
  }

  if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'write'))) {
    console.log('You can\'t access this app', body.app_id)
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }

  if (!body.channel && body.version_id) {
    console.log('Cannot set version without channel')
    return c.json({ status: 'Cannot set version without channel' }, 400)
  }

  // if version_id set device_override to it
  if (body.version_id) {
    const { data: dataVersion, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version_id)
      .single()
    if (dbError || !dataVersion) {
      console.log('Cannot find version', dbError)
      return c.json({ status: 'Cannot find version', error: dbError }, 400)
    }

    const { data: mainChannel } = await supabaseAdmin(c)
      .from('channels')
      .select()
      .eq('app_id', body.app_id)
      .eq('public', true)
      .single()
    if (mainChannel?.version === dataVersion.id) {
      console.log('Cannot set version already in a public channel')
      return c.json({ status: 'Cannot set version already in a public channel' }, 400)
    }
    const { error: dbErrorDev } = await supabaseAdmin(c)
      .from('devices_override')
      .upsert({
        device_id: body.device_id,
        version: dataVersion.id,
        app_id: body.app_id,
        owner_org: EMPTY_UUID,
      })
    if (dbErrorDev) {
      console.log('Cannot save device override', dbErrorDev)
      return c.json({ status: 'Cannot save device override', error: dbErrorDev }, 400)
    }
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
    if (dbError || !dataChannel) {
      console.log('Cannot find channel', dbError)
      return c.json({ status: 'Cannot find channel', error: dbError }, 400)
    }

    if (dataChannel.public) {
      console.log('Cannot set channel override for public channel')
      // if channel is public, we don't set channel_override
      return c.json({ status: 'Cannot set channel override for public channel' }, 400)
    }
    const { error: dbErrorDev } = await supabaseAdmin(c)
      .from('channel_devices')
      .upsert({
        device_id: body.device_id,
        channel_id: dataChannel.id,
        app_id: body.app_id,
        owner_org: EMPTY_UUID,
      })
    if (dbErrorDev) {
      console.log('Cannot save channel override', dbErrorDev)
      return c.json({ status: 'Cannot save channel override', error: dbErrorDev }, 400)
    }
  }
  return c.json(BRES)
}

export async function deleteOverride(c: Context, body: DeviceLink, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'write')))
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

app.post('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await c.req.json<DeviceLink>()
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return post(c, body, apikey)
  }
  catch (e) {
    console.log('Cannot post devices', e)
    return c.json({ status: 'Cannot post devices', error: JSON.stringify(e) }, 500)
  }
})

app.get('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<DeviceLink>(c)
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return get(c, body, apikey)
  }
  catch (e) {
    console.log('Cannot get devices', e)
    return c.json({ status: 'Cannot get devices', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<DeviceLink>(c)
    const apikey = c.get('apikey')
    console.log('body', body)
    console.log('apikey', apikey)
    return deleteOverride(c, body, apikey)
  }
  catch (e) {
    console.log('Cannot delete devices', e)
    return c.json({ status: 'Cannot delete devices', error: JSON.stringify(e) }, 500)
  }
})
