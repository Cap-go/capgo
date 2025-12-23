<script setup lang="ts">
/**
 * Organization Member Auto-Enrollment UI Component
 *
 * This component provides a user interface for organization admins to configure
 * domain-based automatic member enrollment (auto-join).
 *
 * FEATURES:
 * - Add/remove allowed email domains for automatic enrollment
 * - Enable/disable auto-join functionality
 * - Real-time validation and error handling
 * - Visual feedback for configuration status
 *
 * HOW AUTO-JOIN WORKS:
 * 1. Admin configures an allowed email domain (e.g., "company.com")
 * 2. Admin enables auto-join toggle
 * 3. When users sign up or log in with matching email (e.g., "user@company.com"):
 *    - They are automatically added to the organization
 *    - They receive 'read' permission (lowest level)
 *    - No invitation required
 *
 * SECURITY MEASURES:
 * - Public email domains blocked (gmail.com, yahoo.com, outlook.com, etc.)
 * - Only admins/super_admins can modify domains
 * - SSO domains must be unique across organizations
 * - Domain validation on frontend and backend
 * - Comprehensive error handling and user feedback
 *
 * BACKEND INTEGRATION:
 * - GET: /private/organization_domains_get - Fetch current configuration
 * - PUT: /private/organization_domains_put - Update configuration
 * - Database triggers handle auto-join on signup
 * - Login hook handles auto-join for existing users
 *
 * LIMITATIONS:
 * - Currently supports one domain per organization
 * - Requires organization to have admin or super_admin role
 * - Changes are not retroactive (existing users must log in again)
 */

import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { getLocalConfig, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const supabase = useSupabase()
const isLoading = ref(true)
const isSaving = ref(false)

displayStore.NavTitle = t('auto-join')

const { currentOrganization } = storeToRefs(organizationStore)

// Single domain for now
const allowedDomain = ref('')
const newDomain = ref('')
const autoJoinEnabled = ref(false)

const hasAdminPermission = computed(() => {
  return organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['admin', 'super_admin'])
})

onMounted(async () => {
  await organizationStore.dedupFetchOrganizations()
  await loadAllowedDomain()
  isLoading.value = false
})

/**
 * Load current organization's domain configuration from backend
 *
 * Fetches:
 * - allowed_email_domains: Array of configured domains
 * - sso_enabled: Whether auto-join is currently enabled
 *
 * Updates UI state:
 * - allowedDomain: Displays the first (and currently only) domain
 * - autoJoinEnabled: Shows toggle state
 *
 * Error Handling:
 * - Shows specific error for permission issues
 * - Generic error for other failures
 * - Logs all errors for debugging
 */
async function loadAllowedDomain() {
  if (!currentOrganization.value?.gid)
    return

  try {
    const config = getLocalConfig()
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-loading-domain', 'Failed to load allowed domain'))
      return
    }

    const response = await fetch(`${config.hostWeb}/private/organization_domains_get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ orgId: currentOrganization.value.gid }),
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      console.error('Error from API:', data)
      // Check for specific error types
      if (data.error?.includes('cannot_access_organization')) {
        toast.error(t('no-org-access', 'You don\'t have access to this organization'))
      }
      else {
        toast.error(t('error-loading-domain', 'Failed to load allowed domain'))
      }
      return
    }

    // Get the first domain (we only support one for now)
    // Future: Could be extended to support multiple domains
    if (data?.allowed_email_domains && data.allowed_email_domains.length > 0) {
      allowedDomain.value = data.allowed_email_domains[0]
    }
    else {
      allowedDomain.value = ''
    }

    // Load the auto-join enabled state
    autoJoinEnabled.value = data?.sso_enabled || false
  }
  catch (error: any) {
    console.error('Full error loading domain:', error, 'Message:', error?.message, 'Details:', JSON.stringify(error))
    toast.error(t('error-loading-domain', 'Failed to load allowed domain'))
  }
}

/**
 * Save a new email domain for auto-join
 *
 * Process:
 * 1. Validates domain format (must contain '.' and be at least 3 chars)
 * 2. Normalizes domain (lowercase, trim, remove @ prefix)
 * 3. Sends to backend with enabled state
 * 4. Handles various error scenarios with user-friendly messages
 *
 * Validation:
 * - Basic format check (contains '.', min length)
 * - Backend enforces additional rules (no public domains, SSO uniqueness)
 *
 * Error Messages:
 * - blocked_domain: Public email provider detected
 * - domain_already_used: Another org has SSO enabled with this domain
 * - insufficient_permissions: User is not admin
 * - Generic fallback for unexpected errors
 */
async function saveDomain() {
  if (!currentOrganization.value?.gid || !newDomain.value.trim())
    return

  // Normalize domain: lowercase, trim whitespace, remove @ prefix
  const domain = newDomain.value.trim().toLowerCase().replace(/^@+/, '')

  // Basic validation (backend has additional checks)
  if (!domain.includes('.') || domain.length < 3) {
    toast.error(t('invalid-domain-format', 'Invalid domain format. Please enter a valid domain like "company.com"'))
    return
  }

  isSaving.value = true
  try {
    const config = getLocalConfig()
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-saving-domain', 'Failed to save domain. Please try again.'))
      return
    }

    const response = await fetch(`${config.hostWeb}/private/organization_domains_put`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId: currentOrganization.value.gid,
        domains: [domain], // Array structure allows future multi-domain support
        enabled: autoJoinEnabled.value,
      }),
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      console.error('Error from API (save):', data)
      // Check for specific error types and show appropriate user messages
      if (data.error?.includes('blocked_domain') || data.error?.includes('public email provider')) {
        toast.error(t('blocked-domain-error', 'This domain is a public email provider (like Gmail, Yahoo, etc.) and cannot be used. Please use your organization\'s custom domain.'))
      }
      else if (data.error?.includes('domain_already_used')) {
        toast.error(t('domain-already-used', 'This domain is already in use by another organization'))
      }
      else if (data.error?.includes('insufficient_permissions')) {
        toast.error(t('no-admin-permission', 'You need admin permissions to configure domains'))
      }
      else {
        toast.error(t('error-saving-domain', 'Failed to save domain. Please try again.'))
      }
      return
    }

    if (!data) {
      console.error('No data returned from save API')
      toast.error(t('error-saving-domain', 'Failed to save domain. Please try again.'))
      return
    }

    // Update UI with saved values from backend
    allowedDomain.value = data.allowed_email_domains?.[0] || ''
    autoJoinEnabled.value = data.sso_enabled || false
    newDomain.value = '' // Clear input field
    toast.success(t('domain-saved-successfully', 'Domain configured successfully'))
  }
  catch (error: any) {
    console.error('Full error saving domain:', error, 'Message:', error?.message, 'Details:', JSON.stringify(error))
    toast.error(t('error-saving-domain', 'Failed to save domain. Please try again.'))
  }
  finally {
    isSaving.value = false
  }
}

/**
 * Remove the configured email domain
 *
 * Process:
 * 1. Sends empty domains array to backend
 * 2. Sets enabled to false (disables auto-join)
 * 3. Clears UI state on success
 *
 * Note: This removes ALL domains (currently only one is supported)
 * Future: Could be extended to remove individual domains from array
 */
async function removeDomain() {
  if (!currentOrganization.value?.gid)
    return

  isSaving.value = true
  try {
    const config = getLocalConfig()
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      toast.error(t('error-removing-domain', 'Failed to remove domain. Please try again.'))
      return
    }

    const response = await fetch(`${config.hostWeb}/private/organization_domains_put`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId: currentOrganization.value.gid,
        domains: [], // Empty array clears all domains
        enabled: false, // Also disable auto-join
      }),
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      throw error

    // Reset UI state
    allowedDomain.value = ''
    autoJoinEnabled.value = false
    toast.success(t('domain-removed-successfully', 'Domain removed successfully'))
  }
  catch (error: any) {
    console.error('Error removing domain:', error)
    toast.error(t('error-removing-domain', 'Failed to remove domain'))
  }
  finally {
    isSaving.value = false
  }
}

/**
 * Toggle auto-join enabled/disabled state
 *
 * Called when user clicks the checkbox to enable or disable auto-join.
 * Keeps the domain configured but changes whether new users are auto-joined.
 *
 * Process:
 * 1. Sends current domain with new enabled state to backend
 * 2. Shows success message indicating new state
 * 3. Reverts checkbox on error (optimistic UI update)
 *
 * Note: Requires a domain to be configured first (checkbox disabled otherwise)
 */
async function toggleAutoJoinEnabled() {
  if (!currentOrganization.value?.gid || !allowedDomain.value)
    return

  isSaving.value = true
  try {
    const config = getLocalConfig()
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token

    if (!token) {
      // Revert checkbox on error
      autoJoinEnabled.value = !autoJoinEnabled.value
      toast.error(t('error-toggling-autojoin', 'Failed to update auto-join setting'))
      return
    }

    const response = await fetch(`${config.hostWeb}/private/organization_domains_put`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orgId: currentOrganization.value.gid,
        domains: [allowedDomain.value], // Keep existing domain
        enabled: autoJoinEnabled.value, // Update enabled state
      }),
    })

    const data = await response.json()

    if (!response.ok || data.error)
      throw new Error(data.error || 'Failed to update')

    toast.success(
      autoJoinEnabled.value
        ? t('auto-join-enabled', 'Auto-join enabled')
        : t('auto-join-disabled', 'Auto-join disabled'),
    )
  }
  catch (error: any) {
    console.error('Error toggling auto-join:', error)
    toast.error(t('error-toggling-auto-join', 'Failed to update auto-join setting'))
    // Revert on error
    autoJoinEnabled.value = !autoJoinEnabled.value
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
      <div class="p-6 space-y-6">
        <h2 class="mb-5 text-2xl font-bold dark:text-white text-slate-800">
          {{ t('organization-member-auto-enrollment', 'Organization Member Auto-Enrollment') }}
        </h2>

        <div v-if="!hasAdminPermission" class="p-4 text-center border rounded-lg bg-gray-50 dark:bg-gray-800 border-slate-300 dark:border-slate-700">
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('admin-permission-required', 'You need admin permissions to configure auto-join settings') }}
          </p>
        </div>

        <div v-else-if="isLoading" class="flex items-center justify-center p-8">
          <Spinner size="w-8 h-8" color="fill-blue-500 text-gray-200 dark:text-gray-600" />
        </div>

        <div v-else class="space-y-6">
          <!-- Enable/Disable Checkbox (Always shown under title) -->
          <div class="flex items-start gap-3">
            <input
              :id="allowedDomain ? 'auto-join-enabled' : 'new-domain-enabled'"
              v-model="autoJoinEnabled"
              type="checkbox"
              class="w-4 h-4 mt-1 text-blue-600 bg-white border-gray-300 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
              :disabled="isSaving || !allowedDomain"
              @change="allowedDomain && toggleAutoJoinEnabled()"
            >
            <label :for="allowedDomain ? 'auto-join-enabled' : 'new-domain-enabled'" class="flex-1 cursor-pointer">
              <span class="block text-sm font-medium dark:text-white text-slate-800">
                {{ t('enable-auto-join', 'Enable automatic member joining') }}
              </span>
              <span class="block mt-1 text-xs text-gray-600 dark:text-gray-400">
                <template v-if="allowedDomain">
                  {{ autoJoinEnabled
                    ? t('auto-join-enabled-description', `New users with {'@'}${allowedDomain} emails will automatically join this organization with read-only access`)
                    : t('auto-join-disabled-description', 'Auto-join is currently disabled. Enable it to automatically add new users with matching email domains')
                  }}
                </template>
                <template v-else>
                  {{ t('new-domain-enable-help', 'When enabled, users signing up with this domain will automatically join your organization with read-only permission') }}
                </template>
              </span>
            </label>
          </div>

          <!-- Current Domain Display -->
          <div v-if="allowedDomain" class="space-y-4">
            <div class="flex items-center justify-between p-4 border rounded-lg dark:bg-gray-800 dark:border-gray-600 border-slate-300">
              <div class="flex items-center gap-2">
                <span class="text-lg font-mono dark:text-white text-slate-800">@{{ allowedDomain }}</span>
                <span
                  class="px-2 py-1 text-xs font-medium rounded-full"
                  :class="autoJoinEnabled
                    ? 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400'
                    : 'text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-400'
                  "
                >
                  {{ autoJoinEnabled ? t('active', 'Active') : t('inactive', 'Inactive') }}
                </span>
              </div>
              <button
                type="button"
                class="px-3 py-2 text-xs font-medium text-center text-red-600 border rounded-lg cursor-pointer hover:text-white hover:bg-red-600 focus:ring-4 focus:ring-red-300 border-red-400 dark:hover:bg-red-600 dark:focus:ring-red-800 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isSaving"
                @click="removeDomain"
              >
                {{ t('remove', 'Remove') }}
              </button>
            </div>
          </div>

          <!-- Add Domain Form -->
          <div v-else class="space-y-4">
            <!-- Domain Input -->
            <div class="w-full md:pr-[50%]">
              <label class="block mb-2 text-sm font-medium dark:text-white text-slate-800">
                {{ t('add-email-domain', 'Organization Email Domain') }}
              </label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  @
                </span>
                <input
                  v-model="newDomain"
                  type="text"
                  :placeholder="t('domain-placeholder', 'yourcompany.com')"
                  class="w-full pl-8 pr-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  :disabled="isSaving"
                  @keydown.enter.prevent="saveDomain"
                >
              </div>
              <p class="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {{ t('domain-input-help', 'Enter your organization email domain (e.g., yourcompany.com)') }}
              </p>
            </div>

            <button
              type="button"
              class="px-3 py-2 text-xs font-medium text-center text-white rounded-lg cursor-pointer bg-blue-500 hover:bg-blue-600 focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-600 dark:focus:ring-blue-800 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="isSaving || !newDomain.trim()"
              @click="saveDomain"
            >
              <span v-if="!isSaving">
                {{ t('save-domain', 'Save Domain') }}
              </span>
              <Spinner v-else size="w-4 h-4" class="inline-block" color="fill-white text-blue-300" />
            </button>
          </div>

          <!-- Info Notice -->
          <div class="p-4 mt-6 border rounded-lg bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <p class="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
              {{ t('security-notice', 'Security:') }}
            </p>
            <ul class="space-y-1 text-sm text-amber-800 dark:text-amber-300 list-disc list-inside">
              <li>{{ t('security-blocked-providers', 'Public email providers (Gmail, Yahoo, Outlook, etc.) are blocked') }}</li>
              <li>{{ t('security-use-custom-domain', 'Only use domain owned by your organization') }}</li>
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
