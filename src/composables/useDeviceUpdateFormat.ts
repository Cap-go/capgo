import type { Database } from '~/types/supabase.types'

type DeviceRow = Database['public']['Tables']['devices']['Row']

/**
 * Interface matching the update endpoint expected request format
 * Based on AppInfos from supabase/functions/_backend/utils/types.ts
 */
export interface UpdateEndpointRequest {
  version_name: string
  version_build: string
  version_os: string
  custom_id?: string
  is_prod?: boolean
  is_emulator?: boolean
  plugin_version: string
  platform: string
  app_id: string
  device_id: string
  defaultChannel: string
  channel?: string
}

/**
 * Transform device data to the format expected by the update endpoint
 */
export function useDeviceUpdateFormat() {
  function transformDeviceToUpdateRequest(
    device: DeviceRow,
    appId: string,
    defaultChannel: string = 'production',
    channelOverrideName?: string | null,
  ): UpdateEndpointRequest {
    return {
      version_name: device.version_name || '',
      version_build: device.version_build || '',
      version_os: device.os_version || '',
      custom_id: device.custom_id || undefined,
      is_prod: device.is_prod ?? true,
      is_emulator: device.is_emulator ?? false,
      plugin_version: device.plugin_version || '2.3.3',
      platform: device.platform || 'ios',
      app_id: appId,
      device_id: device.device_id || '',
      defaultChannel,
      ...(channelOverrideName ? { channel: channelOverrideName } : {}),
    }
  }

  function copyUpdateRequestToClipboard(
    device: DeviceRow,
    appId: string,
    defaultChannel: string = 'production',
    channelOverrideName?: string | null,
  ): Promise<void> {
    const request = transformDeviceToUpdateRequest(device, appId, defaultChannel, channelOverrideName)
    const jsonString = JSON.stringify(request, null, 2)
    return navigator.clipboard.writeText(jsonString)
  }

  return {
    transformDeviceToUpdateRequest,
    copyUpdateRequestToClipboard,
  }
}
