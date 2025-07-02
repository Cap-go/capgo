// channel self old function
import type { Context } from '@hono/hono'
import { format, tryParse } from '@std/semver'
import { cloudlogErr } from '../utils/loggin.ts'
import { fixSemver } from '../utils/utils.ts'
import { simpleError } from "./hono.ts";

export function parsePluginBody(c: Context, body: any) {
  let {
    version_name,
    version_build,
  } = body
  const {
    platform,
    app_id,
    device_id,
    plugin_version,
    channel,
    custom_id,
    is_emulator = false,
    is_prod = true,
    version_os,
  } = body
  const coerce = tryParse(fixSemver(version_build))
  if (!coerce) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', version_build })
    throw simpleError(400, 'semver_error', `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`)
  }
  version_build = format(coerce)
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
  if (!device_id || !app_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find device_id or appi_id', device_id, app_id, body })
    throw simpleError(400, 'missing_device_id_or_app_id', 'Cannot find device_id or appi_id')
  }
  return {
    version_name,
    version_build,
    platform,
    app_id,
    device_id,
    plugin_version,
    channel,
    custom_id,
    is_emulator,
    is_prod,
    version_os,
  }
}
