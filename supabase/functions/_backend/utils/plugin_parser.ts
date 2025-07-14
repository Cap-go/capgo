import type { Context } from 'hono'
import type { ZodMiniObject } from 'zod/v4-mini'
import type { AppInfos, AppStats } from './types.ts'
import { format, tryParse } from '@std/semver'
import { fixSemver } from '../utils/utils.ts'
import { simpleError } from './hono.ts'

export interface DeviceLink extends AppInfos {
  channel?: string
}

function getInvalidCode(c: Context) {
  return c.req.method === 'GET' || c.req.method === 'DELETE' ? 'invalid_query_parameters' : 'invalid_json_body'
}

export function parsePluginBody<T extends AppInfos | DeviceLink | AppStats>(c: Context, body: T, schema: ZodMiniObject) {
  if (Object.keys(body ?? {}).length === 0) {
    throw simpleError(getInvalidCode(c), 'Cannot parse body', { body })
  }
  if (!body.device_id) {
    throw simpleError('missing_device_id', 'Cannot find device_id', { body })
  }
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Cannot find app_id', { body })
  }
  const coerce = tryParse(fixSemver(body.version_build))
  if (!coerce) {
    throw simpleError('semver_error', `Native version: ${body.version_build} doesn't follow semver convention, please check https://capgo.app/semver_tester/ to learn more about semver usage in Capgo`, { version_build: body.version_build })
  }
  body.version_build = format(coerce)
  // For plugin below 5.0.0, we need to set the default values of is_emulator and is_prod
  body.is_emulator ??= false
  body.is_prod ??= true
  body.version_name = (body.version_name === 'builtin' || !body.version_name) ? body.version_build : body.version_name
  const parseResult = schema.safeParse(body)
  if (!parseResult.success) {
    throw simpleError(getInvalidCode(c), 'Cannot parse body', { parseResult })
  }
  return body
}

export function convertQueryToBody(query: Record<string, string>): DeviceLink {
  if (!Object.keys(query).length) {
    return {} as DeviceLink
  }
  // For plugin below 5.0.0, we need to set the default values of is_emulator and is_prod
  query.is_emulator ??= 'false'
  query.is_prod ??= 'true'
  // Ensure the device_id is lowercase for compatibility with old plugins below 7.0.0
  query.device_id = query.device_id?.toLowerCase()
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
    is_emulator: query.is_emulator === 'true',
    is_prod: query.is_prod === 'true',
    version_os: query.version_os,
  }
  return body
}
