import { serve } from 'https://deno.land/std@0.170.0/http/server.ts'
import type { Person } from '../_utils/crisp.ts'
import { addEventPerson, postPerson, updatePerson } from '../_utils/crisp.ts'
import type { InsertPayload } from '../_utils/supabase.ts'
import { createApiKey, createStripeCustomer } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import { logsnag } from '../_utils/logsnag.ts'

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
    await createApiKey(record.id)
    await postPerson(record.email, record.first_name || '', record.last_name || '', record.image_url ? record.image_url : undefined)
      .catch(() => {
        const person: Person = {
          nickname: `${record.first_name} ${record.last_name}`,
          avatar: record.image_url ? record.image_url : undefined,
          country: record.country ? record.country : undefined,
        }
        return updatePerson(record.email, person)
      })
    console.log('createCustomer stripe')
    if (record.customer_id)
      return sendRes()
    await createStripeCustomer(record.id, record.email)
    await addEventPerson(record.email, {}, 'user:register', 'green').catch()
    await logsnag.publish({
      channel: 'user-register',
      event: 'User Joined',
      icon: '🎉',
      tags: {
        'user-id': record.id,
      },
      notify: true,
    }).catch()
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
