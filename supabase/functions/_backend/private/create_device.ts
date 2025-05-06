import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod'
import { middlewareAuth, useCors } from '../utils/hono.ts'
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
  try {
    const authToken = c.req.header('authorization')

    if (!authToken)
      return c.json({ status: 'not authorize' }, 400)

    const body = await c.req.json<any>()
    const parsedBodyResult = bodySchema.safeParse(body)
    if (!parsedBodyResult.success) {
      console.log({ requestId: c.get('requestId'), message: 'post create device body', body })
      console.log({ requestId: c.get('requestId'), message: 'post create device error', error: parsedBodyResult.error })
      return c.json({ status: 'invalid_json_body' }, 400)
    }

    const safeBody = parsedBodyResult.data

    const supabaseAdmin = await useSupabaseAdmin(c as any)
    const supabaseClient = useSupabaseClient(c as any, authToken)

    const clientData = await supabaseClient.auth.getUser()
    if (!clientData || !clientData.data || clientData.error) {
      console.error({ requestId: c.get('requestId'), message: 'Cannot get supabase user', error: clientData.error })
      return c.json({ status: 'Cannot get supabase user' }, 500)
    }

    const { data: appData, error: appError } = await supabaseClient.from('apps')
      .select('owner_org')
      .eq('app_id', safeBody.app_id)
      .single()

    if (appError) {
      console.error({ requestId: c.get('requestId'), message: 'app error', error: appError })
      return c.json({ status: 'app_not_found', app_id: safeBody.app_id }, 400)
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
      console.error({ requestId: c.get('requestId'), message: 'Cannot get user right', error: userRight.error })
      return c.json({ status: 'internal_auth_error' }, 500)
    }

    if (!userRight.data) {
      console.error({ requestId: c.get('requestId'), message: 'No user right', userId, appId: safeBody.app_id })
      return c.json({ status: 'not_authorized' }, 403)
    }

    await createStatsDevices(c as any, safeBody.app_id, safeBody.device_id, safeBody.version, safeBody.platform, '0.0.0', '0.0.0', '0.0.0', '', true, false)

    return c.body(null, 204) // No content
  }
  catch (e) {
    console.error(e)
    return c.json({ status: 'internal_error' }, 500)
  }
})
