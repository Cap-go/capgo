import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { isAppDemo } from '../utils/demo.ts'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { logsnag } from '../utils/logsnag.ts'
import { sendEmailToOrgMembers } from '../utils/org_email_notifications.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('deploy_history', 'INSERT'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['deploy_history']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No id' })
    throw simpleError('no_id', 'No id', { record })
  }

  // Check if the channel is public
  const { data: channel, error: channelError } = await supabaseAdmin(c)
    .from('channels')
    .select('public')
    .eq('id', record.channel_id)
    .single()

  if (channelError) {
    cloudlog({ requestId: c.get('requestId'), message: 'Error fetching channel', channelError })
    return c.json(BRES)
  }

  // If channel is public, send events
  if (channel?.public) {
    // Get version details for the event
    const { data: version, error: versionError } = await supabaseAdmin(c)
      .from('app_versions')
      .select('name, owner_org')
      .eq('id', record.version_id)
      .single()

    if (versionError || !version) {
      cloudlog({ requestId: c.get('requestId'), message: 'Error fetching version', versionError })
      return c.json(BRES)
    }

    // Check if this is a demo app (identified by com.capdemo. prefix) - skip notifications
    if (isAppDemo(record.app_id)) {
      cloudlog({ requestId: c.get('requestId'), message: 'Demo app detected, skipping deploy notifications' })
      return c.json(BRES)
    }

    const LogSnag = logsnag(c)
    await backgroundTask(c, LogSnag.track({
      channel: 'bundle-deployed',
      event: 'Bundle Deployed',
      icon: '🚀',
      user_id: version.owner_org,
      tags: {
        app_id: record.app_id,
        bundle_name: version.name,
        channel_id: record.channel_id,
      },
      notify: false,
    }))

    const pgClient = getPgClient(c, true)
    const drizzleClient = getDrizzleClient(pgClient)
    try {
      await backgroundTask(c, sendEmailToOrgMembers(c, 'bundle:deployed', 'bundle_deployed', {
        org_id: version.owner_org,
        app_id: record.app_id,
        bundle_name: version.name,
        channel_id: record.channel_id,
      }, version.owner_org, drizzleClient))
    }
    finally {
      closeClient(c, pgClient)
    }
  }

  return c.json(BRES)
})
