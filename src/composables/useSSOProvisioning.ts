import type { Session } from '@supabase/supabase-js'
import { ref } from 'vue'
import { defaultApiHost, useSupabase } from '~/services/supabase'

export function useSSOProvisioning() {
  const isProvisioning = ref(false)
  const error = ref<string | null>(null)

  async function provisionUser(session: Session): Promise<void> {
    isProvisioning.value = true
    error.value = null

    try {
      const supabase = useSupabase()
      const userId = session.user.id
      const email = session.user.email

      if (!email) {
        error.value = 'No email found in session'
        return
      }

      // Check if user has a public.users record
      // Server-side auth triggers handle creating this, but we verify
      const { data: userRecord, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle()

      if (userError) {
        console.error('SSO provisioning: failed to check user record', userError)
        error.value = 'Failed to verify user account'
        return
      }

      if (!userRecord) {
        // User record not yet created by auth trigger — wait briefly and recheck
        // The backend handles this via auth triggers, so we just log and continue
        console.log('SSO provisioning: user record not yet created, backend trigger will handle it')
      }

      // Check if user belongs to an org
      const { data: orgMembership, error: orgError } = await supabase
        .from('org_users')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()

      if (orgError) {
        console.error('SSO provisioning: failed to check org membership', orgError)
        error.value = 'Failed to verify organization membership'
        return
      }

      if (orgMembership) {
        // User already belongs to an org, no provisioning needed
        return
      }

      // User has no org — check if their email domain has an active SSO provider
      // This tells us which org they should belong to
      const domain = email.split('@')[1]
      if (!domain) {
        error.value = 'Invalid email format'
        return
      }

      try {
        const response = await fetch(`${defaultApiHost}/private/sso/check-domain`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        })

        if (!response.ok) {
          console.error('SSO provisioning: domain check failed', response.status)
          // Non-critical — org membership will be handled server-side
          return
        }

        const data = await response.json() as { has_sso: boolean, provider_id?: string, org_id?: string }

        if (data.has_sso && data.org_id) {
          // SSO provider found for this domain
          // Org membership should be handled server-side via triggers
          // Log for observability
          console.log('SSO provisioning: user domain has active SSO provider, org membership will be handled server-side')
        }
      }
      catch (fetchError) {
        // Non-critical — domain check is informational
        console.error('SSO provisioning: domain check request failed', fetchError)
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'SSO provisioning failed'
      console.error('SSO provisioning error:', message)
      error.value = message
    }
    finally {
      isProvisioning.value = false
    }
  }

  return { isProvisioning, error, provisionUser }
}
