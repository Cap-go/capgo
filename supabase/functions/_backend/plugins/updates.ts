import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { AppInfos } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { BRES, parseBody, simpleRateLimit } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { getManifestDownloadSize, parseManifestSizeVersionId } from '../utils/manifest_size.ts'
import { parsePluginBody } from '../utils/plugin_parser.ts'
import { updateRequestSchema } from '../utils/plugin_validation.ts'
import { update, updateV2 } from '../utils/update.ts'

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

app.post('/manifest_size', async (c) => {
  const body = await parseBody<AppInfos & {
    manifest?: unknown
    files?: unknown
    version?: string
    version_id?: unknown
  }>(c)
  const files = body.manifest ?? body.files
  cloudlog({
    requestId: c.get('requestId'),
    message: 'post updates manifest_size body',
    app_id: body.app_id,
    device_id: body.device_id,
    version: body.version,
    version_id: body.version_id,
    files_count: Array.isArray(files) ? files.length : 0,
  })
  if (isLimited(c, body.app_id))
    return simpleRateLimit({ app_id: body.app_id })

  const parsedBody = parsePluginBody<AppInfos>(c, body, updateRequestSchema)
  const size = await getManifestDownloadSize(c, parsedBody.app_id, typeof body.version === 'string' ? body.version : undefined, parseManifestSizeVersionId(body.version_id), files)
  return c.json(size)
})

app.get('/', (c) => {
  return c.json(BRES)
})

// Parallel update endpoint served purely by the Cloudflare-embedded read
// replica (per-app Durable Objects) — no Postgres on the read path. Used to
// load-balance against /updates in production until the old Cloud SQL
// replica system is decommissioned.
export const appV2 = new Hono<MiddlewareKeyVariables>()

appV2.post('/', async (c) => {
  const body = await parseBody<AppInfos>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post updates_v2 body', body })
  if (isLimited(c, body.app_id)) {
    // Pass curated metadata only — see simpleRateLimit contract in hono.ts.
    return simpleRateLimit({ app_id: body.app_id })
  }
  return updateV2(c, parsePluginBody<AppInfos>(c, body, updateRequestSchema))
})

appV2.get('/', (c) => {
  return c.json(BRES)
})
