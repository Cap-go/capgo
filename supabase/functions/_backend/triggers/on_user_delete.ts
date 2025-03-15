import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeletePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

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
    // Type assertion for record
    const record = body.record as unknown as Database['public']['Tables']['users']['Row']
    console.log({ requestId: c.get('requestId'), context: 'record', record })
    
    try {
      // Ensure record exists
      if (!record) {
        console.error({ requestId: c.get('requestId'), context: 'Missing record data' })
        return c.json(BRES)
      }
      
      // Get user ID from the record
      const userId = record.id
      
      // Get all organizations owned by the user
      // Type assertion for context
      const { data: userOrgs, error: orgsError } = await supabaseAdmin(c as any)
        .from('orgs')
        .select('id')
        .eq('created_by', userId)
      
      if (orgsError) {
        console.error({ requestId: c.get('requestId'), context: 'Error fetching user orgs', error: orgsError })
        throw new Error(`Error fetching user orgs: ${orgsError.message}`)
      }
      
      // Delete all apps from user's organizations
      if (userOrgs && userOrgs.length > 0) {
        const orgIds = userOrgs.map(org => org.id)
        
        // Get all apps from user's organizations
        const { data: orgApps, error: appsError } = await supabaseAdmin(c as any)
          .from('apps')
          .select('app_id')
          .in('owner_org', orgIds)
        
        if (appsError) {
          console.error({ requestId: c.get('requestId'), context: 'Error fetching org apps', error: appsError })
          throw new Error(`Error fetching org apps: ${appsError.message}`)
        }
        
        // Delete each app
        if (orgApps && orgApps.length > 0) {
          for (const app of orgApps) {
            const { error: deleteAppError } = await supabaseAdmin(c as any)
              .from('apps')
              .delete()
              .eq('app_id', app.app_id)
            
            if (deleteAppError) {
              console.error({ requestId: c.get('requestId'), context: `Error deleting app ${app.app_id}`, error: deleteAppError })
              throw new Error(`Error deleting app ${app.app_id}: ${deleteAppError.message}`)
            }
          }
        }
        
        // Delete all organizations owned by the user
        for (const org of userOrgs) {
          const { error: deleteOrgError } = await supabaseAdmin(c as any)
            .from('orgs')
            .delete()
            .eq('id', org.id)
          
          if (deleteOrgError) {
            console.error({ requestId: c.get('requestId'), context: `Error deleting org ${org.id}`, error: deleteOrgError })
            throw new Error(`Error deleting org ${org.id}: ${deleteOrgError.message}`)
          }
        }
      }
      
      // Delete user's Stripe customer if it exists
      if (record.customer_id) {
        const { error: deleteStripeError } = await supabaseAdmin(c as any)
          .from('stripe_info')
          .delete()
          .eq('customer_id', record.customer_id)
        
        if (deleteStripeError) {
          console.error({ requestId: c.get('requestId'), context: 'Error deleting Stripe customer', error: deleteStripeError })
          throw new Error(`Error deleting Stripe customer: ${deleteStripeError.message}`)
        }
      }
      
      // Add user email to deleted_account table to prevent reuse
      const { error: addDeletedError } = await supabaseAdmin(c as any)
        .from('deleted_account')
        .insert({ email: record.email })
      
      if (addDeletedError) {
        console.error({ requestId: c.get('requestId'), context: 'Error adding to deleted_account', error: addDeletedError })
        throw new Error(`Error adding to deleted_account: ${addDeletedError.message}`)
      }
      
      console.log({ requestId: c.get('requestId'), context: 'User deletion completed successfully', userId })
    } catch (error) {
      console.error({ requestId: c.get('requestId'), context: 'Error in user deletion process', error })
      throw error
    }
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete user', error: JSON.stringify(e) }, 500)
  }
})
