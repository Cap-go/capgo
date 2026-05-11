import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { AppInfos } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { BRES, parseBody, simpleRateLimit } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { parsePluginBody } from '../utils/plugin_parser.ts'
import { summarizePluginRequestForLog } from '../utils/plugin_request_log.ts'
import { updateRequestSchema } from '../utils/plugin_validation.ts'
import { update } from '../utils/update.ts'

import {
  isLimited,
} from '../utils/utils.ts'

// Plugin endpoints are intentionally public device endpoints: their responses are
// considered public data, so we do not require Capgo JWT/API-key auth or add
// checks beyond Supabase/platform protections. Endpoint-specific validation, plan
// checks, and rate limits still apply.
export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', async (c) => {
  const body = await parseBody<AppInfos>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post updates request', request: summarizePluginRequestForLog(body) })
  if (isLimited(c, body.app_id)) {
    return simpleRateLimit(body)
  }
  return update(c, parsePluginBody<AppInfos>(c, body, updateRequestSchema))
})

app.get('/', (c) => {
  return c.json(BRES)
})
