import type { Context } from '@hono/hono'
import type { z } from '@hono/zod-openapi'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareKeyEnv } from '../../utils/hono.ts'
import { BRES, middlewareKey } from '../../utils/hono.ts'
import { errorHook } from '../../utils/open_api.ts'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import type { postRequestSchema } from './docs.ts'
import { postRoute } from './docs.ts'

export const postApp = new OpenAPIHono<MiddlewareKeyEnv>({
  defaultHook: errorHook(),
})

postApp.use(postRoute.getRoutingPath(), middlewareKey(['all', 'write']))
postApp.openapi(postRoute, async (c: Context) => {
  const body = await c.req.json() as any as z.infer<typeof postRequestSchema>
  const apikey = c.get('apikey')

  if (!body.device_id || !body.app_id) {
    console.log('Missing device_id or app_id')
    return c.json({ status: 'Missing device_id or app_id' }, 400)
  }

  if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'write'))) {
    console.log('You can\'t access this app', body.app_id)
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }

  if (!body.channel && body.version_id) {
    console.log('Cannot set version without channel')
    return c.json({ status: 'Cannot set version without channel' }, 400)
  }

  // if version_id set device_override to it
  if (body.version_id) {
    const { data: dataVersion, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version_id)
      .single()
    if (dbError || !dataVersion) {
      console.log('Cannot find version', dbError)
      return c.json({ status: 'Cannot find version', error: dbError }, 400)
    }

    const { data: mainChannel } = await supabaseAdmin(c)
      .from('channels')
      .select()
      .eq('app_id', body.app_id)
      .eq('public', true)
      .single()
    if (mainChannel?.version === dataVersion.id) {
      console.log('Cannot set version already in a public channel')
      return c.json({ status: 'Cannot set version already in a public channel' }, 400)
    }
    const { error: dbErrorDev } = await supabaseAdmin(c)
      .from('devices_override')
      .upsert({
        device_id: body.device_id,
        version: dataVersion.id,
        app_id: body.app_id,
        owner_org: dataVersion?.owner_org,
      })
    if (dbErrorDev) {
      console.log('Cannot save device override', dbErrorDev)
      return c.json({ status: 'Cannot save device override', error: dbErrorDev }, 400)
    }
  }
  // if channel set channel_override to it
  if (body.channel) {
    // get channel by name
    const { data: dataChannel, error: dbError } = await supabaseAdmin(c)
      .from('channels')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel) {
      console.log('Cannot find channel', dbError)
      return c.json({ status: 'Cannot find channel', error: dbError }, 400)
    }

    if (dataChannel.public) {
      console.log('Cannot set channel override for public channel')
      // if channel is public, we don't set channel_override
      return c.json({ status: 'Cannot set channel override for public channel' }, 400)
    }
    const { error: dbErrorDev } = await supabaseAdmin(c)
      .from('channel_devices')
      .upsert({
        device_id: body.device_id,
        channel_id: dataChannel.id,
        app_id: body.app_id,
        owner_org: dataChannel.owner_org,
      })
    if (dbErrorDev) {
      console.log('Cannot save channel override', dbErrorDev)
      return c.json({ status: 'Cannot save channel override', error: dbErrorDev }, 400)
    }
  }
  return c.json(BRES, 200)
})
