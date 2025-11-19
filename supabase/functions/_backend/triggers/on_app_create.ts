import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { logsnag } from '../utils/logsnag.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('apps', 'INSERT'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['apps']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No id' })
    return simpleError('no_id', 'No id', { record })
  }

  const LogSnag = logsnag(c)
  await backgroundTask(c, LogSnag.track({
    channel: 'app-created',
    event: 'App Created',
    icon: '🎉',
    user_id: record.owner_org,
    tags: {
      app_id: record.app_id,
    },
    notify: false,
  }))
  const supabase = supabaseAdmin(c)
  const { error: dbVersionError } = await supabase
    .from('app_versions')
    .insert([
      {
        owner_org: record.owner_org,
        deleted: true,
        name: 'unknown',
        app_id: record.app_id,
      },
      {
        owner_org: record.owner_org,
        deleted: true,
        name: 'builtin',
        app_id: record.app_id,
      },
    ])
  if (dbVersionError) {
    cloudlog({ requestId: c.get('requestId'), message: 'Error creating default versions', dbVersionError })
  }
  await backgroundTask(c, supabase
    .from('orgs')
    .select('*')
    .eq('id', record.owner_org)
    .single()
    .then(({ data, error }) => {
      if (error || !data) {
        return simpleError('error_fetching_organization', 'Error fetching organization', { error })
      }
      return trackBentoEvent(c, data.management_email, {
        org_id: record.owner_org,
        org_name: data.name,
        app_name: record.name,
      }, 'app:created') as any
    }))

  return c.json(BRES)
})
