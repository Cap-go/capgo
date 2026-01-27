import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { createIfNotExistStoreInfo } from '../utils/cloudflare.ts'
import { purgeOnPremCache } from '../utils/cloudflare_cache_purge.ts'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { logsnag } from '../utils/logsnag.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('apps', 'INSERT'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['apps']['Row'] & { is_demo?: boolean }
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No id' })
    throw simpleError('no_id', 'No id', { record })
  }

  // Check if this is a demo app - skip onboarding emails and store info for demo apps
  const isDemo = record.is_demo === true
  if (isDemo) {
    cloudlog({ requestId: c.get('requestId'), message: 'Demo app detected, skipping onboarding emails and store info' })
  }

  const LogSnag = logsnag(c)
  await backgroundTask(c, LogSnag.track({
    channel: 'app-created',
    event: isDemo ? 'Demo App Created' : 'App Created',
    icon: isDemo ? '🎮' : '🎉',
    user_id: record.owner_org,
    tags: {
      app_id: record.app_id,
      is_demo: isDemo ? 'true' : 'false',
    },
    notify: false,
  }))

  // Purge on-prem cache for this app to clear any stale responses
  await backgroundTask(c, purgeOnPremCache(c, record.app_id))
  const supabase = supabaseAdmin(c)
  const { error: dbVersionError } = await supabase
    .from('app_versions')
    .upsert([
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
    ], { onConflict: 'name,app_id', ignoreDuplicates: true })
    .select()

  if (dbVersionError) {
    cloudlog({ requestId: c.get('requestId'), message: 'Error creating default versions', dbVersionError })
  }

  // Skip onboarding emails for demo apps
  if (!isDemo) {
    await backgroundTask(c, supabase
      .from('orgs')
      .select('*')
      .eq('id', record.owner_org)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          throw simpleError('error_fetching_organization', 'Error fetching organization', { error })
        }
        return trackBentoEvent(c, data.management_email, {
          org_id: record.owner_org,
          org_name: data.name,
          app_name: record.name,
        }, 'app:created')
      }))
    await backgroundTask(c, createIfNotExistStoreInfo(c, {
      app_id: record.app_id,
      updates: 1,
      onprem: true,
      capacitor: true,
      capgo: true,
    }))
  }

  return c.json(BRES)
})
