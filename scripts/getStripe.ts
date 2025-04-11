import Stripe from 'stripe'

const s = new Stripe('', {
  apiVersion: '2025-02-24.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const subscriptions = await s.subscriptions.list({
  customer: '',
  status: 'active', // only get active subscriptions
  expand: ['data.items.data.price'],
  limit: 1,
})

console.log({
  subscriptionsFound: subscriptions.data.length,
  subscriptionIds: subscriptions.data.map(s => s.id),
  subscriptionItems: subscriptions.data,
})
