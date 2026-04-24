import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { AppInfos } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { BRES, parseBody, simpleRateLimit } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { parsePluginBody } from '../utils/plugin_parser.ts'
import { updateRequestSchema } from '../utils/plugin_validation.ts'
import { update } from '../utils/update.ts'

import {
  isLimited,
} from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', async (c) => {
  const body = await parseBody<AppInfos>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post updates body', body })
  if (isLimited(c, body.app_id)) {
    return simpleRateLimit(body)
  }
  return update(c, parsePluginBody<AppInfos>(c, body, updateRequestSchema))
})

app.get('/', (c) => {
  return c.json(BRES)
})
