import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import { createCustomer } from '../_utils/stripe.ts'
import 'https://deno.land/x/dotenv/load.ts'
import type { Database } from '../_utils/supabase.types.ts'

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
async function initCustomers() {
  const { data: users } = await useSupabase()
    .from('users')
    .select()
  if (!users) {
    console.log('No users found')
    return
  }
  // iterate users and send them to stripe
  for (const user of users) {
    const customer = await createCustomer(user.email, user.id, `${user.first_name} ${user.last_name}`)
    const { error: dbStripeError } = await useSupabase()
      .from('stripe_info')
      .insert({
        customer_id: customer.id,
      })
    if (dbStripeError) {
      console.log(dbStripeError)
      return
    }
    const { error: dbError } = await useSupabase()
      .from('users')
      .update({
        customer_id: customer.id,
      })
      .eq('email', user.email)
    if (dbError) {
      console.log(dbError)
      return
    }
  }
}

initCustomers()
