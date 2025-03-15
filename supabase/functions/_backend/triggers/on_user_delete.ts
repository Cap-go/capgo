import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeletePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
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

    const oldRecord = body.old_record
    console.log({ requestId: c.get('requestId'), context: 'old_record', oldRecord })

    // Create Supabase client
    const supabaseUrl = Bun.env.SUPABASE_URL || 'http://localhost:54321'
    const supabaseKey = Bun.env.SUPABASE_SERVICE_ROLE_KEY || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if user has a Stripe customer ID
    if (oldRecord && oldRecord.customer_id) {
      // Delete Stripe customer if needed
      // This would typically call a Stripe API to delete the customer
      console.log({ requestId: c.get('requestId'), context: 'Deleting Stripe customer', customerId: oldRecord.customer_id })

      // Update stripe_info table to mark customer as deleted
      const { error } = await supabase
        .from('stripe_info')
        .update({ status: 'deleted' })
        .eq('customer_id', oldRecord.customer_id)

      if (error) {
        console.error({ requestId: c.get('requestId'), context: 'Error updating stripe_info', error })
      }
    }

    // Log successful user deletion
    console.log({ requestId: c.get('requestId'), context: 'User deleted successfully', userId: oldRecord?.id })

    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete user', error: JSON.stringify(e) }, 500)
  }
})
