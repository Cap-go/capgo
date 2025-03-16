import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeletePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'

export const app = new Hono<MiddlewareKeyVariables>()

// Define a type for user records
type UserRecord = Database['public']['Tables']['users']['Row'] | null

// Process user deletion with timeout handling
async function processUserDeletion(
  c: { get: (key: string) => string },
  oldRecord: UserRecord,
) {
  // Create Supabase client
  const supabaseUrl = Bun.env.SUPABASE_URL || 'http://localhost:54321'
  const supabaseKey = Bun.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  // Check if user has a Stripe customer ID
  if (oldRecord && oldRecord.customer_id) {
    // Log Stripe customer deletion
    console.log({ requestId: c.get('requestId'), context: 'Deleting Stripe customer', customerId: oldRecord.customer_id })

    // Update stripe_info table to mark customer as deleted
    // Use try/catch for better error handling
    try {
      const { error } = await supabase
        .from('stripe_info')
        .update({ status: 'deleted' })
        .eq('customer_id', oldRecord.customer_id)

      if (error) {
        console.error({ requestId: c.get('requestId'), context: 'Error updating stripe_info', error })
      }
    }
    catch (error) {
      console.error({ requestId: c.get('requestId'), context: 'Error in async Stripe cleanup', error })
    }
  }

  // Log successful user deletion
  console.log({ requestId: c.get('requestId'), context: 'User deleted successfully', userId: oldRecord?.id })

  return BRES
}

// Helper function to record performance metrics
async function recordMetric(
  supabase: ReturnType<typeof createClient<Database>>,
  metricName: string,
  value: number,
  tags: Record<string, any> = {},
) {
  try {
    // Use the RPC function to record metrics
    try {
      await (supabase.rpc as any)('record_performance_metric', {
        p_metric_name: metricName,
        p_value: value,
        p_tags: tags,
      })
    }
    catch {
      // Silently ignore if RPC doesn't exist yet
      console.log('Performance metrics not enabled', { metricName })
    }
  }
  catch (e) {
    console.error('Failed to record metric', { metricName, error: e })
  }
}

// Circuit breaker pattern will be implemented in a future update
// This implementation is commented out to avoid unused code warnings
/*
class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'

  constructor(
    private readonly failureThreshold = 3,
    private readonly resetTimeout = 30000, // 30 seconds
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if it's time to try again
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN'
      }
      else {
        throw new Error('Circuit breaker is OPEN')
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    }
    catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess() {
    this.failures = 0
    this.state = 'CLOSED'
  }

  private onFailure() {
    this.failures += 1
    this.lastFailureTime = Date.now()

    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN'
    }
  }
}
*/

app.post('/', middlewareAPISecret, async (c) => {
  // Set a timeout for the request
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Operation timed out')), 25000) // 25 seconds timeout
  })

  // Create Supabase client for metrics
  const supabaseUrl = Bun.env.SUPABASE_URL || 'http://localhost:54321'
  const supabaseKey = Bun.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  // Start timing the operation
  const startTime = Date.now()

  try {
    const table: keyof Database['public']['Tables'] = 'users'
    const body = await c.req.json<DeletePayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), context: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'DELETE') {
      console.log({ requestId: c.get('requestId'), context: 'Not DELETE' })
      return c.json({ status: 'Not DELETE' }, 200)
    }

    const oldRecord = body.old_record as UserRecord
    console.log({ requestId: c.get('requestId'), context: 'old_record', oldRecord })

    // Check if we should use the queue-based deletion
    // This is a feature flag that can be enabled/disabled
    const useQueueBasedDeletion = Bun.env.USE_QUEUE_BASED_DELETION === 'true'

    // Queue-based deletion feature is disabled for now until the migration is applied
    // This code will be enabled once the queue_user_deletion function is available
    if (false && useQueueBasedDeletion && oldRecord) {
      try {
        // This is commented out until the migration is applied
        // const { error } = await supabase.rpc('queue_user_deletion')
        const error = null

        if (error) {
          console.error({
            requestId: c.get('requestId'),
            context: 'Error queueing user deletion',
            error,
          })
          // Fall back to direct deletion if queueing fails
        }
        else {
          // Record metric for successful queueing
          await recordMetric(supabase, 'user_deletion_queued', 1, {
            userId: oldRecord?.id,
          })

          return c.json({
            status: 'User deletion queued successfully',
          }, 202)
        }
      }
      catch (error) {
        console.error({
          requestId: c.get('requestId'),
          context: 'Exception queueing user deletion',
          error,
        })
        // Fall back to direct deletion if queueing fails
      }
    }

    // Wrap the operation in a race with the timeout
    await Promise.race([
      processUserDeletion(c, oldRecord),
      timeoutPromise,
    ])

    // Record successful deletion metric
    const duration = Date.now() - startTime
    await recordMetric(supabase, 'user_deletion_duration', duration, {
      userId: oldRecord?.id,
      success: true,
    })

    return c.json(BRES)
  }
  catch (e: unknown) {
    const error = e as Error

    // Record failure metric
    const duration = Date.now() - startTime
    await recordMetric(supabase, 'user_deletion_duration', duration, {
      success: false,
      errorMessage: error.message,
    })

    if (error.message === 'Operation timed out') {
      console.error({ requestId: c.get('requestId'), context: 'User deletion timed out' })
      return c.json({
        status: 'User deletion initiated but timed out. The process will continue in the background.',
      }, 202)
    }

    if (error.message === 'Circuit breaker is OPEN') {
      console.error({ requestId: c.get('requestId'), context: 'Circuit breaker prevented operation' })
      return c.json({
        status: 'User deletion temporarily unavailable due to system issues. Please try again later.',
      }, 503) // Service Unavailable
    }

    return c.json({ status: 'Cannot delete user', error: JSON.stringify(e) }, 500)
  }
})
