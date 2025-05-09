import type { TrackOptions } from '@logsnag/node'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, useCors } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { checkKey } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

// No middleware applied to this route, as we allow both authorization and capgkey for CLI and webapp access
app.post('/', async (c) => {
  try {
    const body = await c.req.json<TrackOptions>()
    console.log({ requestId: c.get('requestId'), message: 'post private/stats body', body })
    const apikey_string = c.req.header('capgkey')
    const authorization = c.req.header('authorization')
    const supabase = supabaseAdmin(c as any)
    if (apikey_string) {
      const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(c as any, apikey_string, supabase, ['read', 'write', 'all', 'upload'])
      if (!apikey) {
        console.log({ requestId: c.get('requestId'), message: 'error invalid apikey', apikey_string })
        return c.json({ status: 'Invalid apikey' }, 401)
      }
    }
    else if (authorization) {
      const { data: auth, error } = await supabase.auth.getUser(
        authorization?.split('Bearer ')[1],
      )
      if (error || !auth || !auth.user) {
        console.log({ requestId: c.get('requestId'), message: 'error no auth', auth: authorization })
        return c.json({ status: 'You can\'t access this, auth not found' }, 400)
      }
    }
    else {
      console.log({ requestId: c.get('requestId'), message: 'error no auth', auth: authorization })
      return c.json({ status: 'You can\'t access this, auth not found' }, 400)
    }
    await logsnag(c as any).track(body)
    return c.json(BRES)
  }
  catch (e) {
    console.log({ requestId: c.get('requestId'), message: 'error', error: JSON.stringify(e) })
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
