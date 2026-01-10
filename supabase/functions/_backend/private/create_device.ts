import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { createStatsDevices } from '../utils/stats.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'

const bodySchema = z.object({
  device_id: z.uuid(),
  app_id: z.string(),
  org_id: z.string(),
  platform: z.enum(['ios', 'android']),
  version_name: z.string(),
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
  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    return simpleError('invalid_json_body', 'Invalid JSON body', { body, parsedBodyResult })
  }

  const safeBody = parsedBodyResult.data

  // Use authenticated client for data queries - RLS will enforce access
  const supabase = supabaseWithAuth(c, auth)

  const userId = auth.userId

  const userRight = await supabase.rpc('check_min_rights', {
    min_right: 'write',
    user_id: userId,
    channel_id: null as unknown as number,
    app_id: safeBody.app_id,
    org_id: safeBody.org_id,
  })

  if (userRight.error) {
    return simpleError('internal_auth_error', 'Cannot get user right', { userRight })
  }

  if (!userRight.data) {
    return quickError(401, 'not_authorized', 'Not authorized', { userId, appId: safeBody.app_id })
  }

  const { error: appError } = await supabase.from('apps')
    .select('owner_org')
    .eq('app_id', safeBody.app_id)
    .single()

  if (appError) {
    return quickError(404, 'app_not_found', 'App not found', { app_id: safeBody.app_id })
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

  return c.body(null, 204) // No content
})
