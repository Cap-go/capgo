import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'deploy_history'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      cloudlog({ requestId: c.get('requestId'), message: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      cloudlog({ requestId: c.get('requestId'), message: 'Not INSERT' })
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    cloudlog({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.id) {
      cloudlog({ requestId: c.get('requestId'), message: 'No id' })
      return c.json(BRES)
    }

    // Check if the channel is public
    const { data: channel, error: channelError } = await supabaseAdmin(c as any)
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
      const { data: version, error: versionError } = await supabaseAdmin(c as any)
        .from('app_versions')
        .select('name, owner_org')
        .eq('id', record.version_id)
        .single()

      if (versionError || !version) {
        cloudlog({ requestId: c.get('requestId'), message: 'Error fetching version', versionError })
        return c.json(BRES)
      }

      const LogSnag = logsnag(c as any)
      await backgroundTask(c as any, LogSnag.track({
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

      await backgroundTask(c as any, supabaseAdmin(c as any)
        .from('orgs')
        .select('*')
        .eq('id', version.owner_org)
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            cloudlog({ requestId: c.get('requestId'), message: 'Error fetching organization', error })
            return c.json({ status: 'Error fetching organization' }, 500)
          }
          return trackBentoEvent(c as any, data.management_email, {
            org_id: version.owner_org,
            app_id: record.app_id,
            bundle_name: version.name,
            channel_id: record.channel_id,
          }, 'bundle:deployed') as any
        }))
    }

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot create deploy history', error: JSON.stringify(e) }, 500)
  }
})
