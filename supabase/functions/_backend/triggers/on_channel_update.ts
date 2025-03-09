import type { UpdatePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { BRES, honoFactory, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = honoFactory.createApp()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'channels'
    const body = await c.req.json<UpdatePayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), context: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log({ requestId: c.get('requestId'), context: 'Not UPDATE' })
      return c.json({ status: 'Not UPDATE' }, 200)
    }
    const record = body.record as Database['public']['Tables']['channels']['Row']
    console.log({ requestId: c.get('requestId'), context: 'record', record })

    if (!record.id) {
      console.log({ requestId: c.get('requestId'), context: 'No id' })
      return c.json(BRES)
    }
    if (!record.app_id) {
      return c.json({
        status: 'error app_id',
        error: 'Np app id included the request',
      }, 500)
    }

    if (record.public && record.ios) {
      const { error: iosError } = await supabaseAdmin(c as any)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('ios', true)
        .neq('id', record.id)
      const { error: hiddenError } = await supabaseAdmin(c as any)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('android', false)
        .eq('ios', false)
      if (iosError || hiddenError)
        console.log({ requestId: c.get('requestId'), context: 'error', error: iosError || hiddenError })
    }

    if (record.public && record.android) {
      const { error: androidError } = await supabaseAdmin(c as any)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('android', true)
        .neq('id', record.id)
      const { error: hiddenError } = await supabaseAdmin(c as any)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('android', false)
        .eq('ios', false)
      if (androidError || hiddenError)
        console.log({ requestId: c.get('requestId'), context: 'error', error: androidError || hiddenError })
    }

    if (record.public && (record.ios === record.android)) {
      const { error } = await supabaseAdmin(c as any)
        .from('channels')
        .update({ public: false })
        .eq('app_id', record.app_id)
        .eq('public', true)
        .neq('id', record.id)
      if (error)
        console.log({ requestId: c.get('requestId'), context: 'error', error })
    }

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot update channel', error: JSON.stringify(e) }, 500)
  }
})
