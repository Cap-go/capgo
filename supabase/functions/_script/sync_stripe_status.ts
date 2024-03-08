// Import statements for Supabase and Stripe
// Ensure these are compatible with your environment.
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Initialize Supabase client
const supabaseUrl = 'https://****.supabase.co'
const supabaseAnonKey = '****'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Initialize Stripe client
const stripe = Stripe('****')

async function updateStripeStatus() {
  // Fetch all customer_ids from Supabase
  const { data: stripeInfos, error } = await supabase
    .from('stripe_info')
    .select('subscription_id, customer_id, status')

  if (error) {
    console.error('Error fetching data from Supabase:', error)
    return
  }

  for (const stripeInfo of stripeInfos) {
    // Retrieve subscription from Stripe
    if (stripeInfo.subscription_id === 'free') {
      console.log('this customer is free', stripeInfo.customer_id)
      continue
    }
    if (!stripeInfo.subscription_id) {
      // skip this one
      continue
    }
    try {
      const subscription = await stripe.subscriptions.retrieve(stripeInfo.subscription_id)
      // Check if the subscription status is not succeeded
      if (subscription.status !== 'active' && stripeInfo.status === 'succeeded') {
        // Update the status in Supabase to canceled
        console.log('this customer is wrong status', stripeInfo.customer_id, subscription.status, stripeInfo.status)
        const { error: updateError } = await supabase
          .from('stripe_info')
          .update({ status: 'canceled' })
          .match({ customer_id: stripeInfo.customer_id })

        if (updateError)
          console.error('Error updating status in Supabase:', updateError)
        else
          console.log(`Updated status to canceled for customer_id: ${stripeInfo.customer_id}`)
      }
    }
    catch (err) {
      console.log('err', err)
    }
  }
}

// Run the function
updateStripeStatus()
