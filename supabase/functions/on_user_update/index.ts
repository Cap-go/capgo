import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { checkPlan } from '../_utils/plans.ts'
import { updatePerson } from '../_utils/crisp.ts'
import type { Person } from '../_utils/crisp.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import type { UpdatePayload } from '../_utils/supabase.ts'
import { createApiKey, createStripeCustomer } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization' }, 400)

  try {
    const table: keyof Database['public']['Tables'] = 'users'
    const body = (await event.json()) as UpdatePayload<typeof table>
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return sendRes({ message: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log('Not UPDATE')
      return sendRes({ message: 'Not UPDATE' }, 200)
    }
    const record = body.record
    console.log('record', record)
    if (!record.email) {
      console.log('No email')
      return sendRes()
    }
    if (!record.id) {
      console.log('No id')
      return sendRes()
    }
    await createApiKey(record.id)
    console.log('updatePerson crisp')
    const person: Person = {
      nickname: `${record.first_name} ${record.last_name}`,
      avatar: record.image_url ? record.image_url : undefined,
      country: record.country ? record.country : undefined,
    }
    await updatePerson(record.email, person).catch((e) => {
      console.log('updatePerson error', e)
    })
    if (!record.customer_id)
      await createStripeCustomer(record.id, record.email)

    await checkPlan(record.id)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
