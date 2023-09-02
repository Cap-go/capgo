import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import { checkPlan } from '../_utils/plans.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import type { UpdatePayload } from '../_utils/supabase.ts'
import { createApiKey, createStripeCustomer } from '../_utils/supabase.ts'
import { updateCustomer } from '../_utils/stripe.ts'
// import { createApiKey, createStripeCustomer, getStripeCustomer } from '../_utils/supabase.ts'
// import { setBillingPeriod, updateCustomer } from '../_utils/stripe.ts'
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
    if (!record.customer_id)
      await createStripeCustomer(record as any)
    else
      await updateCustomer(record.customer_id, record.email, record.billing_email, record.id, `${record.first_name || ''} ${record.last_name || ''}`)
      // TODO: send emailing to customer to tell them that their billing will change and set auto email to the new ones.
      // const now = new Date()
      // // check if we are the 5 day of the month
      // if (now.getDate() === 5) {
      //   const customer = await getStripeCustomer(record.customer_id)
      //   if (customer?.subscription_id)
      //     await setBillingPeriod(customer.subscription_id)
      // }

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
