import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cleanStoredImageMetadata } from '../utils/image.ts'
import { cloudlog } from '../utils/logging.ts'
import { getAppTriggerRecordLogMetadata, logTriggerRecord } from './logging.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('apps', 'UPDATE'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['apps']['Row']
  logTriggerRecord(c, 'app update trigger record', record, getAppTriggerRecordLogMetadata)

  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No app id' })
    throw simpleError('no_id', 'No id', { record })
  }

  if (record.icon_url) {
    await cleanStoredImageMetadata(c, record.icon_url)
  }

  return c.json(BRES)
})
