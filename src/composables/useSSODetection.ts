/**
 * SSO Detection Composable
 *
 * Detects if an email domain has SSO enabled and provides methods
 * to initiate SSO authentication flow.
 *
 * Usage:
 * ```ts
 * const { checkSSO, ssoAvailable, initiateSSO } = useSSODetection()
 * await checkSSO('user@company.com')
 * if (ssoAvailable.value) {
 *   await initiateSSO()
 * }
 * ```
 */

import { ref } from 'vue'
import { useSupabase } from '~/services/supabase'

export function useSSODetection() {
  const supabase = useSupabase()
  const ssoAvailable = ref(false)
  const ssoProviderId = ref<string | null>(null)
  const ssoEntityId = ref<string | null>(null)
  const isCheckingSSO = ref(false)
  const emailDomain = ref<string | null>(null)

  /**
   * Extract domain from email address
   */
  function extractDomain(email: string): string {
    return email.split('@')[1]?.toLowerCase() || ''
  }

  /**
   * Check if SSO is available for the given email domain
   * Calls the database function lookup_sso_provider_by_domain
   */
  async function checkSSO(email: string): Promise<boolean> {
    if (!email || !email.includes('@')) {
      ssoAvailable.value = false
      return false
    }

    const domain = extractDomain(email)
    emailDomain.value = domain

    // Don't check for public email providers
    const publicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com']
    if (publicDomains.includes(domain)) {
      ssoAvailable.value = false
      return false
    }

    isCheckingSSO.value = true

    try {
      // Use public backend endpoint that doesn't require authentication
      const apiUrl = import.meta.env.VITE_SUPABASE_URL?.replace('/rest/v1', '') || ''
      const response = await fetch(`${apiUrl}/functions/v1/sso_check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        ssoAvailable.value = false
        return false
      }

      const result = await response.json() as { available: boolean, provider_id?: string, entity_id?: string }

      if (result.available && result.provider_id) {
        ssoAvailable.value = true
        ssoProviderId.value = result.provider_id
        ssoEntityId.value = result.entity_id || null
        return true
      }

      ssoAvailable.value = false
      return false
    }
    catch {
      ssoAvailable.value = false
      return false
    }
    finally {
      isCheckingSSO.value = false
    }
  }

  /**
   * Initiate SSO authentication flow
   * Redirects user to IdP for authentication
   *
   * In production: Redirects to Okta SAML IdP
   * In local dev: Redirects to mock SSO endpoint
   */
  async function initiateSSO(redirectTo?: string, email?: string): Promise<void> {
    if (!ssoProviderId.value)
      return

    try {
      // Check if Supabase URL is local (meaning truly local testing)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
      const isLocalSupabase = supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1')

      if (isLocalSupabase && email) {
        // Use mock SSO endpoint ONLY when Supabase is local
        const relayState = redirectTo || '/dashboard'
        const mockSSOUrl = `${supabaseUrl}/functions/v1/mock-sso-callback?email=${encodeURIComponent(email)}&RelayState=${encodeURIComponent(relayState)}`

        window.location.href = mockSSOUrl
        return
      }

      // Production/Development/Preprod: Use real Supabase SAML SSO
      const options: any = {
        provider: 'saml',
        options: {
          providerId: ssoProviderId.value,
        },
      }

      // Add redirect URL if provided
      if (redirectTo) {
        options.options.redirectTo = `${window.location.origin}${redirectTo}`
      }

      const { data, error } = await supabase.auth.signInWithSSO(options)

      if (error)
        throw error

      // Redirect to SSO provider (Okta)
      if (data?.url) {
        window.location.href = data.url
      }
    }
    catch (error) {
      console.error('Exception initiating SSO:', error)
      throw error
    }
  }

  /**
   * Reset SSO detection state
   */
  function reset() {
    ssoAvailable.value = false
    ssoProviderId.value = null
    ssoEntityId.value = null
    emailDomain.value = null
  }

  return {
    ssoAvailable,
    ssoProviderId,
    ssoEntityId,
    isCheckingSSO,
    emailDomain,
    checkSSO,
    initiateSSO,
    reset,
  }
}
