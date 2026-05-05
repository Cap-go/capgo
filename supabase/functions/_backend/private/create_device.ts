import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { safeParseSchema } from '../utils/ark_validation.ts'
import { BRES, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { schema } from '../utils/postgres_schema.ts'
import { createStatsDevices } from '../utils/stats.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'

const bodySchema = type({
  device_id: 'string.uuid',
  app_id: 'string',
  org_id: 'string.uuid',
  platform: '"ios" | "android"',
  version_name: 'string',
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

interface CreateDeviceBody {
  device_id: string
  app_id: string
  org_id: string
  platform: string
  version_name: string
}

app.post('/', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!

  const body = await parseBody<CreateDeviceBody>(c)
  const parsedBodyResult = safeParseSchema(bodySchema, body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid JSON body', { body, parsedBodyResult })
  }

  const safeBody = parsedBodyResult.data
  const normalizedOrgId = safeBody.org_id.toLowerCase()

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseWithAuth(c, auth)

  const userId = auth.userId

  const userRight = await supabase.rpc('check_min_rights', {
    min_right: 'write',
    user_id: userId,
    channel_id: null as any,
    app_id: safeBody.app_id,
    org_id: normalizedOrgId,
  })

  if (userRight.error) {
    throw simpleError('internal_auth_error', 'Cannot get user right', { userRight })
  }

  if (!userRight.data) {
    return quickError(401, 'not_authorized', 'Not authorized', { userId, appId: safeBody.app_id })
  }

  let appOwnerOrg: string | null = null
  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)
    const appResult = await drizzleClient
      .select({ ownerOrg: schema.apps.owner_org })
      .from(schema.apps)
      .where(eq(schema.apps.app_id, safeBody.app_id))
      .limit(1)
    appOwnerOrg = appResult[0]?.ownerOrg ?? null
  }
  catch (error) {
    throw simpleError('internal_db_error', 'Cannot get app', { error, appId: safeBody.app_id })
  }
  finally {
    if (pgClient) {
      closeClient(c, pgClient)
    }
  }

  if (!appOwnerOrg) {
    return quickError(404, 'app_not_found', 'App not found', { app_id: safeBody.app_id })
  }

  if (appOwnerOrg.toLowerCase() !== normalizedOrgId) {
    return quickError(401, 'not_authorized', 'Not authorized', { userId, appId: safeBody.app_id, orgId: normalizedOrgId })
  }

  await createStatsDevices(c, {
    app_id: safeBody.app_id,
    device_id: safeBody.device_id,
    version_name: safeBody.version_name,
    platform: safeBody.platform,
    plugin_version: '0.0.0',
    os_version: '0.0.0',
    version_build: '0.0.0',
    custom_id: '',
    is_prod: true,
    is_emulator: false,
    updated_at: new Date().toISOString(),
  })

  return c.json(BRES)
})
