import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { CustomerInfo, Env } from './types'

let supabaseClient: SupabaseClient | null = null

/**
 * Get or create Supabase admin client
 */
function getSupabaseClient(env: Env): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  }
  return supabaseClient
}

/**
 * Look up customer info by email address
 * Searches users table and gets their organization info
 */
export async function lookupCustomerByEmail(env: Env, email: string): Promise<CustomerInfo | null> {
  // Check if Supabase is configured
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Supabase not configured, skipping customer lookup')
    return null
  }

  try {
    const supabase = getSupabaseClient(env)
    const normalizedEmail = email.toLowerCase().trim()

    console.log(`Looking up customer by email: ${normalizedEmail}`)

    // First, find the user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, image_url')
      .eq('email', normalizedEmail)
      .single()

    if (userError || !user) {
      console.log(`User not found for email ${normalizedEmail}:`, userError?.message || 'No user found')
      return null
    }

    console.log(`Found user: ${user.id} (${user.first_name} ${user.last_name})`)

    // Get the user's organizations
    const { data: orgUsers, error: orgUsersError } = await supabase
      .from('org_users')
      .select(`
        org_id,
        user_right,
        orgs (
          id,
          name,
          logo,
          management_email,
          customer_id
        )
      `)
      .eq('user_id', user.id)

    if (orgUsersError) {
      console.log(`Error fetching org_users: ${orgUsersError.message}`)
    }

    // Find the primary organization (where user is admin or super_admin, or the first one)
    let primaryOrg: {
      id: string
      name: string
      logo: string | null
      management_email: string
      customer_id: string | null
    } | null = null

    if (orgUsers && orgUsers.length > 0) {
      // Prioritize organizations where user is admin or super_admin
      const adminOrg = orgUsers.find(ou =>
        ou.user_right === 'super_admin' || ou.user_right === 'admin',
      )

      const orgData = adminOrg?.orgs || orgUsers[0]?.orgs
      if (orgData && !Array.isArray(orgData)) {
        primaryOrg = orgData
      }
    }

    const customerInfo: CustomerInfo = {
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      userImageUrl: user.image_url,
      orgId: primaryOrg?.id,
      orgName: primaryOrg?.name,
      orgLogo: primaryOrg?.logo,
      stripeCustomerId: primaryOrg?.customer_id,
    }

    console.log(`Customer info:`, {
      userId: customerInfo.userId,
      name: `${customerInfo.firstName || ''} ${customerInfo.lastName || ''}`.trim() || 'N/A',
      org: customerInfo.orgName || 'N/A',
      hasLogo: !!customerInfo.orgLogo,
    })

    return customerInfo
  }
  catch (error) {
    console.error('Error looking up customer:', error)
    return null
  }
}
