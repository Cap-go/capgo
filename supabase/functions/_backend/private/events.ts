import type { TrackOptions } from '@logsnag/node'
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { BentoTrackingPayload } from '../utils/tracking.ts'
import { Hono } from 'hono/tiny'
import { BRES, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { checkPermission } from '../utils/rbac.ts'
import { broadcastCLIEvent } from '../utils/realtime_broadcast.ts'
import { hasOrgRight, hasOrgRightApikey, supabaseWithAuth } from '../utils/supabase.ts'
import { sendEventToTracking } from '../utils/tracking.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

async function resolveTrackingUserId(
  c: Context<MiddlewareKeyVariables>,
  requestedUserId: string | undefined,
  appId: string | undefined,
  notifyConsole = false,
) {
  const forbiddenError = notifyConsole ? 'Forbidden' : 'no_permission'
  const authUserId = c.get('auth')?.userId ?? ''

  if (!requestedUserId || requestedUserId === authUserId) {
    return authUserId
  }

  if (appId) {
    if (!(await checkPermission(c, 'app.read', { appId }))) {
      throw quickError(403, forbiddenError, 'You cannot send events for this organization')
    }

    const supabase = supabaseWithAuth(c, c.get('auth')!)
    const { data: app, error } = await supabase
      .from('apps')
      .select('owner_org')
      .eq('app_id', appId)
      .single()

    if (error || !app || app.owner_org !== requestedUserId) {
      throw quickError(403, forbiddenError, 'You cannot send events for this organization')
    }

    return requestedUserId
  }

  if (await checkPermission(c, 'org.read', { orgId: requestedUserId })) {
    return requestedUserId
  }

  throw quickError(403, forbiddenError, 'You cannot send events for this organization')
}

function canAccessRequestedOrg(c: Context<MiddlewareKeyVariables>, orgId: string) {
  const auth = c.get('auth')
  if (!auth?.userId || !orgId) {
    return false
  }

  if (auth.authType === 'apikey') {
    return hasOrgRightApikey(c, orgId, auth.userId, 'read', c.get('capgkey'))
  }

  return hasOrgRight(c, orgId, auth.userId, 'read')
}

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<TrackOptions & { notifyConsole?: boolean }>(c)
  const { notifyConsole = false, ...trackOptions } = body
  const requestedOrgId = body.notifyConsole && typeof body.user_id === 'string' && body.user_id.length > 0
    ? body.user_id
    : undefined

  if (requestedOrgId && !(await canAccessRequestedOrg(c, requestedOrgId)))
    throw quickError(403, 'Forbidden', 'You cannot send events for this organization')

  const requestedUserId = typeof body.user_id === 'string' ? body.user_id : undefined
  const appId = typeof body.tags?.['app-id'] === 'string'
    ? body.tags['app-id']
    : typeof body.tags?.app_id === 'string'
      ? body.tags.app_id
      : undefined
  const trackingUserId = await resolveTrackingUserId(c, requestedUserId, appId, Boolean(body.notifyConsole))
  const trackedBody = requestedUserId ? { ...trackOptions, user_id: trackingUserId } : trackOptions

  // notifyConsole: broadcast to Supabase Realtime only, skip all tracking
  if (notifyConsole) {
    if (!requestedOrgId)
      throw simpleError('missing_org_id', 'Missing org ID for console notification')
    if (!(await checkPermission(c, 'org.read', { orgId: requestedOrgId })))
      throw quickError(403, 'Forbidden', 'You cannot send events for this organization')
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

  let onboardingBentoEvent: BentoTrackingPayload | undefined
  if (trackedBody.user_id && appId && trackedBody.event === 'onboarding-step-done') {
    onboardingBentoEvent = await Promise.all([
      supabase
        .from('orgs')
        .select('*')
        .eq('id', trackedBody.user_id)
        .single(),
      supabase
        .from('apps')
        .select('*')
        .eq('app_id', appId)
        .single(),
    ]).then(([orgResult, appResult]) => {
      if (orgResult.error || !orgResult.data || appResult.error || !appResult.data) {
        throw simpleError('error_fetching_organization_or_app', 'Error fetching organization or app', { org: orgResult.error, app: appResult.error })
      }

      return {
        cron: '* * * * *',
        event: 'app:updated',
        preferenceKey: 'onboarding' as const,
        uniqId: `app:updated:${appId}`,
        data: {
          org_id: orgResult.data.id,
          org_name: orgResult.data.name,
          app_name: appResult.data.name,
        },
      }
    })
  }

  await sendEventToTracking(c, {
    ...trackedBody,
    bento: onboardingBentoEvent,
    sentToBento: Boolean(onboardingBentoEvent),
  })

  return c.json(BRES)
})
