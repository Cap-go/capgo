import type { TrackOptions } from '@logsnag/node'
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { logsnag } from '../utils/logsnag.ts'
import { trackPosthogEvent } from '../utils/posthog.ts'
import { checkPermission } from '../utils/rbac.ts'
import { broadcastCLIEvent } from '../utils/realtime_broadcast.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

async function resolveTrackingUserId(
  c: Context<MiddlewareKeyVariables>,
  requestedUserId: string | undefined,
  appId: string | undefined,
) {
  const authUserId = c.get('auth')?.userId ?? ''

  if (!requestedUserId || requestedUserId === authUserId) {
    return authUserId
  }

  if (appId) {
    if (!(await checkPermission(c, 'app.read', { appId }))) {
      throw quickError(403, 'no_permission', 'You cannot send events for this organization')
    }

    const supabase = supabaseWithAuth(c, c.get('auth')!)
    const { data: app, error } = await supabase
      .from('apps')
      .select('owner_org')
      .eq('app_id', appId)
      .single()

    if (error || !app || app.owner_org !== requestedUserId) {
      throw quickError(403, 'no_permission', 'You cannot send events for this organization')
    }

    return requestedUserId
  }

  if (await checkPermission(c, 'org.read', { orgId: requestedUserId })) {
    return requestedUserId
  }

  throw quickError(403, 'no_permission', 'You cannot send events for this organization')
}

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<TrackOptions & { notifyConsole?: boolean }>(c)
  const requestedUserId = typeof body.user_id === 'string' ? body.user_id : undefined
  const appId = typeof body.tags?.['app-id'] === 'string' ? body.tags['app-id'] : undefined
  const trackingUserId = await resolveTrackingUserId(c, requestedUserId, appId)
  const trackedBody = requestedUserId ? { ...body, user_id: trackingUserId } : body

  // notifyConsole: broadcast to Supabase Realtime only, skip all tracking
  if (trackedBody.notifyConsole) {
    if (trackingUserId) {
      await backgroundTask(c, broadcastCLIEvent(c, {
        event: trackedBody.event,
        channel: trackedBody.channel,
        description: trackedBody.description,
        icon: trackedBody.icon,
        app_id: appId,
        org_id: trackingUserId,
        channel_name: typeof trackedBody.tags?.channel === 'string' ? trackedBody.tags.channel : undefined,
        bundle_name: typeof trackedBody.tags?.bundle === 'string' ? trackedBody.tags.bundle : undefined,
        timestamp: new Date().toISOString(),
      }))
    }
    return c.json(BRES)
  }

  const supabase = supabaseWithAuth(c, c.get('auth')!)
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()

  await backgroundTask(c, logsnag(c).track(trackedBody))
  await backgroundTask(c, trackPosthogEvent(c, {
    event: trackedBody.event,
    user_id: trackingUserId,
    tags: trackedBody.tags,
    channel: trackedBody.channel,
    description: trackedBody.description,
    ip,
  }))
  if (trackedBody.user_id && trackedBody.tags && typeof trackedBody.tags['app-id'] === 'string' && trackedBody.event === 'onboarding-step-done') {
    const onboardingAppId = trackedBody.tags['app-id']
    await backgroundTask(c, Promise.all([
      supabase
        .from('orgs')
        .select('*')
        .eq('id', trackedBody.user_id)
        .single(),
      supabase
        .from('apps')
        .select('*')
        .eq('app_id', onboardingAppId)
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
