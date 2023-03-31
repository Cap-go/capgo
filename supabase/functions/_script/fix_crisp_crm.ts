import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import 'https://deno.land/x/dotenv/load.ts'
import { customerToSegment, isTrial } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import type { Person } from '../_utils/crisp.ts'
import { addDataPerson, postPerson, updatePerson } from '../_utils/crisp.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '***'
const supabaseAnonKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '***'

const useSupabase = () => {
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
const fixCrisp = async () => {
  const { data: users } = await useSupabase()
    .from('users')
    .select()
  if (!users) {
    console.log('No users found')
    return
  }
  // iterate users and send them to stripe
  // let skip = true
  for (const record of users) {
    // cupdate crisp segment add Capgo one
    // to skip already done
    // if (record.email === 'unknow.unknow@unknow.com' && skip)
    //   skip = false
    // else if (skip)
    //   continue
    if (record.email === 'unknow.unknow@unknow.com')
      continue

    const person: Person = {
      nickname: `${record.first_name} ${record.last_name}`,
      avatar: record.image_url ? record.image_url : undefined,
      country: record.country ? record.country : undefined,
    }
    let segment = ['Capgo']
    const { data: customer } = await useSupabase()
      .from('stripe_info')
      .select()
      .eq('customer_id', record.customer_id)
      .single()
    if (customer) {
      if (customer.product_id === 'free' && !(await isTrial(record.id)))
        continue
      const { data: plan } = await useSupabase()
        .from('plans')
        .select()
        .eq('stripe_id', customer.product_id)
        .single()
      if (plan)
        segment = await customerToSegment(record.id, customer, plan)
    }
    console.log('record.email', record.email, segment)
    try {
      await updatePerson(record.email, person, segment)
      await addDataPerson(record.email, {
        status: customer?.status || 'failed',
        id: record.id,
        customer_id: record.customer_id || undefined,
        product_id: customer?.product_id || undefined,
        price_id: customer?.price_id || undefined,
      })
    }
    catch (e) {
      console.log('missing person', record.email)
      await postPerson(record.email, record.first_name || '', record.last_name || '', record.image_url ? record.image_url : undefined)
      await updatePerson(record.email, person, segment)
      await addDataPerson(record.email, {
        status: customer?.status || 'failed',
        id: record.id,
        customer_id: record.customer_id || undefined,
        product_id: customer?.product_id || undefined,
        price_id: customer?.price_id || undefined,
      })
    }
    // break
  }
}

fixCrisp()
