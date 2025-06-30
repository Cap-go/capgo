import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { deleteIt } from './on_version_update.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('app_versions', 'DELETE'), (c) => {
  try {
    const record = c.get('webhookBody') as Database['public']['Tables']['app_versions']['Row']
    cloudlog({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.app_id || !record.user_id) {
      cloudlog({ requestId: c.get('requestId'), message: 'no app_id or user_id' })
      return c.json(BRES)
    }
    return deleteIt(c as any, record)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete version', error: JSON.stringify(e) }, 500)
  }
})
