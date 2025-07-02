import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { cancelSubscription } from '../utils/stripe.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

async function deleteUser(c: Context, record: Database['public']['Tables']['users']['Row']) {
  try {
    // Process user deletion with timeout protection
    const startTime = Date.now()

    // 1. Find organizations where this user is the only super admin
    const { data: userSuperAdminOrgs } = await supabaseAdmin(c)
      .from('org_users')
      .select('org_id')
      .eq('user_id', record.id)
      .eq('user_right', 'super_admin')

    if (!userSuperAdminOrgs?.length) {
      return c.json(BRES)
    }

    // For each org where user is super admin, check if they are the only one
    const orgIds = userSuperAdminOrgs.map(org => org.org_id)
    const { data: superAdminCounts } = await supabaseAdmin(c)
      .from('org_users')
      .select('org_id')
      .in('org_id', orgIds)
      .eq('user_right', 'super_admin')

    if (!superAdminCounts) {
      return c.json(BRES)
    }

    // Count super admins per org
    const orgCounts = superAdminCounts.reduce((acc, item) => {
      acc[item.org_id] ??= 0
      acc[item.org_id] += 1
      return acc
    }, {} as Record<string, number>)

    // Get orgs where user is the only super admin
    const singleSuperAdminOrgs = orgIds.filter(orgId => orgCounts[orgId] === 1)

    if (singleSuperAdminOrgs.length === 0) {
      return c.json(BRES)
    }

    const { data: orgs } = await supabaseAdmin(c)
      .from('orgs')
      .select('id, customer_id')
      .in('id', singleSuperAdminOrgs)

    if (orgs && orgs.length > 0) {
      cloudlog({ requestId: c.get('requestId'), message: 'cleaning up orgs', count: orgs.length })

      for (const org of orgs) {
        // Cancel org subscriptions if they exist
        if (org.customer_id) {
          await cancelSubscription(c, org.customer_id)
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
  }
  return c.json(BRES)
}

app.post('/', middlewareAPISecret, triggerValidator('users', 'DELETE'), async (c) => {
  try {
    const record = c.get('webhookBody') as Database['public']['Tables']['users']['Row']
    cloudlog({ requestId: c.get('requestId'), message: 'record', record })

    if (!record?.id) {
      cloudlog({ requestId: c.get('requestId'), message: 'no user id' })
      return c.json(BRES)
    }

    return deleteUser(c, record)
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
