import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { middlewareAuth, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { createStatsDevices } from '../utils/stats.ts'
import { supabaseAdmin as useSupabaseAdmin, supabaseClient as useSupabaseClient } from '../utils/supabase.ts'

const bodySchema = z.object({
  device_id: z.string().uuid(),
  app_id: z.string(),
  platform: z.enum(['ios', 'android']),
  version: z.number(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const authToken = c.req.header('authorization')

  if (!authToken)
    throw simpleError('not_authorized', 'Not authorized')

  const body = await c.req.json<any>()
  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid JSON body', { body, parsedBodyResult })
  }

  const safeBody = parsedBodyResult.data

  const supabaseAdmin = await useSupabaseAdmin(c)
  const supabaseClient = useSupabaseClient(c, authToken)

  const clientData = await supabaseClient.auth.getUser()
  if (!clientData?.data?.user || clientData?.error) {
    throw simpleError('internal_error', 'Cannot get supabase user', { clientData })
  }

  const { data: appData, error: appError } = await supabaseClient.from('apps')
    .select('owner_org')
    .eq('app_id', safeBody.app_id)
    .single()

  if (appError) {
    throw simpleError('app_not_found', 'App not found', { app_id: safeBody.app_id })
  }

  const userId = clientData.data.user.id

  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'write',
    org_id: appData.owner_org,
    user_id: userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error) {
    throw simpleError('internal_auth_error', 'Cannot get user right', { userRight })
  }

  if (!userRight.data) {
    throw simpleError('not_authorized', 'Not authorized', { userId, appId: safeBody.app_id })
  }

  await createStatsDevices(c, safeBody.app_id, safeBody.device_id, safeBody.version, safeBody.platform, '0.0.0', '0.0.0', '0.0.0', '', true, false)

  return c.body(null, 204) // No content
})
