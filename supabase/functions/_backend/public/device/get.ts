import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { readDevices } from '../../utils/stats.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'
import { cloudlog, cloudlogErr } from '../../utils/loggin.ts'

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
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get device', app_id: body.app_id })
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
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

    if (!res || !res.length) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find device', device_id: body.device_id })
      return c.json({ status: 'Cannot find device' }, 400)
    }
    const dataDevice = filterDeviceKeys(res as any)[0]
    // get version from device
    const { data: dataVersion, error: dbErrorVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('id, name')
      .eq('id', dataDevice.version)
      .single()
    if (dbErrorVersion || !dataVersion) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', version: dataDevice.version })
      return c.json({ status: 'Cannot find version', error: dbErrorVersion }, 400)
    }
    dataDevice.version = dataVersion as any
    return c.json(dataDevice)
  }
  else {
    const fetchOffset = body.page ?? 0
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const res = await readDevices(c, body.app_id, from, to, undefined)

    if (!res) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get devices' })
      return c.json([])
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
    if (dbErrorVersions || !dataVersions || !dataVersions.length) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get versions', error: dbErrorVersions })
      return c.json([])
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
