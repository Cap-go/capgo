import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'apps'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), message: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log({ requestId: c.get('requestId'), message: 'Not INSERT' })
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.id) {
      console.log({ requestId: c.get('requestId'), message: 'No id' })
      return c.json(BRES)
    }

    const LogSnag = logsnag(c as any)
    backgroundTask(c as any, LogSnag.track({
      channel: 'app-created',
      event: 'App Created',
      icon: '🎉',
      user_id: record.owner_org,
      tags: {
        app_id: record.app_id,
      },
      notify: false,
    }))
    const supabase = supabaseAdmin(c as any)
    backgroundTask(c as any, supabase
      .from('orgs')
      .select('*')
      .eq('id', record.owner_org)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.log({ requestId: c.get('requestId'), message: 'Error fetching organization', error })
          return c.json({ status: 'Error fetching organization' }, 500)
        }
        return trackBentoEvent(c as any, data.management_email, {
          org_id: record.owner_org,
          org_name: data.name,
          app_name: record.name,
        }, 'app:created') as any
      }))

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot handle org creation', error: JSON.stringify(e) }, 500)
  }
})
