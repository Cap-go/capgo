import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
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

    await backgroundTask(c, supabaseAdmin(c)
      .from('orgs')
      .select('*')
      .eq('id', version.owner_org)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          throw simpleError('error_fetching_organization', 'Error fetching organization', { error })
        }
        return trackBentoEvent(c, data.management_email, {
          org_id: version.owner_org,
          app_id: record.app_id,
          bundle_name: version.name,
          channel_id: record.channel_id,
        }, 'bundle:deployed') as any
      }))
  }

  return c.json(BRES)
})
