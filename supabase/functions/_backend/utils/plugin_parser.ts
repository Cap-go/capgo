import type { Context } from 'hono'
import type { ZodSchema } from 'zod'
import { format, tryParse } from '@std/semver'
import { cloudlogErr } from '../utils/loggin.ts'
import { fixSemver } from '../utils/utils.ts'
import { simpleError } from "./hono.ts";
import { AppInfos } from './types.ts'

export interface DeviceLink extends AppInfos {
  channel?: string
}

export function parsePluginBody(c: Context, body: DeviceLink, schema: ZodSchema) {
  const invalidCode = c.req.method === 'GET' || c.req.method === 'DELETE' ? 'invalid_query_parameters' : 'invalid_json_body'
  if (Object.keys(body ?? {}).length === 0) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot parse body', body })
    throw simpleError(400, invalidCode, 'Cannot parse body')
  }
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
    defaultChannel,
    custom_id,
    is_emulator = false,
    is_prod = true,
    version_os,
  } = body
  if (!device_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find device_id', device_id, app_id, body })
    throw simpleError(400, 'missing_device_id', 'Cannot find device_id')
  }
  if (!app_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find app_id', device_id, app_id, body })
    throw simpleError(400, 'missing_app_id', 'Cannot find app_id')
  }
  const coerce = tryParse(fixSemver(version_build))
  if (!coerce) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', version_build })
    throw simpleError(400, 'semver_error', `Native version: ${version_build} doesn't follow semver convention, please check https://capgo.app/semver_tester/ to learn more about semver usage in Capgo`)
  }
  version_build = format(coerce)
  version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
  const parseResult = schema.safeParse({
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
  })
  if (!parseResult.success) {
    cloudlogErr({ requestId: c.get('requestId'), message: `${c.req.method} ${c.req.path}`, error: parseResult.error })
    throw simpleError(400, invalidCode, 'Cannot parse body')
  }
  return {
    version_name,
    version_build,
    platform,
    app_id,
    device_id,
    plugin_version,
    defaultChannel,
    channel,
    custom_id,
    is_emulator,
    is_prod,
    version_os,
  }
}


export function convertQueryToBody(query: Record<string, string>): DeviceLink {
  if (!Object.keys(query).length) {
    return {} as DeviceLink
  }
  // Ensure the values are set for old plugins
  query.is_emulator ??= 'false'
  query.is_prod ??=  'true'
  const body = {
    version_name: query.version_name,
    version_build: query.version_build,
    platform: query.platform,
    app_id: query.app_id,
    device_id: query.device_id,
    plugin_version: query.plugin_version,
    defaultChannel: query.defaultChannel,
    channel: query.channel,
    custom_id: query.custom_id,
    is_emulator: query.is_emulator === 'true' ,
    is_prod: query.is_prod === 'true',
    version_os: query.version_os,
  }
  return body
}
