import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { AppInfos } from '../utils/types.ts'
import { canParse } from '@std/semver'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { parsePluginBody } from '../utils/plugin_parser.ts'
import { update as updateLite } from '../utils/update_lite.ts'
import {
  deviceIdRegex,
  INVALID_STRING_APP_ID,
  INVALID_STRING_DEVICE_ID,
  INVALID_STRING_PLATFORM,
  INVALID_STRING_PLUGIN_VERSION,
  isLimited,
  MISSING_STRING_APP_ID,
  MISSING_STRING_DEVICE_ID,
  MISSING_STRING_PLATFORM,
  MISSING_STRING_PLUGIN_VERSION,
  MISSING_STRING_VERSION_BUILD,
  MISSING_STRING_VERSION_NAME,
  NON_STRING_APP_ID,
  NON_STRING_DEVICE_ID,
  NON_STRING_VERSION_BUILD,
  NON_STRING_VERSION_NAME,
  reverseDomainRegex,
} from '../utils/utils.ts'

const jsonRequestSchema = z.object({
  app_id: z.string({
    required_error: MISSING_STRING_APP_ID,
    invalid_type_error: NON_STRING_APP_ID,
  }).min(1, MISSING_STRING_APP_ID),
  device_id: z.string({
    required_error: MISSING_STRING_DEVICE_ID,
    invalid_type_error: NON_STRING_DEVICE_ID,
  }).max(36).min(1, MISSING_STRING_DEVICE_ID).refine(id => deviceIdRegex.test(id), {
    message: INVALID_STRING_DEVICE_ID,
  }),
  version_name: z.string({
    required_error: MISSING_STRING_VERSION_NAME,
    invalid_type_error: NON_STRING_VERSION_NAME,
  }).min(1, MISSING_STRING_VERSION_NAME),
  version_build: z.string({
    required_error: MISSING_STRING_VERSION_BUILD,
    invalid_type_error: NON_STRING_VERSION_BUILD,
  }).min(1, MISSING_STRING_VERSION_BUILD),
  is_emulator: z.boolean().default(false),
  defaultChannel: z.optional(z.string()),
  is_prod: z.boolean().default(true),
  platform: z.string({
    required_error: MISSING_STRING_PLATFORM,
    invalid_type_error: INVALID_STRING_PLATFORM,
  }).refine(platform => ['android', 'ios'].includes(platform), {
    message: INVALID_STRING_PLATFORM,
  }),
  plugin_version: z.string({
    required_error: MISSING_STRING_PLUGIN_VERSION,
    invalid_type_error: INVALID_STRING_PLUGIN_VERSION,
  }).refine(version => canParse(version), {
    message: INVALID_STRING_PLUGIN_VERSION,
  }),
}).refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).transform((val) => {
  if (val.version_name === 'builtin')
    val.version_name = val.version_build
  return val
})

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', async (c) => {
  const body = await c.req.json<AppInfos>()
  cloudlog({ requestId: c.get('requestId'), message: 'post updates body', body })
  if (isLimited(c, body.app_id)) {
    throw simpleError('too_many_requests', 'Too many requests')
  }
  return updateLite(c, parsePluginBody<AppInfos>(c, body, jsonRequestSchema))
})

app.get('/', (c) => {
  return c.json(BRES)
})
