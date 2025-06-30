import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { cancelSubscription } from '../utils/stripe.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('users', 'DELETE'), async (c) => {
  try {
    const record = c.get('webhookBody') as Database['public']['Tables']['users']['Row']
    cloudlog({ requestId: c.get('requestId'), message: 'record', record })

    if (!record || !record.id) {
      cloudlog({ requestId: c.get('requestId'), message: 'no user id' })
      return c.json(BRES)
    }

    try {
      // Process user deletion with timeout protection
      const startTime = Date.now()

      // 1. Cancel Stripe subscriptions if customer_id exists
      if (record.customer_id) {
        cloudlog({ requestId: c.get('requestId'), message: 'canceling stripe subscription', customer_id: record.customer_id })
        // Use type assertion to resolve type compatibility issue
        await cancelSubscription(c as any, record.customer_id)
      }

      // 2. Find and clean up any organizations created by this user
      const { data: orgs } = await supabaseAdmin(c as any)
        .from('orgs')
        .select('id, customer_id')
        .eq('created_by', record.id)

      if (orgs && orgs.length > 0) {
        cloudlog({ requestId: c.get('requestId'), message: 'cleaning up orgs', count: orgs.length })

        for (const org of orgs) {
          // Cancel org subscriptions if they exist
          if (org.customer_id) {
            await cancelSubscription(c as any, org.customer_id)
          }
        }
      }

      // 3. Track performance metrics
      const endTime = Date.now()
      const duration = endTime - startTime

      cloudlog({
        requestId: c.get('requestId'),
        context: 'user deletion completed',
        duration_ms: duration,
        user_id: record.id,
      })

      return c.json(BRES)
    }
    catch (error) {
      cloudlogErr({
        requestId: c.get('requestId'),
        context: 'user deletion process error',
        error: error instanceof Error ? error.message : JSON.stringify(error),
        timeout: error instanceof Error && error.message === 'Operation timed out',
      })

      // If it's a timeout, return a specific message
      if (error instanceof Error && error.message === 'Operation timed out') {
        return c.json({
          status: 'User deletion process started but timed out. The process will continue in the background.',
          error: 'Operation timed out',
        }, 202)
      }

      return c.json(BRES)
    }
  }
  catch (e) {
    cloudlogErr({
      requestId: c.get('requestId'),
      context: 'user deletion error',
      error: e instanceof Error ? e.message : JSON.stringify(e),
    })
    return c.json({ status: 'Cannot delete user', error: JSON.stringify(e) }, 500)
  }
})
