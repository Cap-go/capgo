import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { BRES, middlewareAPISecret } from '../../_utils/hono.ts';
import { InsertPayload, createApiKey, createStripeCustomer, createdefaultOrg } from '../../_utils/supabase.ts';
import { Database } from '../../_utils/supabase.types.ts';
import { addContact, trackEvent } from '../../_utils/plunk.ts';
import { logsnag } from '../../_utils/logsnag.ts';

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'users'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log('Not INSERT')
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log('record', record)
    await Promise.all([
      createApiKey(c, record.id),
      createdefaultOrg(c, record.id, record.first_name || ''),
      addContact(c, record.email, {
        first_name: record.first_name || '',
        last_name: record.last_name || '',
        nickname: `${record.first_name || ''} ${record.last_name || ''}`,
        image_url: record.image_url ? record.image_url : undefined,
      }),
    ])
    console.log('createCustomer stripe')
    if (record.customer_id)
      return c.json(BRES)
    const LogSnag = logsnag(c)
    await Promise.all([
      createStripeCustomer(c, record as any),
      trackEvent(c, record.email, {
        first_name: record.first_name || '',
        last_name: record.last_name || '',
        nickname: `${record.first_name || ''} ${record.last_name || ''}`,
      }, 'user:register'),
      LogSnag.track({
        channel: 'user-register',
        event: 'User Joined',
        icon: '🎉',
        user_id: record.id,
        notify: true,
      }),
    ])
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot process user', error: JSON.stringify(e) }, 500)
  }
})
