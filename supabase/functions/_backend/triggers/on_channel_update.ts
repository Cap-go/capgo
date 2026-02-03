import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { retryWithBackoff } from '../utils/retry.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

const UPDATE_RETRY_ATTEMPTS = 3
const UPDATE_RETRY_DELAY_MS = 300

async function updateChannelsWithRetry(
  c: Context<MiddlewareKeyVariables>,
  operation: () => Promise<{ error: unknown }>,
  context: Record<string, unknown>,
) {
  const { result, lastError } = await retryWithBackoff(operation, {
    attempts: UPDATE_RETRY_ATTEMPTS,
    baseDelayMs: UPDATE_RETRY_DELAY_MS,
    shouldRetry: result => Boolean(result?.error),
  })
  if (result?.error || lastError) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'on_channel_update failed after retries',
      error: result?.error ?? lastError,
      ...context,
    })
  }
}

app.post('/', middlewareAPISecret, triggerValidator('channels', 'UPDATE'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['channels']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No id' })
    throw simpleError('no_id', 'No id', { record })
  }
  if (!record.app_id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No app id included the request' })
    throw simpleError('no_app_id', 'No app id included the request', { record })
  }

  if (record.public && record.ios) {
    await updateChannelsWithRetry(
      c,
      async () => await supabaseAdmin(c)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('ios', true)
        .neq('id', record.id),
      { app_id: record.app_id, record_id: record.id, scope: 'ios' },
    )
    await updateChannelsWithRetry(
      c,
      async () => await supabaseAdmin(c)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('android', false)
        .eq('ios', false),
      { app_id: record.app_id, record_id: record.id, scope: 'hidden_ios' },
    )
  }

  if (record.public && record.android) {
    await updateChannelsWithRetry(
      c,
      async () => await supabaseAdmin(c)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('android', true)
        .neq('id', record.id),
      { app_id: record.app_id, record_id: record.id, scope: 'android' },
    )
    await updateChannelsWithRetry(
      c,
      async () => await supabaseAdmin(c)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('android', false)
        .eq('ios', false),
      { app_id: record.app_id, record_id: record.id, scope: 'hidden_android' },
    )
  }

  if (record.public && (record.ios === record.android)) {
    await updateChannelsWithRetry(
      c,
      async () => await supabaseAdmin(c)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('public', true)
        .neq('id', record.id),
      { app_id: record.app_id, record_id: record.id, scope: 'public' },
    )
  }

  return c.json(BRES)
})
