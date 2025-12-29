<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconCheck from '~icons/heroicons/check-circle'
import IconChevronDown from '~icons/heroicons/chevron-down'
import IconClipboard from '~icons/heroicons/clipboard-document'
import IconCog from '~icons/heroicons/cog-6-tooth'
import IconGlobe from '~icons/heroicons/globe-alt'
import IconKey from '~icons/heroicons/key'
import IconPlus from '~icons/heroicons/plus'
import IconShield from '~icons/heroicons/shield-check'
import IconTrash from '~icons/heroicons/trash'
import IconX from '~icons/heroicons/x-circle'
import Spinner from '~/components/Spinner.vue'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

interface SSOConfig {
  id: string
  org_id: string
  supabase_sso_provider_id: string | null
  provider_type: string
  display_name: string | null
  metadata_url: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

interface Domain {
  id: string
  org_id: string
  domain: string
  verified: boolean
  verification_token: string | null
  verified_at: string | null
  auto_join_enabled: boolean
  auto_join_role: string
  created_at: string
  updated_at: string
}

const { t } = useI18n()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const dialogStore = useDialogV2Store()

displayStore.NavTitle = t('sso')

const { currentOrganization, currentRole } = storeToRefs(organizationStore)

const isLoading = ref(true)
const ssoConfig = ref<SSOConfig | null>(null)
const domains = ref<Domain[]>([])
const isEnterprise = ref(false)
const expandedDomainId = ref<string | null>(null)

// Form states
const showAddDomain = ref(false)
const newDomain = ref('')
const isAddingDomain = ref(false)
const verifyingDomainId = ref<string | null>(null)
const showSSOConfig = ref(false)
const ssoMetadataUrl = ref('')
const ssoDisplayName = ref('')
const ssoEnabled = ref(false)
const isSavingSSO = ref(false)

const hasSuperAdminPermission = computed(() => {
  return organizationStore.hasPermissionsInRole(currentRole.value, ['super_admin'])
})

onMounted(async () => {
  await organizationStore.dedupFetchOrganizations()
  await loadData()
})

watch(currentOrganization, async () => {
  await loadData()
})

async function loadData() {
  if (!currentOrganization.value?.gid)
    return

  isLoading.value = true

  try {
    const orgId = currentOrganization.value.gid

    // Check if org is Enterprise
    const { data: enterpriseData } = await supabase.rpc('is_enterprise_org', { p_org_id: orgId })
    isEnterprise.value = enterpriseData ?? false

    // Load SSO config using RPC
    const { data: configData, error: configError } = await supabase.rpc('get_org_sso_config', { p_org_id: orgId })

    if (!configError && configData && configData.length > 0) {
      ssoConfig.value = configData[0] as SSOConfig
      ssoMetadataUrl.value = ssoConfig.value.metadata_url || ''
      ssoDisplayName.value = ssoConfig.value.display_name || ''
      ssoEnabled.value = ssoConfig.value.enabled
    }
    else {
      ssoConfig.value = null
    }

    // Load domains using RPC
    const { data: domainsData, error: domainsError } = await supabase.rpc('get_org_domains', { p_org_id: orgId })

    if (!domainsError && domainsData) {
      domains.value = (domainsData as Domain[]) || []
    }
  }
  catch (err) {
    console.error('Error loading SSO data:', err)
    toast.error(t('sso-load-error'))
  }
  finally {
    isLoading.value = false
  }
}

async function addDomain() {
  if (!currentOrganization.value?.gid || !newDomain.value.trim())
    return

  isAddingDomain.value = true

  try {
    const { data, error } = await supabase.rpc('add_org_domain', {
      p_org_id: currentOrganization.value.gid,
      p_domain: newDomain.value.trim().toLowerCase(),
    })

    if (error) {
      toast.error(t('sso-add-domain-error'))
      return
    }

    const result = data?.[0]
    if (result?.error_code) {
      if (result.error_code === 'DOMAIN_ALREADY_CLAIMED') {
        toast.error(t('sso-domain-already-claimed'))
      }
      else if (result.error_code === 'REQUIRES_ENTERPRISE') {
        toast.error(t('sso-requires-enterprise'))
      }
      else if (result.error_code === 'NO_RIGHTS') {
        toast.error(t('no-permission'))
      }
      else {
        toast.error(t('sso-add-domain-error'))
      }
      return
    }

    toast.success(t('sso-domain-added'))
    newDomain.value = ''
    showAddDomain.value = false
    await loadData()
  }
  finally {
    isAddingDomain.value = false
  }
}

async function verifyDomain(domain: Domain) {
  verifyingDomainId.value = domain.id

  try {
    const { data, error } = await supabase.functions.invoke('private/sso/domains/verify', {
      method: 'POST',
      body: { domain_id: domain.id },
    })

    if (error) {
      toast.error(t('sso-verify-error'))
      return
    }

    if (data.verified) {
      toast.success(data.already_verified ? t('sso-domain-already-verified') : t('sso-domain-verified'))
      await loadData()
    }
    else {
      toast.error(data.message || t('sso-verify-failed'))
    }
  }
  finally {
    verifyingDomainId.value = null
  }
}

async function deleteDomain(domain: Domain) {
  dialogStore.openDialog({
    title: t('sso-delete-domain'),
    description: t('sso-delete-domain-confirm', { domain: domain.domain }),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-delete'),
        role: 'danger',
        handler: async () => {
          const { data, error } = await supabase.rpc('remove_org_domain', {
            p_domain_id: domain.id,
          })

          if (error || data !== 'OK') {
            toast.error(t('sso-delete-domain-error'))
            return
          }

          toast.success(t('sso-domain-deleted'))
          await loadData()
        },
      },
    ],
  })
}

async function updateDomainSettings(domain: Domain, settings: { auto_join_enabled?: boolean, auto_join_role?: string }) {
  const { data, error } = await supabase.rpc('update_org_domain_settings', {
    p_domain_id: domain.id,
    p_auto_join_enabled: settings.auto_join_enabled ?? null,
    p_auto_join_role: settings.auto_join_role ?? null,
  })

  if (error || (data && data !== 'OK')) {
    toast.error(t('sso-update-domain-error'))
    return
  }

  toast.success(t('sso-domain-updated'))
  await loadData()
}

async function saveSSOConfig() {
  if (!currentOrganization.value?.gid)
    return

  isSavingSSO.value = true

  try {
    const { data, error } = await supabase.rpc('upsert_org_sso_provider', {
      p_org_id: currentOrganization.value.gid,
      p_metadata_url: ssoMetadataUrl.value || null,
      p_display_name: ssoDisplayName.value || null,
      p_enabled: ssoEnabled.value,
      p_provider_type: 'saml',
    })

    if (error) {
      toast.error(t('sso-save-config-error'))
      return
    }

    const result = data?.[0]
    if (result?.error_code) {
      if (result.error_code === 'REQUIRES_ENTERPRISE') {
        toast.error(t('sso-requires-enterprise'))
      }
      else if (result.error_code === 'NO_RIGHTS') {
        toast.error(t('no-permission'))
      }
      else {
        toast.error(t('sso-save-config-error'))
      }
      return
    }

    toast.success(t('sso-config-saved'))
    showSSOConfig.value = false
    await loadData()
  }
  finally {
    isSavingSSO.value = false
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('copied-to-clipboard'))
  }
  catch {
    toast.error(t('copy-fail'))
  }
}

function toggleDomainExpand(domainId: string) {
  expandedDomainId.value = expandedDomainId.value === domainId ? null : domainId
}

function getRoleLabel(role: string): string {
  const roles: Record<string, string> = {
    read: t('role-read'),
    upload: t('role-upload'),
    write: t('role-write'),
    admin: t('role-admin'),
  }
  return roles[role] || role
}
</script>

<template>
  <div>
    <div class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
      <div class="p-6 space-y-6">
        <!-- Header -->
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-2xl font-bold dark:text-white text-slate-800">
              {{ t('sso') }}
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ t('sso-description') }}
            </p>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <Spinner size="w-8 h-8" />
        </div>

        <!-- Enterprise Required Banner -->
        <div
          v-else-if="!isEnterprise"
          class="p-6 text-center border rounded-lg border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800"
        >
          <IconShield class="w-12 h-12 mx-auto mb-4 text-amber-500" />
          <h3 class="text-lg font-semibold text-amber-800 dark:text-amber-200">
            {{ t('sso-enterprise-required') }}
          </h3>
          <p class="mt-2 text-sm text-amber-700 dark:text-amber-300">
            {{ t('sso-enterprise-required-description') }}
          </p>
          <router-link
            to="/settings/organization/plans"
            class="inline-block px-4 py-2 mt-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            {{ t('view-plans') }}
          </router-link>
        </div>

        <!-- SSO Content (Enterprise Only) -->
        <template v-else>
          <!-- SSO Provider Configuration -->
          <div class="p-4 border rounded-lg border-slate-200 dark:border-slate-700">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <IconKey class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    {{ t('sso-provider-config') }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('sso-provider-config-description') }}
                  </p>
                </div>
              </div>
              <button
                v-if="hasSuperAdminPermission"
                class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                @click="showSSOConfig = !showSSOConfig"
              >
                <IconCog class="w-4 h-4" />
                {{ showSSOConfig ? t('hide-config') : t('configure') }}
              </button>
            </div>

            <!-- SSO Config Status -->
            <div v-if="ssoConfig && !showSSOConfig" class="flex items-center gap-2 text-sm">
              <div
                class="w-2 h-2 rounded-full"
                :class="ssoConfig.enabled ? 'bg-green-500' : 'bg-gray-400'"
              />
              <span class="text-gray-600 dark:text-gray-400">
                {{ ssoConfig.enabled ? t('sso-enabled') : t('sso-disabled') }}
                <span v-if="ssoConfig.display_name"> - {{ ssoConfig.display_name }}</span>
              </span>
            </div>
            <div v-else-if="!ssoConfig && !showSSOConfig" class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('sso-not-configured') }}
            </div>

            <!-- SSO Config Form -->
            <div v-if="showSSOConfig" class="pt-4 mt-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('sso-display-name') }}
                </label>
                <input
                  v-model="ssoDisplayName"
                  type="text"
                  :placeholder="t('sso-display-name-placeholder')"
                  class="w-full px-3 py-2 border rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
              </div>

              <div>
                <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('sso-metadata-url') }}
                </label>
                <input
                  v-model="ssoMetadataUrl"
                  type="url"
                  :placeholder="t('sso-metadata-url-placeholder')"
                  class="w-full px-3 py-2 border rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ t('sso-metadata-url-hint') }}
                </p>
              </div>

              <div class="flex items-center gap-2">
                <input
                  id="sso-enabled"
                  v-model="ssoEnabled"
                  type="checkbox"
                  class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                >
                <label for="sso-enabled" class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('sso-enable-provider') }}
                </label>
              </div>

              <div class="flex justify-end gap-2">
                <button
                  class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                  @click="showSSOConfig = false"
                >
                  {{ t('button-cancel') }}
                </button>
                <button
                  class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  :disabled="isSavingSSO"
                  @click="saveSSOConfig"
                >
                  <Spinner v-if="isSavingSSO" size="w-4 h-4" />
                  {{ t('button-save') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Domain Management -->
          <div class="p-4 border rounded-lg border-slate-200 dark:border-slate-700">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <IconGlobe class="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    {{ t('sso-domains') }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('sso-domains-description') }}
                  </p>
                </div>
              </div>
              <button
                v-if="hasSuperAdminPermission"
                class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                @click="showAddDomain = !showAddDomain"
              >
                <IconPlus class="w-4 h-4" />
                {{ t('sso-add-domain') }}
              </button>
            </div>

            <!-- Add Domain Form -->
            <div v-if="showAddDomain" class="p-4 mb-4 border rounded-lg border-slate-200 dark:border-slate-700 bg-gray-50 dark:bg-gray-900/50">
              <div class="flex gap-2">
                <input
                  v-model="newDomain"
                  type="text"
                  :placeholder="t('sso-domain-placeholder')"
                  class="flex-1 px-3 py-2 border rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  @keyup.enter="addDomain"
                >
                <button
                  class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  :disabled="isAddingDomain || !newDomain.trim()"
                  @click="addDomain"
                >
                  <Spinner v-if="isAddingDomain" size="w-4 h-4" />
                  {{ t('sso-add') }}
                </button>
                <button
                  class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                  @click="showAddDomain = false"
                >
                  {{ t('button-cancel') }}
                </button>
              </div>
            </div>

            <!-- Domains List -->
            <div v-if="domains.length === 0" class="py-8 text-center text-gray-500 dark:text-gray-400">
              {{ t('sso-no-domains') }}
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="domain in domains"
                :key="domain.id"
                class="overflow-hidden border rounded-lg border-slate-200 dark:border-slate-700"
              >
                <!-- Domain Header -->
                <div
                  class="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  @click="toggleDomainExpand(domain.id)"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div
                        class="flex items-center justify-center w-8 h-8 rounded-full"
                        :class="domain.verified ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'"
                      >
                        <IconCheck v-if="domain.verified" class="w-4 h-4 text-green-600 dark:text-green-400" />
                        <IconX v-else class="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <div class="font-medium text-gray-900 dark:text-white">
                          {{ domain.domain }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          {{ domain.verified ? t('sso-verified') : t('sso-pending-verification') }}
                          <span v-if="domain.auto_join_enabled" class="ml-2">
                            &middot; {{ t('sso-auto-join') }}: {{ getRoleLabel(domain.auto_join_role) }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <IconChevronDown
                      class="w-5 h-5 text-gray-400 transition-transform"
                      :class="expandedDomainId === domain.id ? 'rotate-180' : ''"
                    />
                  </div>
                </div>

                <!-- Expanded Content -->
                <div
                  v-if="expandedDomainId === domain.id"
                  class="p-4 space-y-4 border-t border-slate-200 dark:border-slate-700 bg-gray-50 dark:bg-gray-900/50"
                >
                  <!-- Verification Instructions (if not verified) -->
                  <div v-if="!domain.verified && domain.verification_token" class="p-3 border rounded-lg border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
                    <h4 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200">
                      {{ t('sso-verification-instructions') }}
                    </h4>
                    <p class="mb-2 text-xs text-blue-700 dark:text-blue-300">
                      {{ t('sso-verification-instructions-detail') }}
                    </p>
                    <div class="space-y-2">
                      <div class="flex items-center gap-2">
                        <code class="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800 rounded border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200 truncate">
                          _capgo-verification.{{ domain.domain }}
                        </code>
                        <button
                          class="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                          @click.stop="copyToClipboard(`_capgo-verification.${domain.domain}`)"
                        >
                          <IconClipboard class="w-4 h-4" />
                        </button>
                      </div>
                      <div class="flex items-center gap-2">
                        <code class="flex-1 px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800 rounded border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200 truncate">
                          {{ domain.verification_token }}
                        </code>
                        <button
                          class="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                          @click.stop="copyToClipboard(domain.verification_token!)"
                        >
                          <IconClipboard class="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Auto-Join Settings -->
                  <div v-if="domain.verified && hasSuperAdminPermission" class="space-y-3">
                    <div class="flex items-center justify-between">
                      <div>
                        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {{ t('sso-auto-join-enabled') }}
                        </label>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                          {{ t('sso-auto-join-description') }}
                        </p>
                      </div>
                      <button
                        class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                        :class="domain.auto_join_enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'"
                        @click.stop="updateDomainSettings(domain, { auto_join_enabled: !domain.auto_join_enabled })"
                      >
                        <span
                          class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                          :class="domain.auto_join_enabled ? 'translate-x-6' : 'translate-x-1'"
                        />
                      </button>
                    </div>

                    <div v-if="domain.auto_join_enabled">
                      <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {{ t('sso-default-role') }}
                      </label>
                      <select
                        :value="domain.auto_join_role"
                        class="w-full px-3 py-2 border rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        @change="updateDomainSettings(domain, { auto_join_role: ($event.target as HTMLSelectElement).value })"
                        @click.stop
                      >
                        <option value="read">
                          {{ t('role-read') }}
                        </option>
                        <option value="upload">
                          {{ t('role-upload') }}
                        </option>
                        <option value="write">
                          {{ t('role-write') }}
                        </option>
                        <option value="admin">
                          {{ t('role-admin') }}
                        </option>
                      </select>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="flex flex-wrap gap-2 pt-2">
                    <button
                      v-if="!domain.verified && hasSuperAdminPermission"
                      class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                      :disabled="verifyingDomainId === domain.id"
                      @click.stop="verifyDomain(domain)"
                    >
                      <Spinner v-if="verifyingDomainId === domain.id" size="w-4 h-4" />
                      <IconCheck v-else class="w-4 h-4" />
                      {{ t('sso-verify-domain') }}
                    </button>

                    <button
                      v-if="hasSuperAdminPermission"
                      class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 dark:bg-gray-800 dark:border-red-600 dark:hover:bg-red-900/20"
                      @click.stop="deleteDomain(domain)"
                    >
                      <IconTrash class="w-4 h-4" />
                      {{ t('button-delete') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
