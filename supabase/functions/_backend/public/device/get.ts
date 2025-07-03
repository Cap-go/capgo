import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/loggin.ts'
import { readDevices } from '../../utils/stats.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

interface GetDevice {
  app_id: string
  device_id?: string
  page?: number
}

export function filterDeviceKeys(devices: Database['public']['Tables']['devices']['Row'][]) {
  return devices.map((device) => {
    const { updated_at, device_id, custom_id, is_prod, is_emulator, version, app_id, platform, plugin_version, os_version, version_build } = device
    return { updated_at, device_id, custom_id, is_prod, is_emulator, version, app_id, platform, plugin_version, os_version, version_build }
  })
}

export async function get(c: Context, body: GetDevice, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id || !(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'read', apikey.key))) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
  }

  // start is 30 days ago
  const rangeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  // end is now
  const rangeEnd = (new Date()).toISOString()

  cloudlog({ requestId: c.get('requestId'), message: 'rangeStart', rangeStart })
  cloudlog({ requestId: c.get('requestId'), message: 'rangeEnd', rangeEnd })
  // if device_id get one device
  if (body.device_id) {
    const res = await readDevices(c, body.app_id, 0, 1, undefined, [body.device_id.toLowerCase()])
    cloudlog({ requestId: c.get('requestId'), message: 'res', res })

    if (!res?.length) {
      throw simpleError('device_not_found', 'Cannot find device', { device_id: body.device_id })
    }
    const dataDevice = filterDeviceKeys(res as any)[0]
    // get version from device
    const { data: dataVersion, error: dbErrorVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id, name')
      .eq('id', dataDevice.version)
      .single()
    if (dbErrorVersion || !dataVersion) {
      throw simpleError('version_not_found', 'Cannot find version', { version: dataDevice.version })
    }
    dataDevice.version = dataVersion as any
    return c.json(dataDevice)
  }
  else {
    const fetchOffset = body.page ?? 0
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const res = await readDevices(c, body.app_id, from, to)

    if (!res) {
      throw simpleError('devices_not_found', 'Cannot get devices')
    }
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
    if (dbErrorVersions || !dataVersions?.length) {
      throw simpleError('versions_not_found', 'Cannot get versions', { dbErrorVersions, dataVersions })
    }
    dataDevices.forEach((device) => {
      const version = dataVersions.find((v: any) => v.id === device.version)
      if (version) {
        device.version = version as any
      }
    })
    return c.json(dataDevices)
  }
}
