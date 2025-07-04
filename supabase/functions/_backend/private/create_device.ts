import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { middlewareV2, quickError, simpleError, useCors } from '../utils/hono.ts'
import { createStatsDevices } from '../utils/stats.ts'
import { supabaseAdmin as useSupabaseAdmin } from '../utils/supabase.ts'

const bodySchema = z.object({
  device_id: z.string().uuid(),
  app_id: z.string(),
  platform: z.enum(['ios', 'android']),
  version: z.number(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!

  const body = await c.req.json<any>()
    .catch((e) => {
      throw simpleError('invalid_json_parse_body', 'Invalid JSON body', { e })
    })
  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid JSON body', { body, parsedBodyResult })
  }

  const safeBody = parsedBodyResult.data

  const supabaseAdmin = useSupabaseAdmin(c)

  const { data: appData, error: appError } = await supabaseAdmin.from('apps')
    .select('owner_org')
    .eq('app_id', safeBody.app_id)
    .single()

  if (appError) {
    throw quickError(404, 'app_not_found', 'App not found', { app_id: safeBody.app_id })
  }

  const userId = auth.userId

  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'write',
    org_id: appData.owner_org,
    user_id: userId,
    channel_id: null as any,
    app_id: safeBody.app_id,
  })

  if (userRight.error) {
    throw simpleError('internal_auth_error', 'Cannot get user right', { userRight })
  }

  if (!userRight.data) {
    throw quickError(401, 'not_authorized', 'Not authorized', { userId, appId: safeBody.app_id })
  }

  await createStatsDevices(c, safeBody.app_id, safeBody.device_id, safeBody.version, safeBody.platform, '0.0.0', '0.0.0', '0.0.0', '', true, false)

  return c.body(null, 204) // No content
})
