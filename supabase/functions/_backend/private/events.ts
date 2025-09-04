import type { TrackOptions } from '@logsnag/node'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareV2, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<TrackOptions>(c)
  const supabase = supabaseWithAuth(c, c.get('auth')!)
  await backgroundTask(c, logsnag(c).track(body))
  if (body.user_id && body.tags && typeof body.tags['app-id'] === 'string' && body.event === 'onboarding-step-10') {
    const orgId = body.user_id
    const appId = body.tags['app-id']
    await backgroundTask(c, Promise.all([
      supabase
        .from('orgs')
        .select('*')
        .eq('id', orgId)
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
