import { createClient } from 'https://esm.sh/@supabase/supabase-js@^1.35.3'
import { createCustomer } from './stripe.ts'
import type { definitions } from './types_supabase.ts'

// get all users from supabase
const initCustomers = async () => {
  const supabase = createClient(
    'https://aucsybvnhavogdmzwtcw.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1Y3N5YnZuaGF2b2dkbXp3dGN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY1MzU4NzE2OCwiZXhwIjoxOTY5MTYzMTY4fQ.GhdrbI342XQEUQG913dQ7XAu9dGNB_s7jOXCaAxhIk8',
  )
  const { data: users } = await supabase
    .from<definitions['users']>('users')
    .select()
  if (!users) {
    console.log('No users found')
    return
  }
  // iterate users and send them to stripe
  for (const user of users) {
    const customer = await createCustomer('sk_test_51K1SWEGH46eYKnWwlgifxLXnfrMnHjI66LujEcqSfBWjDAEc7r9mA7IV2STq2IrcN0eGCFJNkLIREeHAwqRSXSmx00K8bmp3dO', user.email)
    const { error: dbStripeError } = await supabase
      .from<definitions['stripe_info']>('stripe_info')
      .insert({
        customer_id: customer.id,
      })
    if (dbStripeError) {
      console.error(dbStripeError)
      return
    }
    const { error: dbError } = await supabase
      .from<definitions['users']>('users')
      .update({
        customer_id: customer.id,
      })
      .eq('email', user.email)
    if (dbError) {
      console.error(dbError)
      return
    }
  }
}

initCustomers()
