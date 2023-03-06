import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.1.2'
import 'https://deno.land/x/dotenv/load.ts'
import { customerToSegment } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import type { Person } from '../_utils/crisp.ts'
import { postPerson, updatePerson } from '../_utils/crisp.ts'

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
  for (const record of users) {
    // cupdate crisp segment add Capgo one
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
    }
    catch (e) {
      console.log('missing person', record.email)
      await postPerson(record.email, record.first_name || '', record.last_name || '', record.image_url ? record.image_url : undefined)
      await updatePerson(record.email, person, segment)
    }
    // break
  }
}

fixCrisp()
