import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('app_versions', 'INSERT'), async (c) => {
  try {
    const record = c.get('webhookBody') as Database['public']['Tables']['app_versions']['Row']
    cloudlog({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.id) {
      cloudlog({ requestId: c.get('requestId'), message: 'No id' })
      return c.json(BRES)
    }

    const { error: errorUpdate } = await supabaseAdmin(c as any)
      .from('apps')
      .update({
        last_version: record.name,
      })
      .eq('app_id', record.app_id)
      .eq('owner_org', record.owner_org)
    if (errorUpdate)
      cloudlog({ requestId: c.get('requestId'), message: 'errorUpdate', errorUpdate })

    const LogSnag = logsnag(c as any)
    await backgroundTask(c as any, LogSnag.track({
      channel: 'bundle-created',
      event: 'Bundle Created',
      icon: '🎉',
      user_id: record.owner_org,
      tags: {
        app_id: record.app_id,
        bundle_name: record.name,
      },
      notify: false,
    }))
    await backgroundTask(c as any, supabaseAdmin(c as any)
      .from('orgs')
      .select('*')
      .eq('id', record.owner_org)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          cloudlog({ requestId: c.get('requestId'), message: 'Error fetching organization', error })
          return c.json({ status: 'Error fetching organization' }, 500)
        }
        return trackBentoEvent(c as any, data.management_email, {
          org_id: record.owner_org,
          app_id: record.app_id,
          bundle_name: record.name,
        }, 'bundle:created') as any
      }))

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot create version', error: JSON.stringify(e) }, 500)
  }
})
