import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import 'https://deno.land/x/dotenv/load.ts'
import { customerToSegment, isTrial } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { addContact } from '../_utils/plunk.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '***'
const supabaseAnonKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '***'

function useSupabase() {
  const options = {
    // const options: SupabaseClientOptions = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey, options)
}
// get all users from supabase
async function fixPlunk() {
  const { data: users } = await useSupabase()
    .from('users')
    .select()
  if (!users) {
    console.log('No users found')
    return
  }
  //   display  user number
  console.log('users', users.length)
  // iterate users and send them to stripe
  let skip = true
  // const all = []
  for (const record of users) {
    // update plunk segment add Capgo one
    // to skip already done
    if (record.email === 'unknow.unknow@unknow.com' && skip)
      skip = false
    else if (skip)
      continue
    if (record.email === 'unknow.unknow@unknow.com')
      continue
    console.log('record.email', record.email)
    let segment = ['Capgo']
    const { data: customer } = await useSupabase()
      .from('stripe_info')
      .select()
      .eq('customer_id', record.customer_id)
      .single()
    console.log('1')
    if (customer) {
      let isTrialUser = 0
      try {
        isTrialUser = await isTrial(record.id)
      }
      catch (e) {
        console.log('cannot isTrial', record.id, e)
      }
      console.log('2')
      if (customer.product_id !== 'free' && !isTrialUser) {
        console.log('2.5')
        const { data: plan } = await useSupabase()
          .from('plans')
          .select()
          .eq('stripe_id', customer.product_id)
          .single()
        if (plan)
          segment = await customerToSegment(record.id, customer, plan)
        console.log('3')
      }
      console.log('2.9')
    }
    console.log('record.email', record.email, segment)
    await addContact(record.email, {
      nickname: `${record.first_name} ${record.last_name}`,
      avatar: record.image_url ? record.image_url : undefined,
      country: record.country ? record.country : undefined,
      status: customer?.status || 'failed',
      id: record.id,
      customer_id: record.customer_id || undefined,
      product_id: customer?.product_id || undefined,
      price_id: customer?.price_id || undefined,
      segment,
    }).catch(e => console.log('cannot add person', record.email, e.response.data))
      .then(() => Promise.resolve(true))
    console.log('4')
  }
  console.log('5')

  // try {
  //   await Promise.all(all)
  // }
  // catch (e) {
  //   console.log('cannot add ', e)
  // }
}

fixPlunk()
