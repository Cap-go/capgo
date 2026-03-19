import type { TrackOptions } from '@logsnag/node'
import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { logsnag } from '../utils/logsnag.ts'
import { trackPosthogEvent } from '../utils/posthog.ts'
import { checkPermission } from '../utils/rbac.ts'
import { broadcastCLIEvent } from '../utils/realtime_broadcast.ts'
import { hasOrgRight, hasOrgRightApikey, supabaseWithAuth } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

async function canAccessRequestedOrg(c: Context<MiddlewareKeyVariables>, orgId: string) {
  const auth = c.get('auth')
  if (!auth?.userId || !orgId)
    return false

  if (auth.authType === 'apikey')
    return hasOrgRightApikey(c, orgId, auth.userId, 'read', c.get('capgkey'))

  return hasOrgRight(c, orgId, auth.userId, 'read')
}

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<TrackOptions & { notifyConsole?: boolean }>(c)
  const requestedOrgId = body.notifyConsole && typeof body.user_id === 'string' && body.user_id.length > 0
    ? body.user_id
    : undefined

  if (requestedOrgId && !(await canAccessRequestedOrg(c, requestedOrgId)))
    return c.json({ error: 'Forbidden' }, 403)

  const orgId = typeof body.user_id === 'string' && body.user_id.length > 0
    ? body.user_id
    : c.get('auth')?.userId ?? ''

  // notifyConsole: broadcast to Supabase Realtime only, skip all tracking
  if (body.notifyConsole) {
    if (!body.user_id) {
      throw simpleError('missing_org_id', 'Missing org ID for console notification')
    }
    if (!(await checkPermission(c, 'org.read', { orgId: body.user_id }))) {
      throw simpleError('cannot_access_organization', 'You can\'t access this organization', { org_id: body.user_id })
    }
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

  await backgroundTask(c, logsnag(c).track(body))
  await backgroundTask(c, trackPosthogEvent(c, {
    event: body.event,
    user_id: orgId,
    tags: body.tags,
    channel: body.channel,
    description: body.description,
    ip,
  }))
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
