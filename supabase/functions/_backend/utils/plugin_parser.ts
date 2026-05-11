import type { Context } from 'hono'
import type { StandardSchema } from './ark_validation.ts'
import type { Database } from './supabase.types.ts'
import type { AppInfos, AppStats, DeviceWithoutCreatedAt } from './types.ts'
import { format, tryParse } from '@std/semver'
import { fixSemver } from '../utils/utils.ts'
import { safeParseSchema } from './ark_validation.ts'
import { simpleError } from './hono.ts'

const PLUGIN_BODY_FIELDS = [
  'app_id',
  'channel',
  'custom_id',
  'defaultChannel',
  'device_id',
  'is_emulator',
  'is_prod',
  'key_id',
  'platform',
  'plugin_version',
  'version_build',
  'version_name',
  'version_os',
] as const

export interface DeviceLink extends AppInfos {
  channel?: string
}

function normalizeCustomId(customId: unknown): string | undefined {
  if (typeof customId !== 'string')
    return undefined
  const trimmed = customId.trim()
  return trimmed === '' ? undefined : trimmed
}

function getInvalidCode(c: Context) {
  return c.req.method === 'GET' || c.req.method === 'DELETE' ? 'invalid_query_parameters' : 'invalid_json_body'
}

export function getPluginBodyMetadata(body: unknown) {
  if (!body || typeof body !== 'object') {
    return {
      fieldCount: 0,
      hasBody: false,
      presentFields: [],
      unknownFieldCount: 0,
    }
  }

  const keys = Object.keys(body)
  const knownFields = new Set<string>(PLUGIN_BODY_FIELDS)
  return {
    fieldCount: keys.length,
    hasBody: true,
    presentFields: PLUGIN_BODY_FIELDS.filter(field => keys.includes(field)),
    unknownFieldCount: keys.filter(key => !knownFields.has(key)).length,
  }
}

export function getPluginParseFailureMetadata(parseResult: ReturnType<typeof safeParseSchema>) {
  if (parseResult.success) {
    return {
      success: true,
    }
  }

  return {
    success: false,
    issueCount: parseResult.error.issues.length,
    issues: parseResult.error.issues.slice(0, 5).map(issue => ({
      code: issue.code,
    })),
  }
}

export function makeDevice(devBody: AppInfos | DeviceLink | AppStats, allowCustomID = true): DeviceWithoutCreatedAt {
  const normalizedCustomId = normalizeCustomId(devBody.custom_id)
  const customId = allowCustomID ? normalizedCustomId : undefined
  const device = {
    platform: devBody.platform as Database['public']['Enums']['platform_os'],
    device_id: devBody.device_id,
    app_id: devBody.app_id,
    plugin_version: devBody.plugin_version,
    version_build: devBody.version_build,
    os_version: devBody.version_os,
    version_name: devBody.version_name,
    is_emulator: devBody.is_emulator ?? false,
    is_prod: devBody.is_prod ?? true,
    custom_id: customId,
    updated_at: new Date().toISOString(),
    default_channel: devBody.defaultChannel ?? null,
    key_id: devBody.key_id ?? null,
  } as DeviceWithoutCreatedAt
  return device
}

export function parsePluginBody<T extends AppInfos | DeviceLink | AppStats>(c: Context, body: T, schema: StandardSchema<T>, requireDevice = true) {
  if (Object.keys(body ?? {}).length === 0) {
    throw simpleError(getInvalidCode(c), 'Cannot parse body', { body: getPluginBodyMetadata(body) })
  }
  if (requireDevice && !body.device_id) {
    throw simpleError('missing_device_id', 'Cannot find device_id', { body: getPluginBodyMetadata(body) })
  }
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Cannot find app_id', { body: getPluginBodyMetadata(body) })
  }
  // Only validate version_build if it's provided (not required for GET /channel_self)
  if (body.version_build) {
    const coerce = tryParse(fixSemver(body.version_build))
    if (!coerce) {
      throw simpleError('semver_error', 'Native version doesn\'t follow semver convention, please check https://capgo.app/semver_tester/ to learn more about semver usage in Capgo', { body: getPluginBodyMetadata(body) })
    }
    body.version_build = format(coerce)
  }
  // For plugin below 5.0.0, we need to set the default values of is_emulator and is_prod
  body.is_emulator ??= false
  body.is_prod ??= true
  if (body.version_name) {
    body.version_name = (body.version_name === 'builtin' || !body.version_name) ? body.version_build : body.version_name
  }
  const parseResult = safeParseSchema(schema, body)
  if (!parseResult.success) {
    throw simpleError(getInvalidCode(c), 'Cannot parse body', { parseResult: getPluginParseFailureMetadata(parseResult) })
  }
  return parseResult.data
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
    key_id: query.key_id,
  }
  return body
}
