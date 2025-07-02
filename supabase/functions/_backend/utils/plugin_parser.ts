import type { Context } from 'hono'
import type { ZodSchema } from 'zod'
import type { AppInfos, AppStats } from './types.ts'
import { format, tryParse } from '@std/semver'
import { cloudlogErr } from '../utils/loggin.ts'
import { fixSemver } from '../utils/utils.ts'
import { simpleError } from './hono.ts'

export interface DeviceLink extends AppInfos {
  channel?: string
}

export function parsePluginBody<T extends AppInfos | DeviceLink | AppStats>(c: Context, body: T, schema: ZodSchema) {
  const invalidCode = c.req.method === 'GET' || c.req.method === 'DELETE' ? 'invalid_query_parameters' : 'invalid_json_body'
  if (Object.keys(body ?? {}).length === 0) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot parse body', body })
    throw simpleError(400, invalidCode, 'Cannot parse body')
  }
  if (!body.device_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find device_id', body })
    throw simpleError(400, 'missing_device_id', 'Cannot find device_id')
  }
  if (!body.app_id) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find app_id', body })
    throw simpleError(400, 'missing_app_id', 'Cannot find app_id')
  }
  const coerce = tryParse(fixSemver(body.version_build))
  if (!coerce) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', version_build: body.version_build })
    throw simpleError(400, 'semver_error', `Native version: ${body.version_build} doesn't follow semver convention, please check https://capgo.app/semver_tester/ to learn more about semver usage in Capgo`)
  }
  body.version_build = format(coerce)
  body.version_name = (body.version_name === 'builtin' || !body.version_name) ? body.version_build : body.version_name
  const parseResult = schema.safeParse(body)
  if (!parseResult.success) {
    cloudlogErr({ requestId: c.get('requestId'), message: `${c.req.method} ${c.req.path}`, error: parseResult.error })
    throw simpleError(400, invalidCode, 'Cannot parse body')
  }
  return body
}

export function convertQueryToBody(query: Record<string, string>): DeviceLink {
  if (!Object.keys(query).length) {
    return {} as DeviceLink
  }
  // Ensure the values are set for old plugins
  query.is_emulator ??= 'false'
  query.is_prod ??= 'true'
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
