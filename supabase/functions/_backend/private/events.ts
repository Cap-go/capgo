import type { TrackOptions } from '@logsnag/node'
import type { ActivationPalPayload } from '../utils/activationpal.ts'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { trackActivationpalEvent } from '../utils/activationpal.ts'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { logsnag } from '../utils/logsnag.ts'
import { broadcastCLIEvent } from '../utils/realtime_broadcast.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<TrackOptions & { notifyConsole?: boolean }>(c)

  const orgId = body.user_id ?? c.get('auth')?.userId ?? ''

  // notifyConsole: broadcast to Supabase Realtime only, skip all tracking
  if (body.notifyConsole) {
    if (orgId) {
      await backgroundTask(c, broadcastCLIEvent(c, {
        event: body.event,
        channel: body.channel,
        description: body.description,
        icon: body.icon,
        app_id: typeof body.tags?.['app-id'] === 'string' ? body.tags['app-id'] : undefined,
        org_id: orgId,
        channel_name: typeof body.tags?.channel === 'string' ? body.tags.channel : undefined,
        bundle_name: typeof body.tags?.bundle === 'string' ? body.tags.bundle : undefined,
        timestamp: new Date().toISOString(),
      }))
    }
    return c.json(BRES)
  }

  const supabase = supabaseWithAuth(c, c.get('auth')!)
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()

  const activationPayload: ActivationPalPayload = {
    user: {
      id: body.user_id ?? c.get('auth')?.userId,
      traits: body.tags,
    },
    event: {
      name: body.event,
      ip,
      trackSession: true,
      properties: {
        ...(body.tags ?? {}),
        channel: body.channel,
        description: body.description,
      },
    },
  }

  await backgroundTask(c, logsnag(c).track(body))
  await backgroundTask(c, trackActivationpalEvent(c, activationPayload))
  if (body.user_id && body.tags && typeof body.tags['app-id'] === 'string' && body.event === 'onboarding-step-done') {
    const appId = body.tags['app-id']
    await backgroundTask(c, Promise.all([
      supabase
        .from('orgs')
        .select('*')
        .eq('id', body.user_id)
        .single(),
      supabase
        .from('apps')
        .select('*')
        .eq('app_id', appId)
        .single(),
    ])
      .then(([orgResult, appResult]) => {
        if (orgResult.error || !orgResult.data || appResult.error || !appResult.data) {
          throw simpleError('error_fetching_organization_or_app', 'Error fetching organization or app', { org: orgResult.error, app: appResult.error })
        }
        return trackBentoEvent(c, orgResult.data.management_email, {
          org_id: orgResult.data.id,
          org_name: orgResult.data.name,
          app_name: appResult.data.name,
        }, 'app:updated') as any
      }))
  }

  return c.json(BRES)
})
