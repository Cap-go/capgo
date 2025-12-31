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
    console.log('🔍 [useSSODetection] checkSSO called with email:', email)

    if (!email || !email.includes('@')) {
      console.log('❌ [useSSODetection] Invalid email format')
      ssoAvailable.value = false
      return false
    }

    const domain = extractDomain(email)
    emailDomain.value = domain
    console.log('🔍 [useSSODetection] Extracted domain:', domain)

    // Don't check for public email providers
    const publicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com']
    if (publicDomains.includes(domain)) {
      console.log('❌ [useSSODetection] Public domain detected, skipping SSO check')
      ssoAvailable.value = false
      return false
    }

    isCheckingSSO.value = true
    console.log('🔍 [useSSODetection] Calling RPC: lookup_sso_provider_by_domain with p_email:', email)

    try {
      const { data, error } = await supabase
        .rpc('lookup_sso_provider_by_domain', { p_email: email })

      console.log('🔍 [useSSODetection] RPC response - data:', data, 'error:', error)

      if (error) {
        console.error('❌ [useSSODetection] Error checking SSO availability:', error)
        ssoAvailable.value = false
        return false
      }

      // RPC returns an array, get the first result
      const result: any = Array.isArray(data) ? data[0] : data
      console.log('🔍 [useSSODetection] Parsed result:', result)
      console.log('🔍 [useSSODetection] Result type:', typeof result, 'Is array:', Array.isArray(data))

      if (result && result.provider_id) {
        console.log('✅ [useSSODetection] SSO provider found!')
        console.log('  - Provider ID:', result.provider_id)
        console.log('  - Entity ID:', result.entity_id)
        console.log('  - Org ID:', result.org_id)
        console.log('  - Org Name:', result.org_name)
        ssoAvailable.value = true
        ssoProviderId.value = result.provider_id
        ssoEntityId.value = result.entity_id
        return true
      }

      console.log('❌ [useSSODetection] No SSO provider found for domain:', domain)
      ssoAvailable.value = false
      return false
    }
    catch (error) {
      console.error('❌ [useSSODetection] Exception checking SSO:', error)
      ssoAvailable.value = false
      return false
    }
    finally {
      isCheckingSSO.value = false
      console.log('🔍 [useSSODetection] checkSSO completed. ssoAvailable:', ssoAvailable.value)
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
    if (!ssoProviderId.value) {
      console.error('No SSO provider ID available')
      return
    }

    try {
      // Check if Supabase URL is local (meaning truly local testing)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
      const isLocalSupabase = supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1')

      if (isLocalSupabase && email) {
        // Use mock SSO endpoint ONLY when Supabase is local
        const relayState = redirectTo || '/dashboard'
        const mockSSOUrl = `${supabaseUrl}/functions/v1/mock-sso-callback?email=${encodeURIComponent(email)}&RelayState=${encodeURIComponent(relayState)}`

        console.log('🔧 Local Supabase detected: Using mock SSO endpoint')
        console.log('Mock SSO URL:', mockSSOUrl)
        console.log('Email:', email)
        console.log('RelayState:', relayState)

        window.location.href = mockSSOUrl
        return
      }

      // Production/Development/Preprod: Use real Supabase SAML SSO
      console.log('🔐 Using real SAML SSO with provider:', ssoProviderId.value)
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

      if (error) {
        console.error('Error initiating SSO:', error)
        throw error
      }

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
