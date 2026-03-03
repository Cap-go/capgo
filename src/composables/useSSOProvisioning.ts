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
        console.error('SSO provisioning: failed to check user record (non-blocking)', userError)
      }

      if (!userRecord) {
        // User record not yet created by auth trigger — wait briefly and recheck
        // The backend handles this via auth triggers, so we just log and continue
        console.log('SSO provisioning: user record not yet created, backend trigger will handle it')
      }

      // Always call the server-side provisioning endpoint — it resolves the
      // SSO provider org from the user's email domain and checks membership
      // against that specific org. A client-side check would be too broad
      // (the user may belong to a different org but not the SSO target org).
      try {
        const provisionResponse = await fetch(`${defaultApiHost}/private/sso/provision-user`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        })

        if (!provisionResponse.ok) {
          const errorData = await provisionResponse.json().catch(() => ({ error: 'Unknown error' })) as Record<string, unknown>
          console.error('SSO provisioning: provision request failed', provisionResponse.status, errorData)
          const errorMsg = typeof errorData.error === 'string' ? errorData.error : typeof errorData.message === 'string' ? errorData.message : null
          error.value = errorMsg ?? `Provisioning failed (${provisionResponse.status})`
        }
        else {
          const provisionData = await provisionResponse.json()
          console.log('SSO provisioning: user provisioned successfully', provisionData)
        }
      }
      catch (provisionError) {
        console.error('SSO provisioning: provision request error', provisionError)
        error.value = provisionError instanceof Error ? provisionError.message : 'Provisioning request failed'
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
