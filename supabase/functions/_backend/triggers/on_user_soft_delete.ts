import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { cancelSubscription } from '../utils/stripe.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { addTagBento } from '../utils/bento.ts'

export const app = new Hono<MiddlewareKeyVariables>()

async function cancelUserOrgSubscriptions(c: Context, userId: string) {
  const startTime = Date.now()

  // Find orgs where this user is a super admin
  const { data: userSuperAdminOrgs } = await supabaseAdmin(c)
    .from('org_users')
    .select('org_id')
    .eq('user_id', userId)
    .eq('user_right', 'super_admin')

  if (!userSuperAdminOrgs?.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'No super_admin orgs for user', userId })
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
    cloudlog({ requestId: c.get('requestId'), message: 'Soft delete: canceling org subscriptions', count: orgs.length })

    for (const org of orgs) {
      if (org.customer_id) {
        await cancelSubscription(c, org.customer_id)
      }
    }
  }

  const duration = Date.now() - startTime
  cloudlog({ requestId: c.get('requestId'), message: 'Soft delete cancellation done', userId, duration_ms: duration })
  return c.json(BRES)
}

app.post('/', middlewareAPISecret, async (c) => {
  const body = await c.req.json<{ user_id: string, email?: string }>()
  const userId = body?.user_id
  const email = body?.email
  if (!userId) {
    cloudlog({ requestId: c.get('requestId'), message: 'on_user_soft_delete: missing user_id' })
    return c.json(BRES, 200)
  }

  // Add Bento tag as early as possible using original email
  if (email) {
    await addTagBento(c, email, { segments: ['deleted'], deleteSegments: [] })
  }

  return cancelUserOrgSubscriptions(c, userId)
})
