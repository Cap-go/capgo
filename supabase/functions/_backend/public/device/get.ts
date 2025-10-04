import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/loggin.ts'
import { readDevices } from '../../utils/stats.ts'
import { hasAppRightApikey, supabaseApikey } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

interface GetDevice {
  app_id: string
  device_id?: string
  customIdMode?: boolean
  page?: number
}

interface publicDevice {
  updated_at: string
  device_id: string
  custom_id: string
  is_prod: boolean
  is_emulator: boolean
  version_name: string | null
  app_id: string
  platform: Database['public']['Enums']['platform_os']
  plugin_version: string
  os_version: string
  version_build: string
  version?: number
  channel?: string
}

export function filterDeviceKeys(devices: Database['public']['Tables']['devices']['Row'][]) {
  return devices.map((device) => {
    const { updated_at, device_id, custom_id, is_prod, is_emulator, version_name, app_id, platform, plugin_version, os_version, version_build } = device
    return { updated_at, device_id, custom_id, is_prod, is_emulator, version_name, app_id, platform, plugin_version, os_version, version_build }
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
    const res = await readDevices(c, {
      app_id: body.app_id,
      rangeStart: 0,
      rangeEnd: 1,
      deviceIds: [body.device_id.toLowerCase()],
    }, body.customIdMode ?? false)
    cloudlog({ requestId: c.get('requestId'), message: 'res', res })

    if (!res?.length) {
      throw quickError(404, 'device_not_found', 'Cannot find device', { device_id: body.device_id })
    }
    const dataDevice = filterDeviceKeys(res)[0] as publicDevice
    if (dataDevice.version_name && !res[0].version) {
      const { data: dataVersion, error: dbErrorVersion } = await supabaseApikey(c, apikey.key)
        .from('app_versions')
        .select('id, name')
        .eq('app_id', body.app_id)
        .eq('name', dataDevice.version_name)
        .maybeSingle()
      if (!dbErrorVersion && dataVersion)
        dataDevice.version = dataVersion.id
    }

    // Check for channel override
    const { data: channelOverride } = await supabaseApikey(c, apikey.key)
      .from('channel_devices')
      .select(`
        channel_id,
        channels (
          name
        )
      `)
      .eq('device_id', body.device_id.toLowerCase())
      .eq('app_id', body.app_id)
      .single()

    if (channelOverride?.channels) {
      dataDevice.channel = channelOverride.channels.name
    }

    return c.json(dataDevice)
  }
  else {
    const fetchOffset = body.page ?? 0
    const rangeStart = fetchOffset * fetchLimit
    const rangeEnd = (fetchOffset + 1) * fetchLimit - 1
    const res = await readDevices(c, {
      app_id: body.app_id,
      rangeStart,
      rangeEnd,
    }, body.customIdMode ?? false)

    if (!res) {
      throw quickError(404, 'devices_not_found', 'Cannot get devices')
    }
    const dataDevices = filterDeviceKeys(res) as publicDevice[]
    // get versions from all devices
    const versionNames = [...new Set(dataDevices.map(device => device.version_name).filter(Boolean).filter(v => v !== null && v !== undefined))]
    const versionIds = [...new Set(dataDevices.map(device => device.version).filter(Boolean).filter(v => v !== null && v !== undefined))] as number[]
    let versionMap: Record<string, { id: number, name: string }> = {}
    if (versionNames.length) {
      const { data: dataVersions } = await supabaseApikey(c, apikey.key)
        .from('app_versions')
        .select('id, name')
        .eq('app_id', body.app_id)
        .in('name', versionNames)
      if (dataVersions?.length) {
        versionMap = dataVersions.reduce((acc, version) => {
          acc[version.name] = version as any
          return acc
        }, {} as Record<string, { id: number, name: string }>)
      }
    }
    const missingVersionIds = versionIds.filter(id => !Object.values(versionMap).some(v => v.id === id))
    if (missingVersionIds.length) {
      const { data: dataVersions } = await supabaseApikey(c, apikey.key)
        .from('app_versions')
        .select('id, name')
        .eq('app_id', body.app_id)
        .in('id', missingVersionIds)
      if (dataVersions?.length) {
        versionMap = dataVersions.reduce((acc, version) => {
          acc[version.name] = version as any
          return acc
        }, versionMap)
      }
    }
    dataDevices.forEach((device) => {
      const versionName = device.version_name
      const version = versionName ? versionMap[versionName] : undefined
      if (version)
        device.version = version.id
    })

    // Get channel overrides for all devices
    const deviceIds = dataDevices.map(device => device.device_id.toLowerCase())
    const { data: channelOverrides } = await supabaseApikey(c, apikey.key)
      .from('channel_devices')
      .select(`
        device_id,
        channel_id,
        channels (
          name
        )
      `)
      .in('device_id', deviceIds)
      .eq('app_id', body.app_id)

    // Add channel override to each device that has one
    if (channelOverrides?.length) {
      dataDevices.forEach((device) => {
        const override = channelOverrides.find(o => o.device_id === device.device_id.toLowerCase())
        if (override?.channels) {
          (device as any).channel = override.channels.name
        }
      })
    }

    return c.json(dataDevices)
  }
}
