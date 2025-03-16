import type { Database } from '../_backend/utils/supabase.types.ts'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono/tiny'
import { middlewareAPISecret } from '../_backend/utils/hono.ts'

export const app = new Hono()

// Define types for queue items
interface DeletionQueueItem {
  id: string
  user_id: string
  user_email: string
  customer_id?: string
  status: 'pending' | 'completed' | 'error'
  created_at: string
  processed_at?: string
  error?: string
  retry_count: number
}

// Process a single deletion request
async function processUserDeletion(
  supabase: ReturnType<typeof createClient<Database>>,
  queueItem: DeletionQueueItem,
) {
  try {
    console.log(`Processing deletion for user ${queueItem.user_id}`)

    // 1. Handle Stripe customer if exists
    if (queueItem.customer_id) {
      const { error: stripeError } = await supabase
        .from('stripe_info')
        .update({ status: 'deleted' })
        .eq('customer_id', queueItem.customer_id)

      if (stripeError) {
        console.error('Error updating stripe_info', stripeError)
      }
    }

    // 2. Delete organizations where user is sole admin
    // Type assertion needed until the RPC is added to the Database type
    const { data: orgsToDelete } = await (supabase.rpc as any)('get_sole_admin_orgs', {
      user_id: queueItem.user_id,
    }) as { data: string[] | null, error: any }

    if (orgsToDelete && Array.isArray(orgsToDelete) && orgsToDelete.length > 0) {
      const { error: orgsError } = await supabase
        .from('orgs')
        .delete()
        .in('id', orgsToDelete as string[])

      if (orgsError) {
        console.error('Error deleting organizations', orgsError)
      }
    }

    // 3. Store email hash in deleted_account
    const { error: hashError } = await supabase
      .from('deleted_account')
      .insert({ email: queueItem.user_email })

    if (hashError) {
      console.error('Error storing email hash', hashError)
    }

    // 4. Delete the user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(queueItem.user_id)

    if (deleteError) {
      throw deleteError
    }

    // 5. Update queue item status
    // Type assertion needed until the table is added to the Database type
    // Using a more complete type assertion to fix TypeScript errors
    await (supabase as any).from('deletion_queue').update({
      status: 'completed',
      processed_at: new Date().toISOString(),
    }).eq('id', queueItem.id)

    return { success: true }
  }
  catch (error) {
    // Handle error and update queue for retry
    // Type assertion needed until the table is added to the Database type
    // Using a more complete type assertion to fix TypeScript errors
    await (supabase as any).from('deletion_queue').update({
      status: 'error',
      error: JSON.stringify(error),
      retry_count: queueItem.retry_count + 1,
      processed_at: new Date().toISOString(),
    }).eq('id', queueItem.id)

    throw error
  }
}

// Endpoint to process the queue (can be triggered by cron)
app.post('/process', middlewareAPISecret, async (c) => {
  // Use environment variables from Deno runtime
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321'
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  // Get pending deletion requests
  // Type assertion is needed until the table is properly defined in the Database type
  const { data: pendingItems, error } = await (supabase as any).from('deletion_queue').select('*').in('status', ['pending', 'error']).lt('retry_count', 3).order('created_at', { ascending: true }).limit(5) as { data: DeletionQueueItem[] | null, error: any }

  if (error) {
    return c.json({ status: 'Error fetching queue', error: JSON.stringify(error) }, 500)
  }

  if (!pendingItems || pendingItems.length === 0) {
    return c.json({ status: 'No pending deletions' }, 200)
  }

  // Process each item sequentially
  const results: Array<{ id: string, status: string, error?: string }> = []
  for (const item of pendingItems || []) {
    try {
      await processUserDeletion(supabase, item)
      results.push({ id: item.id, status: 'success' })
    }
    catch (error) {
      results.push({
        id: item.id,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return c.json({ status: 'Processing complete', results }, 200)
})

// Health check endpoint
app.get('/health', async (c) => {
  // Use environment variables from Deno runtime
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321'
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  // Check for stuck items
  // Type assertion is needed until the table is properly defined in the Database type
  const { data: stuckItems, error } = await (supabase as any).from('deletion_queue').select('count', { count: 'exact' }).in('status', ['pending', 'error']).gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) as {
    data: Array<{ count: number }> | null
    error: any
  }

  if (error) {
    return c.json({ status: 'Error checking queue health', error: JSON.stringify(error) }, 500)
  }

  const backlogCount = stuckItems?.[0]?.count || 0
  const isHealthy = backlogCount < 10

  return c.json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    backlogCount,
    timestamp: new Date().toISOString(),
  }, isHealthy ? 200 : 503)
})

// Endpoint to manually retry a specific item
app.post('/retry/:id', middlewareAPISecret, async (c) => {
  const id = c.req.param('id')

  // Use environment variables from Deno runtime
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321'
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  // Get the specific queue item
  // Type assertion is needed until the table is properly defined in the Database type
  const { data: queueItem, error } = await (supabase as any).from('deletion_queue').select('*').eq('id', id).single() as { data: DeletionQueueItem | null, error: any }

  if (error || !queueItem) {
    return c.json({ status: 'Queue item not found', error: JSON.stringify(error) }, 404)
  }

  try {
    await processUserDeletion(supabase, queueItem)
    return c.json({ status: 'Retry successful', id }, 200)
  }
  catch (error) {
    return c.json({ status: 'Retry failed', error: JSON.stringify(error) }, 500)
  }
})
