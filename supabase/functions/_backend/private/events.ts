import type { Context } from '@hono/hono'
import type { TrackOptions } from '@logsnag/node'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, useCors } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { checkKey } from '../utils/utils.ts'

export const app = new Hono()

app.use('/', useCors)

// No middleware applied to this route, as we allow both authorization and capgkey for CLI and webapp access
app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<TrackOptions>()
    console.log({ requestId: c.get('requestId'), context: 'post private/stats body', body })
    const apikey_string = c.req.header('capgkey')
    const authorization = c.req.header('authorization')
    const supabase = supabaseAdmin(c)
    if (apikey_string) {
      const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c, apikey_string, supabase, ['read'])
      if (!apikey)
        return c.json({ status: 'Invalid apikey' }, 400)
    }
    else if (authorization) {
      const { data: auth, error } = await supabase.auth.getUser(
        authorization?.split('Bearer ')[1],
      )
      if (error || !auth || !auth.user)
        return c.json({ status: 'not authorize' }, 400)
    }
    else {
      console.log({ requestId: c.get('requestId'), context: 'error no auth', auth: authorization })
      return c.json({ status: 'You can\'t access this, auth not found' }, 400)
    }
    await logsnag(c).track(body)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
