import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import type { UpdatePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'channels'
    const body = await c.req.json<UpdatePayload<typeof table>>()
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log('Not UPDATE')
      return c.json({ status: 'Not UPDATE' }, 200)
    }
    const record = body.record
    console.log('record', record)
    if (!record.app_id) {
      return c.json({
        status: 'error app_id',
        error: 'Np app id included the request',
      }, 500)
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
        console.log('error', iosError || hiddenError)
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
        console.log('error', androidError || hiddenError)
    }

    if (record.public && (record.ios === record.android)) {
      const { error } = await supabaseAdmin(c)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('public', true)
        .neq('id', record.id)
      if (error)
        console.log('error', error)
    }

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot update channel', error: JSON.stringify(e) }, 500)
  }
})
