import type { TrackOptions } from '@logsnag/node'
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { BentoTrackingPayload } from '../utils/tracking.ts'
import { Hono } from 'hono/tiny'
import { BUILDER_RECOVERY_MILESTONES, buildBuilderOnboardingBentoEvent } from '../utils/builder_onboarding_recovery.ts'
import { BRES, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { broadcastCLIEvent } from '../utils/realtime_broadcast.ts'
import { hasOrgRight, hasOrgRightApikey, supabaseWithAuth } from '../utils/supabase.ts'
import { sendEventToTracking } from '../utils/tracking.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

interface ResolvedTrackingId {
  trackingUserId: string
  // Only set when we've verified the id refers to an organization the caller
  // can access. Events for a bare authenticated user (no requestedUserId, or
  // requestedUserId === authUserId) leave this undefined so we don't pollute
  // the PostHog `organization` group with user UUIDs.
  orgId?: string
}

interface TrackEventBody extends TrackOptions {
  notifyConsole?: boolean
  org_id?: string
  tracking_version?: number | string
}

function isTrackingV2(version: unknown) {
  return version === 2 || version === '2'
}

async function resolveTrackingUserId(
  c: Context<MiddlewareKeyVariables>,
  requestedUserId: string | undefined,
  requestedOrgId: string | undefined,
  appId: string | undefined,
  trackingV2 = false,
  notifyConsole = false,
): Promise<ResolvedTrackingId> {
  const forbiddenError = notifyConsole ? 'Forbidden' : 'no_permission'
  const authUserId = c.get('auth')?.userId ?? ''

  if (trackingV2) {
    if (!requestedOrgId) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'tracking v2 event missing org_id; sending actor-scoped event without organization group',
      })
      return { trackingUserId: authUserId }
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

      if (error || !app || app.owner_org !== requestedOrgId) {
        throw quickError(403, forbiddenError, 'You cannot send events for this organization')
      }

      return { trackingUserId: authUserId, orgId: requestedOrgId }
    }

    if (await checkPermission(c, 'org.read', { orgId: requestedOrgId })) {
      return { trackingUserId: authUserId, orgId: requestedOrgId }
    }

    throw quickError(403, forbiddenError, 'You cannot send events for this organization')
  }

  if (!requestedUserId || requestedUserId === authUserId) {
    return { trackingUserId: authUserId }
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

    return { trackingUserId: requestedUserId, orgId: requestedUserId }
  }

  if (await checkPermission(c, 'org.read', { orgId: requestedUserId })) {
    return { trackingUserId: requestedUserId, orgId: requestedUserId }
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
  const body = await parseBody<TrackEventBody>(c)
  const { notifyConsole = false, org_id: _orgId, tracking_version: _trackingVersion, ...trackOptions } = body
  const trackingV2 = isTrackingV2(body.tracking_version)
  const requestedOrgId = trackingV2 && typeof body.org_id === 'string' && body.org_id.length > 0
    ? body.org_id
    : body.notifyConsole && typeof body.user_id === 'string' && body.user_id.length > 0
      ? body.user_id
      : undefined

  // Legacy notifyConsole still sends the target org in `user_id`, so keep this
  // preflight scoped to notifyConsole. Non-notify v2 events validate `org_id`
  // inside resolveTrackingUserId(), where app ownership and org access diverge.
  if (body.notifyConsole && requestedOrgId && !(await canAccessRequestedOrg(c, requestedOrgId)))
    throw quickError(403, 'Forbidden', 'You cannot send events for this organization')

  const requestedUserId = typeof body.user_id === 'string' ? body.user_id : undefined
  const appId = typeof body.tags?.['app-id'] === 'string'
    ? body.tags['app-id']
    : typeof body.tags?.app_id === 'string'
      ? body.tags.app_id
      : undefined
  const { trackingUserId, orgId: verifiedOrgId } = await resolveTrackingUserId(c, requestedUserId, requestedOrgId, appId, trackingV2, Boolean(body.notifyConsole))
  const trackedTags = trackingV2 && verifiedOrgId
    ? { ...(trackOptions.tags || {}), org_id: verifiedOrgId }
    : trackOptions.tags
  const trackedBody = trackingV2
    ? { ...trackOptions, user_id: trackingUserId, tags: trackedTags }
    : requestedUserId
      ? { ...trackOptions, user_id: trackingUserId }
      : trackOptions

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
        org_id: requestedOrgId,
        channel_name: typeof trackedBody.tags?.channel === 'string' ? trackedBody.tags.channel : undefined,
        bundle_name: typeof trackedBody.tags?.bundle === 'string' ? trackedBody.tags.bundle : undefined,
        timestamp: new Date().toISOString(),
      }))
    }
    return c.json(BRES)
  }

  const supabase = supabaseWithAuth(c, c.get('auth')!)

  // Resolve the org from the verified org id (v2) or the legacy user_id-as-org
  // value (v1 only). Under tracking v2, trackedBody.user_id is the authenticated
  // *user*, so it must never be used to look up the organization — a v2 event
  // without an org_id simply skips the Bento notification.
  const onboardingOrgId = verifiedOrgId
    ?? (!trackingV2 && typeof trackedBody.user_id === 'string' ? trackedBody.user_id : undefined)
  let onboardingBentoEvent: BentoTrackingPayload | undefined
  if (onboardingOrgId && appId && trackedBody.event === 'onboarding-step-done') {
    onboardingBentoEvent = await Promise.all([
      supabase
        .from('orgs')
        .select('*')
        .eq('id', onboardingOrgId)
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

  // Builder native-build onboarding (capgo build init): emit start/finish signal
  // events to Bento so a later automation can recover users who started but never
  // finished. Mirrors the onboarding-step-done block above. Only the milestone
  // steps trigger the org/app lookup.
  const builderStep = typeof body.tags?.step === 'string' ? body.tags.step : undefined
  const builderPlatform = typeof body.tags?.platform === 'string' ? body.tags.platform : undefined
  let builderBentoEvent: BentoTrackingPayload | undefined
  if (
    onboardingOrgId && appId
    && trackedBody.event === 'Builder Onboarding Step'
    && builderStep && BUILDER_RECOVERY_MILESTONES.has(builderStep)
  ) {
    const [orgResult, appResult] = await Promise.all([
      supabase.from('orgs').select('id, name').eq('id', onboardingOrgId).single(),
      supabase.from('apps').select('name').eq('app_id', appId).single(),
    ])
    builderBentoEvent = buildBuilderOnboardingBentoEvent({
      event: trackedBody.event,
      step: builderStep,
      orgId: onboardingOrgId,
      appId,
      platform: builderPlatform,
      orgName: orgResult.data?.name ?? undefined,
      appName: appResult.data?.name ?? undefined,
    })
  }

  const bentoEvent = onboardingBentoEvent ?? builderBentoEvent
  await sendEventToTracking(c, {
    ...trackedBody,
    bento: bentoEvent,
    sentToBento: Boolean(bentoEvent),
    groups: verifiedOrgId ? { organization: verifiedOrgId } : undefined,
  })

  return c.json(BRES)
})
