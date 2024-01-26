import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { middlewareKey } from '../../_utils/hono.ts'
import { checkAppOwner, getSStats, supabaseAdmin } from '../../_utils/supabase.ts'
import { checkKey } from '../../_utils/utils.ts'
import type { Order } from '../../_utils/types.ts'
import type { Database } from '../../_utils/supabase.types.ts'
// get_stats

interface dataStats {
  appId: string
  devicesId?: string[]
  search?: string
  order?: Order[]
  rangeStart?: number
  rangeEnd?: number
  after?: string
}

export const app = new Hono()

app.post('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<dataStats>()
    console.log('body', body)
    const apikey_string = c.req.header('capgkey')
    const authorization = apikey_string || c.req.header('authorization') || 'MISSING'
    if (apikey_string) {
      const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(c), ['all', 'write'])
      if (!apikey)
        return c.json({ status: 'Missing apikey' }, 400)
      if (!body.appId || !(await checkAppOwner(c, apikey.user_id, body.appId)))
        return c.json({ status: 'You can\'t access this app', app_id: body.appId }, 400)
    }
    return c.json(await getSStats(c, apikey_string === authorization ? '' : authorization, body.appId, body.devicesId, body.search, body.order, body.rangeStart, body.rangeEnd, body.after, true))
  } catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500) 
  }
})
