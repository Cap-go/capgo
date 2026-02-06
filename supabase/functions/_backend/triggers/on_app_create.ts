import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { createIfNotExistStoreInfo } from '../utils/cloudflare.ts'
import { purgeOnPremCache } from '../utils/cloudflare_cache_purge.ts'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { logsnag } from '../utils/logsnag.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import * as schema from '../utils/postgres_schema.ts'
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

  const supabase = supabaseAdmin(c)

  // Some environments/triggers may deliver a partial payload (e.g. missing owner_org).
  // Resolve it from the database so we don't insert invalid app_versions rows.
  let ownerOrg: string | undefined = record.owner_org ?? undefined
  if (!ownerOrg) {
    const pg = getPgClient(c)
    const drizzleClient = getDrizzleClient(pg)
    try {
      const rows = await drizzleClient
        .select({ owner_org: schema.apps.owner_org })
        .from(schema.apps)
        .where(eq(schema.apps.id, record.id))
        .limit(1)
      ownerOrg = rows[0]?.owner_org ?? undefined
    }
    catch (error) {
      cloudlog({ requestId: c.get('requestId'), message: 'Error fetching app owner_org', error, appId: record.id })
    }
    finally {
      closeClient(c, pg)
    }
  }

  // Check if this is a demo app - skip onboarding emails and store info for demo apps
  const isDemo = record.is_demo === true
  if (isDemo) {
    cloudlog({ requestId: c.get('requestId'), message: 'Demo app detected, skipping onboarding emails and store info' })
  }

  // Can't proceed with onboarding/default versions without an org id.
  if (!ownerOrg) {
    cloudlog({ requestId: c.get('requestId'), message: 'No owner_org on app record, skipping onboarding and default versions', record })
    return c.json(BRES)
  }

  const LogSnag = logsnag(c)
  await backgroundTask(c, LogSnag.track({
    channel: 'app-created',
    event: isDemo ? 'Demo App Created' : 'App Created',
    icon: isDemo ? '🎮' : '🎉',
    user_id: ownerOrg,
    tags: {
      app_id: record.app_id,
      is_demo: isDemo ? 'true' : 'false',
    },
    notify: false,
  }))

  // Purge on-prem cache for this app to clear any stale responses
  await backgroundTask(c, purgeOnPremCache(c, record.app_id))
  const { error: dbVersionError } = await supabase
    .from('app_versions')
    .upsert([
      {
        owner_org: ownerOrg,
        deleted: true,
        name: 'unknown',
        app_id: record.app_id,
      },
      {
        owner_org: ownerOrg,
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
      .eq('id', ownerOrg)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          throw simpleError('error_fetching_organization', 'Error fetching organization', { error })
        }
        return trackBentoEvent(c, data.management_email, {
          org_id: ownerOrg,
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
