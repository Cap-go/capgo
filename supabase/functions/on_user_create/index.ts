import { serve } from 'https://deno.land/std@0.188.0/http/server.ts'
import type { InsertPayload } from '../_utils/supabase.ts'
import { createApiKey, createStripeCustomer, createdefaultOrg } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import { logsnag } from '../_utils/logsnag.ts'
import { addContact, trackEvent } from '../_utils/plunk.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization' }, 400)

  try {
    const table: keyof Database['public']['Tables'] = 'users'
    const body = (await event.json()) as InsertPayload<typeof table>
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return sendRes({ message: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log('Not INSERT')
      return sendRes({ message: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log('record', record)
    await Promise.all([
      createApiKey(record.id),
      createdefaultOrg(record.id, record.first_name || ''),
      addContact(record.email, {
        first_name: record.first_name || '',
        last_name: record.last_name || '',
        nickname: `${record.first_name || ''} ${record.last_name || ''}`,
        image_url: record.image_url ? record.image_url : undefined,
      }),
    ])
    console.log('createCustomer stripe')
    if (record.customer_id)
      return sendRes()
    await Promise.all([
      createStripeCustomer(record as any),
      trackEvent(record.email, {
        first_name: record.first_name || '',
        last_name: record.last_name || '',
        nickname: `${record.first_name || ''} ${record.last_name || ''}`,
      }, 'user:register'),
      logsnag.track({
        channel: 'user-register',
        event: 'User Joined',
        icon: '🎉',
        user_id: record.id,
        notify: true,
      }),
    ])
    return sendRes()
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
