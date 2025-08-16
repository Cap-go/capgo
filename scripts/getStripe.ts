import Stripe from 'stripe'

const s = new Stripe('', {
  apiVersion: '2025-07-30.basil',
  httpClient: Stripe.createFetchHttpClient(),
})

// Retrieve a specific subscription by ID
const subscription = await s.subscriptions.retrieve(
  'sub_1RE5vhGH46eYKnWwi0wv2n2q',
  {
    expand: ['items.data.price'], // Expand price details if needed
  }
);

console.log({
  context: 'getSubscriptionData',
  // subscriptionsFound: subscriptions.data.length, // Removed - retrieve returns one or throws
  subscriptionId: subscription.id,
  subscriptionStatus: subscription.status,
})

let productId: string | null = null
if (subscription.items.data.length > 0) {
  const item = subscription.items.data[0]
  // Ensure price and product are objects before accessing properties
  if (typeof item.price === 'object' && item.price !== null && typeof item.price.product === 'string') {
    productId = item.price.product
  }
  else {
    console.warn({ context: 'getSubscriptionData', message: 'Price or product data missing/invalid type in subscription item', itemId: item.id })
  }
}

// Format dates from epoch to ISO string
// Access cycle dates from the first item
const firstItem = subscription.items.data.length > 0 ? subscription.items.data[0] : null;

const cycleStart = firstItem?.current_period_start
  ? new Date(firstItem.current_period_start * 1000).toISOString()
  : null;

const cycleEnd = firstItem?.current_period_end
  ? new Date(firstItem.current_period_end * 1000).toISOString()
  : null;

console.log('subscription', subscription)

const subscriptionData = {
  productId,
  status: subscription.status,
  cycleStart,
  cycleEnd,
  subscriptionId: subscription.id,
  cancel_at_period_end: subscription.cancel_at_period_end,
}
console.log({
  context: 'getSubscriptionData',
  subscriptionData,
})

let dbStatus: 'succeeded' | 'canceled' | undefined

if (subscriptionData) {
  if (subscriptionData.status === 'canceled') {
    // Only apply 'active until period end' logic if Stripe status is 'canceled'
    if (subscriptionData.cycleEnd && new Date(subscriptionData.cycleEnd) > new Date()) {
      dbStatus = 'succeeded' // Still active until period end because cycleEnd is future
    } else {
      dbStatus = 'canceled' // Truly canceled because cycleEnd is past or null
    }
  } else if (subscriptionData.status === 'active') {
    // Active subscriptions are always considered succeeded
    dbStatus = 'succeeded'
  } else {
    // All other statuses (past_due, unpaid, incomplete, incomplete_expired) are considered canceled immediately
    dbStatus = 'canceled'
  }
}
else {
  // No active subscription found in Stripe
  dbStatus = 'canceled'
}

console.log({
  context: 'getSubscriptionData',
  subscriptionData,
  dbStatus,
})
