<script setup lang="ts">
/**
 * Organization SSO/SAML Configuration UI Component
 *
 * This component provides a user interface for super admins to configure
 * SAML-based Single Sign-On (SSO) for their organization.
 *
 * FEATURES:
 * - Configure SAML SSO with Identity Provider (IdP)
 * - Display Capgo SAML metadata (Entity ID, ACS URL) for IdP configuration
 * - Input IdP metadata (URL or XML upload)
 * - Configure allowed domains for SSO auto-enrollment
 * - Enable/disable SSO connection
 * - Test SSO connection
 * - Visual feedback for configuration status
 *
 * HOW SSO WORKS:
 * 1. Super admin configures SAML connection with IdP metadata
 * 2. Admin maps email domains to the SSO connection
 * 3. Admin enables SSO
 * 4. When users with matching email domain sign in:
 *    - They are redirected to IdP for authentication
 *    - After successful authentication, they return to Capgo
 *    - They are automatically enrolled in the organization
 *    - They receive 'read' permission (lowest level)
 *
 * SECURITY MEASURES:
 * - Only super_admins can configure SSO
 * - SSRF protection on metadata URLs
 * - XML sanitization on metadata content
 * - Domain uniqueness across organizations
 * - Audit logging for all SSO operations
 *
 * BACKEND INTEGRATION:
 * - POST /private/sso_configure - Add SAML connection
 * - PUT /private/sso_update - Update SAML connection
 * - DELETE /private/sso_remove - Remove SAML connection
 * - GET /private/sso_status - Get SSO configuration status
 *
 * REQUIREMENTS:
 * - Supabase Pro plan ($25/month + $0.015/SSO MAU)
 * - Super admin permissions
 * - Valid SAML IdP metadata
 *
 * WIZARD FLOW:
 * Step 1: Display Capgo SAML metadata for IdP configuration
 * Step 2: Input IdP metadata (URL or XML upload)
 * Step 3: Configure allowed domains for auto-enrollment
 * Step 4: Test connection and enable/disable toggle
 */

import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { defaultApiHost, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

// Type for SSO configuration responses
interface SSOConfigResponse {
  sso_provider_id?: string
  entity_id?: string
  acs_url?: string
  metadata_url?: string
  metadata_xml?: string
  provider_name?: string
  domains?: string[]
  enabled?: boolean
  verified?: boolean
  auto_join_enabled?: boolean
  error?: string
}

const { t } = useI18n()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const supabase = useSupabase()
const isLoading = ref(true)
const isSaving = ref(false)
const isTesting = ref(false)
const testPassed = ref(false)
const currentStep = ref(1)

// Test results state
interface TestResults {
  success: boolean
  message: string
  provider?: string
  domains?: string[]
  warnings?: string[]
  checks?: {
    config_exists: boolean
    supabase_auth_provider: boolean
    metadata_valid: boolean
    domains_configured: boolean
  }
  error?: string
}
const testResults = ref<TestResults | null>(null)

displayStore.NavTitle = t('sso-configuration', 'SSO Configuration')

const { currentOrganization } = storeToRefs(organizationStore)

// SSO Configuration State
const ssoConfig = ref<SSOConfigResponse>({})
const metadataInputType = ref<'url' | 'xml'>('url')
const metadataUrl = ref('')
const metadataXml = ref('')
const singleDomain = ref('')
const configuredDomains = ref<string[]>([])
const ssoEnabled = ref(false)
const autoJoinEnabled = ref(false)

// Computed Capgo metadata
const capgoMetadata = computed(() => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
  return {
    entityId: `${supabaseUrl}/auth/v1/sso/saml/metadata`,
    acsUrl: `${supabaseUrl}/auth/v1/sso/saml/acs`,
    ssoUrl: `${supabaseUrl}/auth/v1/sso`,
  }
})

const hasSuperAdminPermission = computed(() => {
  return organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
})

const hasExistingConfig = computed(() => {
  return !!ssoConfig.value.sso_provider_id
})

const showWizard = ref(true)

const ssoConfigured = computed(() => {
  return hasExistingConfig.value && ssoConfig.value.verified
})

onMounted(async () => {
  await organizationStore.dedupFetchOrganizations()
  await loadSSOConfig()
  isLoading.value = false
})

/**
 * Load current organization's SSO configuration from backend
 */
async function loadSSOConfig() {
  if (!currentOrganization.value?.gid)
    return

  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-loading-sso', 'Failed to load SSO configuration'))
      return
    }

    const response = await fetch(`${defaultApiHost}/private/sso_status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ orgId: currentOrganization.value.gid }),
    })

    const data = await response.json() as SSOConfigResponse

    if (!response.ok) {
      console.error('Error from API:', data)
      if (data?.error?.includes('insufficient_permissions')) {
        toast.error(t('no-super-admin-permission', 'You need super admin permissions to view SSO configuration'))
      }
      else {
        toast.error(t('error-loading-sso', 'Failed to load SSO configuration'))
      }
      return
    }

    // Handle null response (no config yet)
    if (!data || !data.sso_provider_id) {
      ssoConfig.value = {}
      showWizard.value = true
      currentStep.value = 1 // Start from step 1
      return
    }

    ssoConfig.value = data
    ssoEnabled.value = data.enabled || false
    autoJoinEnabled.value = data.auto_join_enabled !== undefined ? data.auto_join_enabled : false
    configuredDomains.value = data.domains || []

    // Populate form fields if config exists
    if (data.metadata_url) {
      metadataInputType.value = 'url'
      metadataUrl.value = data.metadata_url
    }
    else if (data.metadata_xml) {
      metadataInputType.value = 'xml'
      metadataXml.value = data.metadata_xml
    }

    // Auto-navigate to appropriate step based on completion
    if (data.verified && data.enabled) {
      // SSO fully configured and enabled - hide wizard
      showWizard.value = false
      currentStep.value = 5
    }
    else if (data.verified) {
      // SSO verified - show final step
      showWizard.value = true
      currentStep.value = 5
    }
    else if (data.domains && data.domains.length > 0) {
      // Domains configured - show test step
      showWizard.value = true
      currentStep.value = 4
    }
    else if (data.sso_provider_id) {
      // Metadata configured, need domains
      showWizard.value = true
      currentStep.value = 3
    }
    else {
      // No config yet
      showWizard.value = true
      currentStep.value = 1
    }
  }
  catch (error: any) {
    console.error('Error loading SSO config:', error)
    toast.error(t('error-loading-sso', 'Failed to load SSO configuration'))
  }
}

/**
 * Configure or update SAML SSO connection
 */
async function saveSSOConfig() {
  if (!currentOrganization.value?.gid)
    return

  // Validate metadata input
  const metadata = metadataInputType.value === 'url'
    ? metadataUrl.value.trim()
    : metadataXml.value.trim()

  if (!metadata) {
    toast.error(t('metadata-required', 'Please provide IdP metadata URL or XML'))
    return
  }

  isSaving.value = true
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-saving-sso', 'Failed to save SSO configuration. Please try again.'))
      return
    }

    const endpoint = hasExistingConfig.value ? '/private/sso_update' : '/private/sso_configure'
    const payload: any = {
      orgId: currentOrganization.value.gid,
    }

    if (metadataInputType.value === 'url') {
      payload.metadataUrl = metadata
    }
    else {
      payload.metadataXml = metadata
    }

    // Include domains if configured
    if (ssoConfig.value.domains && ssoConfig.value.domains.length > 0) {
      payload.domains = ssoConfig.value.domains
    }

    // Include enabled state
    payload.enabled = ssoEnabled.value

    const response = await fetch(`${defaultApiHost}${endpoint}`, {
      method: hasExistingConfig.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json() as SSOConfigResponse

    if (!response.ok || data.error) {
      console.error('Error from API:', data)

      if (data.error?.includes('invalid_metadata')) {
        toast.error(t('invalid-metadata', 'Invalid IdP metadata. Please check the URL or XML.'))
      }
      else if (data.error?.includes('ssrf_blocked')) {
        toast.error(t('ssrf-blocked', 'Metadata URL is blocked for security reasons. Please use a public HTTPS URL.'))
      }
      else if (data.error?.includes('insufficient_permissions')) {
        toast.error(t('no-super-admin-permission', 'You need super admin permissions to configure SSO'))
      }
      else if (data.error?.includes('supabase_pro_required')) {
        toast.error(t('supabase-pro-required', 'SSO requires Supabase Pro plan. Please upgrade your account.'))
      }
      else {
        toast.error(t('error-saving-sso', 'Failed to save SSO configuration. Please try again.'))
      }
      return
    }

    ssoConfig.value = data || {}
    toast.success(t('sso-saved-successfully', 'SSO configuration saved successfully'))

    // Move to next step if it's new configuration
    if (currentStep.value === 2) {
      currentStep.value = 3
    }
  }
  catch (error: any) {
    console.error('Error saving SSO config:', error)
    toast.error(t('error-saving-sso', 'Failed to save SSO configuration. Please try again.'))
  }
  finally {
    isSaving.value = false
  }
}

/**
 * Add a domain to SSO configuration
 */
async function saveDomain() {
  if (!currentOrganization.value?.gid || !singleDomain.value.trim())
    return

  const domain = singleDomain.value.trim().toLowerCase().replace(/^@+/, '')

  // Basic validation
  if (!domain.includes('.') || domain.length < 3) {
    toast.error(t('invalid-domain-format', 'Invalid domain format. Please enter a valid domain like "company.com"'))
    return
  }

  // Check for duplicates
  if (configuredDomains.value.includes(domain)) {
    toast.error(t('domain-already-added', 'This domain is already added'))
    return
  }

  isSaving.value = true
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-adding-domain', 'Failed to add domain. Please try again.'))
      return
    }

    // Add new domain to existing domains
    const updatedDomains = [...configuredDomains.value, domain]

    const response = await fetch(`${defaultApiHost}/private/sso_update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId: currentOrganization.value.gid,
        providerId: ssoConfig.value.sso_provider_id,
        domains: updatedDomains,
        enabled: ssoEnabled.value,
      }),
    })

    const data = await response.json() as SSOConfigResponse

    if (!response.ok || data.error) {
      console.error('Error from API:', data)

      if (data.error?.includes('blocked_domain')) {
        toast.error(t('blocked-domain-error', 'This domain is a public email provider and cannot be used.'))
      }
      else if (data.error?.includes('domain_already_used')) {
        toast.error(t('domain-already-used', 'This domain is already in use by another organization'))
      }
      else {
        toast.error(t('error-adding-domain', 'Failed to add domain. Please try again.'))
      }
      return
    }

    ssoConfig.value = data || {}
    configuredDomains.value = data.domains || updatedDomains
    singleDomain.value = ''
    toast.success(t('domain-added-successfully', 'Domain added successfully'))
  }
  catch (error: any) {
    console.error('Error adding domain:', error)
    toast.error(t('error-adding-domain', 'Failed to add domain. Please try again.'))
  }
  finally {
    isSaving.value = false
  }
}

/**
 * Remove a domain from SSO configuration
 */
async function removeDomain(domainToRemove: string) {
  if (!currentOrganization.value?.gid)
    return

  isSaving.value = true
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-removing-domain', 'Failed to remove domain. Please try again.'))
      return
    }

    const updatedDomains = configuredDomains.value.filter(d => d !== domainToRemove)

    const response = await fetch(`${defaultApiHost}/private/sso_update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId: currentOrganization.value.gid,
        providerId: ssoConfig.value.sso_provider_id,
        domains: updatedDomains,
        enabled: ssoEnabled.value,
      }),
    })

    const data = await response.json() as SSOConfigResponse

    if (!response.ok || data.error) {
      console.error('Error from API:', data)
      toast.error(t('error-removing-domain', 'Failed to remove domain. Please try again.'))
      return
    }

    ssoConfig.value = data || {}
    configuredDomains.value = data.domains || updatedDomains
    toast.success(t('domain-removed-successfully', 'Domain removed successfully'))
  }
  catch (error: any) {
    console.error('Error removing domain:', error)
    toast.error(t('error-removing-domain', 'Failed to remove domain. Please try again.'))
  }
  finally {
    isSaving.value = false
  }
}

/**
 * Navigate to next step after adding domains
 */
function proceedToTestStep() {
  if (configuredDomains.value.length === 0) {
    toast.error(t('at-least-one-domain', 'Please add at least one domain'))
    return
  }
  currentStep.value = 4
}

/**
 * Toggle SSO enabled/disabled state
 */
async function toggleSSO() {
  if (!currentOrganization.value?.gid || !hasExistingConfig.value)
    return

  const newEnabledState = !ssoEnabled.value
  isSaving.value = true
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-toggling-sso', 'Failed to update SSO setting'))
      return
    }

    const response = await fetch(`${defaultApiHost}/private/sso_update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId: currentOrganization.value.gid,
        providerId: ssoConfig.value.sso_provider_id,
        enabled: newEnabledState,
      }),
    })

    const data = await response.json() as SSOConfigResponse

    if (!response.ok || data.error) {
      console.error('Error toggling SSO:', data)
      toast.error(t('error-toggling-sso', 'Failed to update SSO setting'))
      return
    }

    // Update config and state from API response
    ssoConfig.value = data || {}
    ssoEnabled.value = data.enabled ?? newEnabledState
    autoJoinEnabled.value = data.auto_join_enabled ?? autoJoinEnabled.value

    // If SSO is disabled, also disable auto-join
    if (!ssoEnabled.value) {
      autoJoinEnabled.value = false
    }

    toast.success(
      ssoEnabled.value
        ? t('sso-enabled', 'SSO enabled')
        : t('sso-disabled', 'SSO disabled'),
    )
  }
  catch (error: any) {
    console.error('Error toggling SSO:', error)
    toast.error(t('error-toggling-sso', 'Failed to update SSO setting'))
  }
  finally {
    isSaving.value = false
  }
}

/**
 * Toggle Auto-Join enabled/disabled state
 */
async function toggleAutoJoin() {
  if (!currentOrganization.value?.gid || !hasExistingConfig.value)
    return

  // Auto-join can only be toggled when SSO is enabled
  if (!ssoEnabled.value) {
    toast.error(t('auto-join-requires-sso-enabled', 'SSO must be enabled to use auto-join'))
    autoJoinEnabled.value = false // Reset toggle
    return
  }

  const newAutoJoinState = !autoJoinEnabled.value
  isSaving.value = true
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-toggling-auto-join', 'Failed to update auto-join setting'))
      return
    }

    const response = await fetch(`${defaultApiHost}/private/sso_update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId: currentOrganization.value.gid,
        providerId: ssoConfig.value.sso_provider_id,
        autoJoinEnabled: newAutoJoinState,
      }),
    })

    const data = await response.json() as SSOConfigResponse

    if (!response.ok || data.error) {
      console.error('Error toggling auto-join:', data)
      toast.error(t('error-toggling-auto-join', 'Failed to update auto-join setting'))
      return
    }

    // Update config and state from API response
    ssoConfig.value = data || {}
    autoJoinEnabled.value = data.auto_join_enabled ?? newAutoJoinState
    ssoEnabled.value = data.enabled ?? ssoEnabled.value

    toast.success(
      autoJoinEnabled.value
        ? t('auto-join-enabled-toast', 'Auto-join enabled')
        : t('auto-join-disabled-toast', 'Auto-join disabled'),
    )
  }
  catch (error: any) {
    console.error('Error toggling auto-join:', error)
    toast.error(t('error-toggling-auto-join', 'Failed to update auto-join setting'))
  }
  finally {
    isSaving.value = false
  }
}

/**
 * Test SSO connection
 */
async function testSSO() {
  if (!hasExistingConfig.value) {
    toast.error(t('no-sso-config', 'Please configure SSO before testing'))
    return
  }

  isTesting.value = true
  testResults.value = null // Clear previous results
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-testing-sso', 'Failed to test SSO. Please try again.'))
      return
    }

    // Call our custom test endpoint
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/private/sso_test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId: currentOrganization.value.gid,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Error testing SSO:', data)

      // Store error results
      testResults.value = {
        success: false,
        message: data.message || 'Failed to test SSO',
        error: data.errors ? data.errors.join('; ') : data.message,
        checks: data.checks,
      }

      // Show detailed error messages if available
      if (data.errors && Array.isArray(data.errors)) {
        const errorList = data.errors.join('; ')
        toast.error(`${data.message}: ${errorList}`)
      }
      else {
        toast.error(data.message || t('error-testing-sso', 'Failed to test SSO'))
      }
      testPassed.value = false
      return
    }

    // Store success results
    testResults.value = {
      success: true,
      message: data.message || 'SSO configuration is valid',
      provider: data.provider,
      domains: data.domains,
      warnings: data.warnings,
      checks: data.checks,
    }

    // Show success message
    toast.success(t('sso-config-valid', 'SSO configuration is valid and ready to use'))
    testPassed.value = true

    // Show warnings if any
    if (data.warnings && data.warnings.length > 0) {
      console.warn('SSO configuration warnings:', data.warnings)
      data.warnings.forEach((warning: string) => {
        toast.warning(warning, { duration: 5000 })
      })
    }
  }
  catch (error: any) {
    console.error('Error testing SSO:', error)
    toast.error(t('error-testing-sso', 'Failed to test SSO'))
  }
  finally {
    isTesting.value = false
  }
}

/**
 * Delete SSO configuration
 */
async function deleteSSOConfig() {
  if (!currentOrganization.value?.gid || !hasExistingConfig.value)
    return

  // User must click the delete button explicitly, no additional confirmation needed
  // The button is in the "Danger Zone" section with clear warnings

  isSaving.value = true
  try {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-deleting-sso', 'Failed to delete SSO configuration. Please try again.'))
      return
    }

    const response = await fetch(`${defaultApiHost}/private/sso_remove`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId: currentOrganization.value.gid,
        providerId: ssoConfig.value.sso_provider_id,
      }),
    })

    const data = await response.json() as SSOConfigResponse

    if (!response.ok || data?.error) {
      console.error('Error from API:', data)
      toast.error(t('error-deleting-sso', 'Failed to delete SSO configuration'))
      return
    }

    // Reset state
    ssoConfig.value = {}
    ssoEnabled.value = false
    metadataUrl.value = ''
    metadataXml.value = ''
    configuredDomains.value = []
    showWizard.value = true
    currentStep.value = 1

    toast.success(t('sso-deleted-successfully', 'SSO configuration deleted successfully'))
  }
  catch (error: any) {
    console.error('Error deleting SSO config:', error)
    toast.error(t('error-deleting-sso', 'Failed to delete SSO configuration'))
  }
  finally {
    isSaving.value = false
  }
}

/**
 * Edit configuration - go back to domain step
 */
function editConfiguration() {
  showWizard.value = true
  currentStep.value = 3
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(t('copied-to-clipboard', `${label} copied to clipboard`))
  }).catch(() => {
    toast.error(t('copy-failed', 'Failed to copy to clipboard'))
  })
}
</script>

<template>
  <div>
    <div class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
      <div class="p-6 space-y-6">
        <h2 class="mb-5 text-2xl font-bold dark:text-white text-slate-800">
          {{ t('sso-saml-configuration', 'SSO/SAML Configuration') }}
        </h2>

        <div v-if="!hasSuperAdminPermission" class="p-4 text-center border rounded-lg bg-gray-50 dark:bg-gray-800 border-slate-300 dark:border-slate-700">
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('super-admin-permission-required', 'You need super admin permissions to configure SSO') }}
          </p>
        </div>

        <div v-else-if="isLoading" class="flex items-center justify-center p-8">
          <Spinner size="w-8 h-8" color="fill-blue-500 text-gray-200 dark:text-gray-600" />
        </div>

        <div v-else class="space-y-6">
          <!-- SSO Already Configured Summary (shown when wizard is hidden) -->
          <div v-if="!showWizard && ssoConfigured" class="space-y-4">
            <div class="p-4 border rounded-lg" :class="ssoEnabled ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-3">
                  <svg class="w-6 h-6 mt-0.5" :class="ssoEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div class="flex-1">
                    <h3 class="font-semibold" :class="ssoEnabled ? 'text-green-800 dark:text-green-300' : 'text-gray-800 dark:text-gray-300'">
                      {{ ssoEnabled ? t('sso-active', 'SSO is Active') : t('sso-inactive', 'SSO is Inactive') }}
                    </h3>
                    <p class="mt-1 text-sm" :class="ssoEnabled ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'">
                      {{ ssoEnabled ? t('sso-active-description', 'Single Sign-On is configured and enabled for your organization.') : t('sso-inactive-description', 'SSO is configured but not currently active for your organization.') }}
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input :checked="ssoEnabled" type="checkbox" class="sr-only peer" :disabled="isSaving" @change="toggleSSO">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600" />
                </label>
              </div>
            </div>

            <!-- Auto-Join Banner -->
            <div class="flex items-center justify-between p-4 border rounded-lg" :class="ssoEnabled && autoJoinEnabled ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'">
              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center w-10 h-10 rounded-full" :class="ssoEnabled && autoJoinEnabled ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-700'">
                  <svg class="w-6 h-6" :class="ssoEnabled && autoJoinEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <div class="flex-1">
                  <div class="font-medium" :class="ssoEnabled && autoJoinEnabled ? 'text-blue-800 dark:text-blue-300' : 'text-gray-800 dark:text-gray-300'">
                    {{ autoJoinEnabled ? t('auto-join-enabled', 'Auto-Join Enabled') : t('auto-join-disabled', 'Auto-Join Disabled') }}
                  </div>
                  <div class="text-sm" :class="ssoEnabled && autoJoinEnabled ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'">
                    {{ !ssoEnabled ? t('auto-join-requires-sso', 'Enable SSO to use auto-join') : (autoJoinEnabled ? t('auto-join-enabled-description', 'SSO users are automatically added to the organization') : t('auto-join-disabled-description', 'SSO users must be manually invited')) }}
                  </div>
                </div>
              </div>
              <label class="relative inline-flex items-center" :class="ssoEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'">
                <input :checked="autoJoinEnabled" type="checkbox" class="sr-only peer" :disabled="isSaving || !ssoEnabled" @change="toggleAutoJoin">
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:cursor-not-allowed" />
              </label>
            </div>

            <div class="p-4 border rounded-lg dark:bg-gray-800 dark:border-gray-600 border-slate-300">
              <h4 class="mb-3 font-medium dark:text-white text-slate-800">
                {{ t('current-configuration', 'Current Configuration') }}
              </h4>
              <div class="space-y-2">
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('sso-status', 'SSO Status') }}:</span>
                  <span class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full" :class="ssoEnabled ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'">
                    {{ ssoEnabled ? t('enabled', 'Enabled') : t('disabled', 'Disabled') }}
                  </span>
                </div>

                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('auto-join-status', 'Auto-Join Status') }}:</span>
                  <span class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full" :class="autoJoinEnabled ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'">
                    {{ autoJoinEnabled ? t('enabled', 'Enabled') : t('disabled', 'Disabled') }}
                  </span>
                </div>

                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('provider', 'Provider') }}:</span>
                  <span class="font-medium dark:text-white text-slate-800">{{ ssoConfig.provider_name || 'SAML 2.0' }}</span>
                </div>

                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('domains', 'Domains') }}:</span>
                  <div class="flex flex-wrap gap-1 justify-end">
                    <span v-for="domain in ssoConfig.domains" :key="domain" class="px-2 py-0.5 text-xs font-mono rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                      @{{ domain }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex justify-start">
              <button type="button" class="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg cursor-pointer hover:bg-gray-50 focus:ring-4 focus:ring-gray-200 border-gray-300 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 focus:outline-hidden" @click="editConfiguration">
                {{ t('edit-configuration', 'Edit Configuration') }}
              </button>
            </div>
          </div>

          <!-- Wizard Steps Indicator (shown when wizard is visible and not fully configured, hidden on step 5) -->
          <div v-if="showWizard && !ssoConfigured && currentStep < 5" class="flex items-center justify-center gap-2 p-4">
            <div v-for="step in 5" :key="step" class="flex items-center">
              <div class="flex flex-col items-center">
                <div class="flex items-center justify-center w-8 h-8 rounded-full font-medium text-sm transition-colors" :class="currentStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'">
                  {{ step }}
                </div>
                <div class="mt-1 text-xs text-center" :class="currentStep >= step ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'">
                  {{ step === 1 ? t('metadata', 'Metadata') : step === 2 ? t('idp-config', 'IdP Config') : step === 3 ? t('domains', 'Domains') : step === 4 ? t('test', 'Test') : t('enable', 'Enable') }}
                </div>
              </div>
              <div v-if="step < 5" class="w-12 h-0.5 mx-2 transition-colors" :class="currentStep > step ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'" />
            </div>
          </div>

          <!-- Wizard Steps (shown only when showWizard is true) -->
          <div v-if="showWizard">
            <!-- Step 1: Capgo SAML Metadata -->
            <div v-show="currentStep === 1" class="space-y-4">
              <div class="p-4 border rounded-lg bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                <div class="flex items-start gap-2 mb-2">
                  <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div class="flex-1">
                    <h3 class="font-medium text-blue-800 dark:text-blue-300">
                      {{ t('step-1-title', 'Step 1: Configure your Identity Provider (IdP)') }}
                    </h3>
                    <p class="mt-1 text-sm text-blue-700 dark:text-blue-400">
                      {{ t('step-1-description', 'Copy these values and configure them in your IdP (Okta, Azure AD, Google Workspace, etc.)') }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div class="p-4 border rounded-lg dark:bg-gray-800 dark:border-gray-600 border-slate-300">
                  <label class="block mb-2 text-sm font-medium dark:text-white text-slate-800">
                    {{ t('entity-id', 'Entity ID / Issuer') }}
                  </label>
                  <div class="flex gap-2">
                    <input :value="capgoMetadata.entityId" type="text" readonly class="flex-1 px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-900 dark:border-gray-600 dark:text-white border-slate-300 font-mono text-sm">
                    <button type="button" class="px-3 py-2 text-xs font-medium text-center text-blue-600 border rounded-lg cursor-pointer hover:text-white hover:bg-blue-600 focus:ring-4 focus:ring-blue-300 border-blue-400 dark:hover:bg-blue-600 dark:focus:ring-blue-800 focus:outline-hidden" @click="copyToClipboard(capgoMetadata.entityId, 'Entity ID')">
                      {{ t('copy', 'Copy') }}
                    </button>
                  </div>
                </div>

                <div class="p-4 border rounded-lg dark:bg-gray-800 dark:border-gray-600 border-slate-300">
                  <label class="block mb-2 text-sm font-medium dark:text-white text-slate-800">
                    {{ t('acs-url', 'ACS URL / Reply URL') }}
                  </label>
                  <div class="flex gap-2">
                    <input :value="capgoMetadata.acsUrl" type="text" readonly class="flex-1 px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-900 dark:border-gray-600 dark:text-white border-slate-300 font-mono text-sm">
                    <button type="button" class="px-3 py-2 text-xs font-medium text-center text-blue-600 border rounded-lg cursor-pointer hover:text-white hover:bg-blue-600 focus:ring-4 focus:ring-blue-300 border-blue-400 dark:hover:bg-blue-600 dark:focus:ring-blue-800 focus:outline-hidden" @click="copyToClipboard(capgoMetadata.acsUrl, 'ACS URL')">
                      {{ t('copy', 'Copy') }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex justify-end">
                <button type="button" class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800 focus:outline-hidden" @click="currentStep = 2">
                  {{ t('next', 'Next') }} →
                </button>
              </div>
            </div>

            <!-- Step 2: IdP Metadata Configuration -->
            <div v-show="currentStep === 2" class="space-y-4">
              <div class="p-4 border rounded-lg bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                <h3 class="font-medium text-blue-800 dark:text-blue-300">
                  {{ t('step-2-title', 'Step 2: Enter your IdP Metadata') }}
                </h3>
                <p class="mt-1 text-sm text-blue-700 dark:text-blue-400">
                  {{ t('step-2-description', 'Provide your Identity Provider\'s SAML metadata URL or paste the XML directly') }}
                </p>
              </div>

              <!-- Metadata Input Type Toggle -->
              <div class="flex gap-2 p-1 bg-gray-100 rounded-lg dark:bg-gray-700 w-fit">
                <button type="button" class="px-4 py-2 text-sm font-medium rounded-md transition-colors" :class="metadataInputType === 'url' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'" @click="metadataInputType = 'url'">
                  {{ t('metadata-url', 'Metadata URL') }}
                </button>
                <button type="button" class="px-4 py-2 text-sm font-medium rounded-md transition-colors" :class="metadataInputType === 'xml' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'" @click="metadataInputType = 'xml'">
                  {{ t('metadata-xml', 'Metadata XML') }}
                </button>
              </div>

              <!-- Metadata URL Input -->
              <div v-if="metadataInputType === 'url'" class="space-y-2">
                <label for="metadata-url-input" class="block text-sm font-medium dark:text-white text-slate-800">
                  {{ t('idp-metadata-url', 'IdP Metadata URL') }}
                </label>
                <input id="metadata-url-input" v-model="metadataUrl" type="url" :placeholder="t('metadata-url-placeholder', 'https://idp.example.com/metadata')" class="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" :disabled="isSaving">
                <p class="text-xs text-gray-600 dark:text-gray-400">
                  {{ t('metadata-url-help', 'Enter the public HTTPS URL where your IdP\'s SAML metadata can be accessed') }}
                </p>
              </div>

              <!-- Metadata XML Input -->
              <div v-else class="space-y-2">
                <label for="metadata-xml-input" class="block text-sm font-medium dark:text-white text-slate-800">
                  {{ t('idp-metadata-xml', 'IdP Metadata XML') }}
                </label>
                <textarea id="metadata-xml-input" v-model="metadataXml" rows="8" :placeholder="t('metadata-xml-placeholder', 'Paste your IdP SAML metadata XML here...')" class="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-sm" :disabled="isSaving" />
                <p class="text-xs text-gray-600 dark:text-gray-400">
                  {{ t('metadata-xml-help', 'Paste the complete SAML metadata XML from your Identity Provider') }}
                </p>
              </div>

              <div class="flex justify-between">
                <button type="button" class="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg cursor-pointer hover:bg-gray-50 focus:ring-4 focus:ring-gray-200 border-gray-300 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 focus:outline-hidden" @click="currentStep = 1">
                  ← {{ t('back', 'Back') }}
                </button>
                <button type="button" class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isSaving || !(metadataInputType === 'url' ? metadataUrl.trim() : metadataXml.trim())" @click="saveSSOConfig">
                  <span v-if="!isSaving">
                    {{ t('save-and-continue', 'Save & Continue') }}
                  </span>
                  <Spinner v-else size="w-4 h-4" class="inline-block" color="fill-white text-blue-300" />
                </button>
              </div>
            </div>

            <!-- Step 3: Domain Configuration -->
            <div v-show="currentStep === 3" class="space-y-4">
              <div class="p-4 border rounded-lg bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                <h3 class="font-medium text-blue-800 dark:text-blue-300">
                  {{ t('step-3-title', 'Step 3: Configure Email Domain') }}
                </h3>
                <p class="mt-1 text-sm text-blue-700 dark:text-blue-400">
                  {{ t('step-3-description', 'Add the email domain that should use SSO for authentication') }}
                </p>
              </div>

              <!-- Single Domain Input -->
              <div class="space-y-2">
                <label for="domain-input" class="block text-sm font-medium dark:text-white text-slate-800">
                  {{ t('add-email-domain', 'Add Email Domain') }}
                </label>
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                      @
                    </span>
                    <input id="domain-input" v-model="singleDomain" type="text" :placeholder="t('domain-placeholder', 'yourcompany.com')" class="w-full pl-8 pr-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" :disabled="isSaving" @keydown.enter.prevent="saveDomain">
                  </div>
                  <button type="button" class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isSaving || !singleDomain.trim()" @click="saveDomain">
                    <span v-if="!isSaving">{{ t('add', 'Add') }}</span>
                    <Spinner v-else size="w-4 h-4" class="inline-block" color="fill-white text-blue-300" />
                  </button>
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-400">
                  {{ t('domain-sso-help', 'Users with emails from this domain will use SSO for authentication') }}
                </p>
              </div>

              <!-- Configured Domains List -->
              <div v-if="configuredDomains.length > 0" class="space-y-2">
                <label class="block text-sm font-medium dark:text-white text-slate-800">
                  {{ t('configured-domains', 'Configured Domains') }} ({{ configuredDomains.length }})
                </label>
                <div class="space-y-2">
                  <div v-for="domain in configuredDomains" :key="domain" class="flex items-center justify-between p-3 border rounded-lg dark:bg-gray-800 dark:border-gray-600 border-slate-300">
                    <span class="font-mono text-sm dark:text-white text-slate-800">@{{ domain }}</span>
                    <button type="button" class="px-2 py-1 text-xs font-medium text-red-600 border rounded hover:text-white hover:bg-red-600 focus:ring-2 focus:ring-red-300 border-red-400 dark:hover:bg-red-600 dark:focus:ring-red-800 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isSaving" @click="removeDomain(domain)">
                      {{ t('remove', 'Remove') }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex justify-between">
                <button type="button" class="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg cursor-pointer hover:bg-gray-50 focus:ring-4 focus:ring-gray-200 border-gray-300 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 focus:outline-hidden" @click="currentStep = 2">
                  ← {{ t('back', 'Back') }}
                </button>
                <button type="button" class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed" :disabled="configuredDomains.length === 0" @click="proceedToTestStep">
                  {{ t('next', 'Next') }} →
                </button>
              </div>
            </div>

            <!-- Step 4: Test Connection -->
            <div v-show="currentStep === 4" class="space-y-4">
              <div class="p-4 border rounded-lg bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                <h3 class="font-medium text-blue-800 dark:text-blue-300">
                  {{ t('step-4-title', 'Step 4: Test SSO Connection') }}
                </h3>
                <p class="mt-1 text-sm text-blue-700 dark:text-blue-400">
                  {{ t('step-4-description', 'Test your SSO configuration to ensure it works correctly before enabling it.') }}
                </p>
              </div>

              <!-- Configuration Review -->
              <div class="p-4 space-y-3 border rounded-lg dark:bg-gray-800 dark:border-gray-600 border-slate-300">
                <h4 class="font-medium dark:text-white text-slate-800">
                  {{ t('configuration-review', 'Configuration Review') }}
                </h4>

                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">{{ t('provider', 'Provider') }}:</span>
                    <span class="font-medium dark:text-white text-slate-800">{{ ssoConfig.provider_name || 'SAML 2.0' }}</span>
                  </div>

                  <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">{{ t('email-domain', 'Email Domain') }}:</span>
                    <span class="font-mono font-medium dark:text-white text-slate-800">@{{ ssoConfig.domains?.[0] || 'N/A' }}</span>
                  </div>

                  <div class="flex justify-between items-start gap-4">
                    <span class="text-gray-600 dark:text-gray-400">{{ t('metadata-url', 'Metadata URL') }}:</span>
                    <a v-if="ssoConfig.metadata_url" :href="ssoConfig.metadata_url" target="_blank" class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline break-all text-right">{{ ssoConfig.metadata_url }}</a>
                    <span v-else class="font-mono text-xs dark:text-white text-slate-800 text-right">{{ ssoConfig.metadata_xml ? 'XML Uploaded' : 'N/A' }}</span>
                  </div>
                </div>
              </div>

              <!-- Test Connection -->
              <div class="p-4 space-y-3 border rounded-lg dark:bg-gray-800 dark:border-gray-600 border-slate-300">
                <h4 class="font-medium dark:text-white text-slate-800">
                  {{ t('test-sso-connection', 'Test SSO Connection') }}
                </h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('test-sso-description', 'Click the button below to test your SSO configuration in a new window. After successful authentication, you can proceed to enable SSO.') }}
                </p>
                <button type="button" class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isTesting" @click="testSSO">
                  <span v-if="!isTesting">
                    {{ t('test-connection', 'Test Connection') }}
                  </span>
                  <Spinner v-else size="w-4 h-4" class="inline-block" color="fill-white text-blue-300" />
                </button>

                <!-- Test Results -->
                <div v-if="testResults" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <h5 class="text-sm font-medium mb-3" :class="testResults.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'">
                    {{ testResults.success ? t('test-passed', '✓ Test Passed') : t('test-failed', '✗ Test Failed') }}
                  </h5>

                  <!-- Checks Grid -->
                  <div v-if="testResults.checks" class="grid grid-cols-2 gap-2 text-sm">
                    <div class="flex items-center gap-2">
                      <span v-if="testResults.checks.config_exists" class="text-green-500">✓</span>
                      <span v-else class="text-red-500">✗</span>
                      <span class="text-gray-600 dark:text-gray-400">{{ t('check-config-exists', 'Configuration exists') }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span v-if="testResults.checks.supabase_auth_provider" class="text-green-500">✓</span>
                      <span v-else class="text-red-500">✗</span>
                      <span class="text-gray-600 dark:text-gray-400">{{ t('check-auth-provider', 'Auth provider registered') }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span v-if="testResults.checks.metadata_valid" class="text-green-500">✓</span>
                      <span v-else class="text-red-500">✗</span>
                      <span class="text-gray-600 dark:text-gray-400">{{ t('check-metadata-valid', 'SAML metadata valid') }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span v-if="testResults.checks.domains_configured" class="text-green-500">✓</span>
                      <span v-else class="text-red-500">✗</span>
                      <span class="text-gray-600 dark:text-gray-400">{{ t('check-domains', 'Domains configured') }}</span>
                    </div>
                  </div>

                  <!-- Error Message -->
                  <div v-if="!testResults.success && testResults.error" class="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-400">
                    {{ testResults.error }}
                  </div>

                  <!-- Warnings -->
                  <div v-if="testResults.warnings && testResults.warnings.length > 0" class="mt-3 space-y-1">
                    <p class="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                      {{ t('warnings', 'Warnings') }}:
                    </p>
                    <ul class="text-sm text-yellow-600 dark:text-yellow-500 list-disc list-inside">
                      <li v-for="(warning, idx) in testResults.warnings" :key="idx">
                        {{ warning }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- Success Message (only after test is run) -->
              <div v-if="testPassed" class="p-4 border rounded-lg bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                <div class="flex items-start gap-2">
                  <svg class="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p class="font-medium text-green-800 dark:text-green-300">
                      {{ t('sso-test-successful', 'SSO Test Successful!') }}
                    </p>
                    <p class="text-sm text-green-700 dark:text-green-400">
                      {{ t('sso-test-success-message', 'Your SSO configuration is working correctly. Click Next to enable it.') }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="flex justify-between">
                <button type="button" class="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg cursor-pointer hover:bg-gray-50 focus:ring-4 focus:ring-gray-200 border-gray-300 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 focus:outline-hidden" @click="currentStep = 3">
                  ← {{ t('back', 'Back') }}
                </button>
                <button type="button" class="px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed" :disabled="!testPassed" @click="currentStep = 5">
                  {{ t('next', 'Next') }} →
                </button>
              </div>
            </div>

            <!-- Step 5: Enable SSO -->
            <div v-show="currentStep === 5" class="space-y-4">
              <!-- SSO Status Banner -->
              <div class="flex items-center justify-between p-4 border rounded-lg" :class="ssoEnabled ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'">
                <div class="flex items-center gap-3">
                  <div class="flex items-center justify-center w-10 h-10 rounded-full" :class="ssoEnabled ? 'bg-green-100 dark:bg-green-900/40' : 'bg-gray-100 dark:bg-gray-700'">
                    <svg class="w-6 h-6" :class="ssoEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <div class="font-medium" :class="ssoEnabled ? 'text-green-800 dark:text-green-300' : 'text-gray-800 dark:text-gray-300'">
                      {{ ssoEnabled ? t('sso-active', 'SSO Active') : t('sso-inactive', 'SSO Inactive') }}
                    </div>
                    <div class="text-sm" :class="ssoEnabled ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'">
                      {{ ssoEnabled ? t('sso-active-description', 'Users can sign in with SSO') : t('sso-inactive-description', 'SSO is configured but not active') }}
                    </div>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input :checked="ssoEnabled" type="checkbox" class="sr-only peer" :disabled="isSaving" @change="toggleSSO">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
                </label>
              </div>

              <!-- Auto-Join Banner -->
              <div class="flex items-center justify-between p-4 border rounded-lg" :class="ssoEnabled && autoJoinEnabled ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'">
                <div class="flex items-center gap-3">
                  <div class="flex items-center justify-center w-10 h-10 rounded-full" :class="ssoEnabled && autoJoinEnabled ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-700'">
                    <svg class="w-6 h-6" :class="ssoEnabled && autoJoinEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <div>
                    <div class="font-medium" :class="ssoEnabled && autoJoinEnabled ? 'text-blue-800 dark:text-blue-300' : 'text-gray-800 dark:text-gray-300'">
                      {{ autoJoinEnabled ? t('auto-join-enabled', 'Auto-Join Enabled') : t('auto-join-disabled', 'Auto-Join Disabled') }}
                    </div>
                    <div class="text-sm" :class="ssoEnabled && autoJoinEnabled ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'">
                      {{ !ssoEnabled ? t('auto-join-requires-sso', 'Enable SSO to use auto-join') : (autoJoinEnabled ? t('auto-join-enabled-description', 'SSO users are automatically added to the organization') : t('auto-join-disabled-description', 'SSO users must be manually invited')) }}
                    </div>
                  </div>
                </div>
                <label class="relative inline-flex items-center" :class="ssoEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'">
                  <input :checked="autoJoinEnabled" type="checkbox" class="sr-only peer" :disabled="isSaving || !ssoEnabled" @change="toggleAutoJoin">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:cursor-not-allowed" />
                </label>
              </div>

              <!-- Current Configuration Summary -->
              <div class="p-4 space-y-3 border rounded-lg dark:bg-gray-800 dark:border-gray-600 border-slate-300">
                <h4 class="font-medium dark:text-white text-slate-800">
                  {{ t('current-configuration', 'Current Configuration') }}
                </h4>

                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">{{ t('provider', 'Provider') }}:</span>
                    <span class="font-medium dark:text-white text-slate-800">{{ ssoConfig.provider_name || 'SAML 2.0' }}</span>
                  </div>

                  <div class="flex justify-between items-start gap-4">
                    <span class="text-gray-600 dark:text-gray-400">{{ t('email-domains', 'Email Domains') }}:</span>
                    <div class="flex flex-wrap gap-1 justify-end">
                      <span v-for="domain in configuredDomains" :key="domain" class="px-2 py-0.5 text-xs font-mono rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                        @{{ domain }}
                      </span>
                    </div>
                  </div>

                  <div class="flex justify-between items-start gap-4">
                    <span class="text-gray-600 dark:text-gray-400">{{ t('metadata-url', 'Metadata URL') }}:</span>
                    <a v-if="ssoConfig.metadata_url" :href="ssoConfig.metadata_url" target="_blank" class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline break-all text-right">{{ ssoConfig.metadata_url }}</a>
                    <span v-else class="font-mono text-xs dark:text-white text-slate-800 text-right">{{ ssoConfig.metadata_xml ? 'XML Uploaded' : 'N/A' }}</span>
                  </div>
                </div>
              </div>

              <!-- Edit Configuration Button -->
              <div class="flex justify-between">
                <button type="button" class="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg cursor-pointer hover:bg-gray-50 focus:ring-4 focus:ring-gray-200 border-gray-300 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 focus:outline-hidden" @click="editConfiguration">
                  {{ t('edit-configuration', 'Edit Configuration') }}
                </button>
              </div>
            </div>
          <!-- End of wizard steps -->
          </div>

          <!-- Delete Configuration (shown at bottom when config exists) -->
          <div v-if="hasExistingConfig" class="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
            <div class="p-4 border rounded-lg bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
              <h3 class="mb-2 font-medium text-red-800 dark:text-red-300">
                {{ t('danger-zone', 'Danger Zone') }}
              </h3>
              <p class="mb-3 text-sm text-red-700 dark:text-red-400">
                {{ t('delete-sso-warning', 'Deleting the SSO configuration will immediately disable SSO authentication for all users. This action cannot be undone.') }}
              </p>
              <button type="button" class="px-4 py-2 text-sm font-medium text-red-600 border rounded-lg cursor-pointer hover:text-white hover:bg-red-600 focus:ring-4 focus:ring-red-300 border-red-400 dark:hover:bg-red-600 dark:focus:ring-red-800 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed" :disabled="isSaving" @click="deleteSSOConfig">
                {{ t('delete-sso-configuration', 'Delete SSO Configuration') }}
              </button>
            </div>
          </div>

          <!-- Info Notice -->
          <div class="p-4 border rounded-lg bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <p class="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
              {{ t('requirements', 'Requirements:') }}
            </p>
            <ul class="space-y-1 text-sm text-amber-800 dark:text-amber-300 list-disc list-inside">
              <li>{{ t('requirement-idp-metadata', 'Valid SAML IdP metadata (URL or XML)') }}</li>
              <li>{{ t('requirement-custom-domain', 'Custom email domain (public providers like Gmail are blocked)') }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
