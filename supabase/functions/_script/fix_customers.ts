import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.1.2'
import { createCustomer } from '../_utils/stripe.ts'

const supabaseUrl = 'https://***.supabase.co'
const supabaseAnonKey = '***'

const useSupabase = () => {
  const options = {
    // const options: SupabaseClientOptions = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
  return createClient(supabaseUrl, supabaseAnonKey, options)
}
// get all users from supabase
const initCustomers = async () => {
  const { data: users } = await useSupabase()
    .from('users')
    .select()
  if (!users) {
    console.log('No users found')
    return
  }
  // iterate users and send them to stripe
  for (const user of users) {
    const customer = await createCustomer(user.email)
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
