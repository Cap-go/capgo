import type { AppInfos, AppStats } from './types.ts'

type PluginRequestLogBody = Partial<AppInfos & AppStats & { channel?: string }>

/**
 * Builds a metadata-only representation of plugin request bodies for logs.
 */
export function summarizePluginRequestForLog(body: PluginRequestLogBody | null | undefined) {
  return {
    app_id: body?.app_id,
    platform: body?.platform,
    plugin_version: body?.plugin_version,
    version_build: body?.version_build,
    version_name: body?.version_name,
    version_os: body?.version_os,
    is_prod: body?.is_prod,
    is_emulator: body?.is_emulator,
    has_device_id: typeof body?.device_id === 'string' && body.device_id.trim() !== '',
    has_custom_id: typeof body?.custom_id === 'string' && body.custom_id.trim() !== '',
    has_key_id: typeof body?.key_id === 'string' && body.key_id.trim() !== '',
    has_channel: typeof body?.channel === 'string' && body.channel.trim() !== '',
    has_default_channel: typeof body?.defaultChannel === 'string' && body.defaultChannel.trim() !== '',
  }
}
