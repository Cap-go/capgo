import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('channels', 'UPDATE'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['channels']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No id' })
    throw simpleError('no_id', 'No id', { record })
  }
  if (!record.app_id) {
    throw simpleError('no_app_id', 'No app id included the request', { record })
  }

  if (record.public && record.ios) {
    const { error: iosError } = await supabaseAdmin(c)
      .from('channels')
      .update({ public: false })
      .eq('app_id', record.app_id)
      .eq('ios', true)
      .neq('id', record.id)
    const { error: hiddenError } = await supabaseAdmin(c)
      .from('channels')
      .update({ public: false })
      .eq('app_id', record.app_id)
      .eq('android', false)
      .eq('ios', false)
    if (iosError || hiddenError)
      cloudlog({ requestId: c.get('requestId'), message: 'error', error: iosError ?? hiddenError })
  }

  if (record.public && record.android) {
    const { error: androidError } = await supabaseAdmin(c)
      .from('channels')
      .update({ public: false })
      .eq('app_id', record.app_id)
      .eq('android', true)
      .neq('id', record.id)
    const { error: hiddenError } = await supabaseAdmin(c)
      .from('channels')
      .update({ public: false })
      .eq('app_id', record.app_id)
      .eq('android', false)
      .eq('ios', false)
    if (androidError || hiddenError)
      cloudlog({ requestId: c.get('requestId'), message: 'error', error: androidError ?? hiddenError })
  }

  if (record.public && (record.ios === record.android)) {
    const { error } = await supabaseAdmin(c)
      .from('channels')
      .update({ public: false })
      .eq('app_id', record.app_id)
      .eq('public', true)
      .neq('id', record.id)
    if (error)
      cloudlog({ requestId: c.get('requestId'), message: 'error', error })
  }

  return c.json(BRES)
})
