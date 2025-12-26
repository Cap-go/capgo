import type { Database } from '../../utils/supabase.types.ts'
import { getBodyOrQuery, honoFactory } from '../../utils/hono.ts'
import { middlewareKey } from '../../utils/hono_middleware.ts'
import { deleteWebhook } from './delete.ts'
import { get } from './get.ts'
import { getDeliveries, retryDelivery } from './deliveries.ts'
import { post } from './post.ts'
import { put } from './put.ts'
import { test } from './test.ts'

export const app = honoFactory.createApp()

// List all webhooks for org
app.get('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return get(c, body, apikey)
})

// Create webhook
app.post('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return post(c, body, apikey)
})

// Update webhook
app.put('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return put(c, body, apikey)
})

// Delete webhook
app.delete('/', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return deleteWebhook(c, body, apikey)
})

// Test webhook
app.post('/test', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return test(c, body, apikey)
})

// Get webhook deliveries
app.get('/deliveries', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return getDeliveries(c, body, apikey)
})

// Retry a failed delivery
app.post('/deliveries/retry', middlewareKey(['all', 'write']), async (c) => {
  const body = await getBodyOrQuery<any>(c)
  const apikey = c.get('apikey') as Database['public']['Tables']['apikeys']['Row']
  return retryDelivery(c, body, apikey)
})
