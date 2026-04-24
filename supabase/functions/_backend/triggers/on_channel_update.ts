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
type ChannelRow = Database['public']['Tables']['channels']['Row']
type ChannelPlatformScope = 'ios' | 'android' | 'electron'

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

async function getCurrentChannel(
  c: Context<MiddlewareKeyVariables>,
  channelId: number,
): Promise<Pick<ChannelRow, 'id' | 'app_id' | 'public' | 'ios' | 'android' | 'electron' | 'updated_at' | 'created_at'> | null> {
  const { data, error } = await supabaseAdmin(c)
    .from('channels')
    .select('id, app_id, public, ios, android, electron, updated_at, created_at')
    .eq('id', channelId)
    .maybeSingle()

  if (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to reload current channel state',
      error,
      channelId,
    })
    return null
  }

  return data
}

async function isCurrentPublicWinner(
  c: Context<MiddlewareKeyVariables>,
  record: Pick<ChannelRow, 'id' | 'app_id'>,
  scope: ChannelPlatformScope,
) {
  const currentRecord = await getCurrentChannel(c, record.id)
  if (!currentRecord?.public || !currentRecord[scope])
    return false

  const { data: winner, error } = await supabaseAdmin(c)
    .from('channels')
    .select('id')
    .eq('app_id', currentRecord.app_id)
    .eq('public', true)
    .eq(scope, true)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to resolve current public channel winner',
      error,
      app_id: currentRecord.app_id,
      channelId: currentRecord.id,
      scope,
    })
    return false
  }

  return winner?.id === currentRecord.id
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
    if (await isCurrentPublicWinner(c, record, 'ios')) {
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
    }
  }

  if (record.public && record.android) {
    if (await isCurrentPublicWinner(c, record, 'android')) {
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
    }
  }

  if (record.public && record.electron) {
    if (await isCurrentPublicWinner(c, record, 'electron')) {
      await updateChannelsWithRetry(
        c,
        async () => await supabaseAdmin(c)
          .from('channels')
          .update({ public: false })
          .eq('app_id', record.app_id)
          .eq('electron', true)
          .neq('id', record.id),
        { app_id: record.app_id, record_id: record.id, scope: 'electron' },
      )
    }
  }

  return c.json(BRES)
})
