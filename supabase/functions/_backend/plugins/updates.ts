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

// Plugin endpoints are intentionally public device endpoints: their responses are
// considered public data, so we do not require Capgo JWT/API-key auth or add
// checks beyond Supabase/platform protections. Endpoint-specific validation, plan
// checks, and rate limits still apply.
export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', async (c) => {
  const body = await parseBody<AppInfos>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post updates body', body })
  if (isLimited(c, body.app_id)) {
    // Pass curated metadata only — see simpleRateLimit contract in hono.ts.
    // Reflecting the raw `body` would echo the client's full update payload
    // back inside the 429 response's `moreInfo`.
    return simpleRateLimit({ app_id: body.app_id })
  }
  return update(c, parsePluginBody<AppInfos>(c, body, updateRequestSchema))
})

app.get('/', (c) => {
  return c.json(BRES)
})
