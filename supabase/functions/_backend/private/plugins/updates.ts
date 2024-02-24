import { Hono } from 'hono/tiny'
import type { Context } from 'hono'

import { z } from 'zod'
import { update } from '../../utils/update.ts'
import {
  INVALID_STRING_APP_ID,
  INVALID_STRING_DEVICE_ID,
  MISSING_STRING_APP_ID,
  MISSING_STRING_DEVICE_ID,
  MISSING_STRING_VERSION_BUILD,
  MISSING_STRING_VERSION_NAME,
  NON_STRING_APP_ID,
  NON_STRING_DEVICE_ID,
  NON_STRING_VERSION_BUILD,
  NON_STRING_VERSION_NAME,
  deviceIdRegex,
  isLimited,
  reverseDomainRegex,
} from '../../utils/utils.ts'
import type { AppInfos } from '../../utils/types.ts'

export const jsonRequestSchema = z.object({
  app_id: z.string({
    required_error: MISSING_STRING_APP_ID,
    invalid_type_error: NON_STRING_APP_ID,
  }),
  device_id: z.string({
    required_error: MISSING_STRING_DEVICE_ID,
    invalid_type_error: NON_STRING_DEVICE_ID,
  }).max(36),
  version_name: z.string({
    required_error: MISSING_STRING_VERSION_NAME,
    invalid_type_error: NON_STRING_VERSION_NAME,
  }),
  version_build: z.string({
    required_error: MISSING_STRING_VERSION_BUILD,
    invalid_type_error: NON_STRING_VERSION_BUILD,
  }),
  is_emulator: z.boolean().default(false),
  defaultChannel: z.optional(z.string()),
  is_prod: z.boolean().default(true),
}).refine(data => reverseDomainRegex.test(data.app_id), {
  message: INVALID_STRING_APP_ID,
}).refine(data => deviceIdRegex.test(data.device_id), {
  message: INVALID_STRING_DEVICE_ID,
}).transform((val) => {
  if (val.version_name === 'builtin')
    val.version_name = val.version_build

  return val
})

export const app = new Hono()

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<AppInfos>()
    console.log('body', body)
    if (isLimited(c, body.app_id)) {
      return c.json({
        status: 'Too many requests',
        error: 'too_many_requests',
      }, 200)
    }
    const parseResult = jsonRequestSchema.safeParse(body)
    if (!parseResult.success) {
      console.log('parseResult', body, parseResult.error)
      return c.json({
        error: `Cannot parse json: ${parseResult.error}`,
      }, 400)
    }

    return update(c, body)
  }
  catch (e) {
    return c.json({ status: 'Cannot get updates', error: JSON.stringify(e) }, 500)
  }
})
