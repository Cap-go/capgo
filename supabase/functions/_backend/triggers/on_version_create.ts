import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { InsertPayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), context: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log({ requestId: c.get('requestId'), context: 'Not INSERT' })
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log({ requestId: c.get('requestId'), context: 'record', record })

    if (!record.id) {
      console.log({ requestId: c.get('requestId'), context: 'No id' })
      return c.json(BRES)
    }

    const { error: errorUpdate } = await supabaseAdmin(c as any)
      .from('apps')
      .update({
        last_version: record.name,
      })
      .eq('app_id', record.app_id)
      .eq('owner_org', record.owner_org)
    if (errorUpdate)
      console.log({ requestId: c.get('requestId'), context: 'errorUpdate', errorUpdate })

    if (!record.app_id) {
      return c.json({
        status: 'error app_id',
        error: 'Np app id included the request',
      }, 500)
    }

    // create app version meta
    const { error: dbError } = await supabaseAdmin(c as any)
      .from('app_versions_meta')
      .insert({
        id: record.id,
        app_id: record.app_id,
        owner_org: record.owner_org,
        checksum: '',
        size: 0,
      })
    if (dbError)
      console.error({ requestId: c.get('requestId'), context: 'Cannot create app version meta', error: dbError })
    return c.json(BRES) // skip delete s3 and increment size in new upload
  }
  catch (e) {
    return c.json({ status: 'Cannot create version', error: JSON.stringify(e) }, 500)
  }
})
