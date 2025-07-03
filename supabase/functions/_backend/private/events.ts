import type { TrackOptions } from '@logsnag/node'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask, checkKey } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

// No middleware applied to this route, as we allow both authorization and capgkey for CLI and webapp access
app.post('/', async (c) => {
  const body = await c.req.json<TrackOptions>()
    .catch((e) => {
      throw simpleError('invalid_json_body', 'Invalid JSON body', { e })
    })
  cloudlog({ requestId: c.get('requestId'), message: 'post private/stats body', body })
  const apikey_string = c.req.header('capgkey')
  const authorization = c.req.header('authorization')
  const supabase = supabaseAdmin(c)
  if (apikey_string) {
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c, apikey_string, supabase, ['read', 'write', 'all', 'upload'])
    if (!apikey) {
      throw simpleError('invalid_apikey', 'Invalid apikey', { apikey_string })
    }
  }
  else if (authorization) {
    const { data: auth, error } = await supabase.auth.getUser(
      authorization?.split('Bearer ')[1],
    )
    if (error || !auth?.user?.id) {
      throw simpleError('auth_not_found', 'You can\'t access this, auth not found', { auth: authorization })
    }
  }
  else {
    throw simpleError('auth_not_found', 'You can\'t access this, auth not found', { auth: authorization })
  }
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
