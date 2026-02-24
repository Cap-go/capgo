<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconGlobeAlt from '~icons/heroicons/globe-alt'
import IconPlus from '~icons/heroicons/plus'
import IconTrash from '~icons/heroicons/trash'
import Spinner from '~/components/Spinner.vue'
import { defaultApiHost, useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'

interface SsoProvider {
  id: string
  org_id: string
  domain: string
  provider_id: string | null
  status: 'pending_verification' | 'verified' | 'active' | 'disabled'
  enforce_sso: boolean
  metadata_url: string
  dns_verification_token: string | null
  created_at: string
  updated_at: string
}

const props = defineProps<{
  orgId: string
}>()

const { t } = useI18n()
const supabase = useSupabase()
const dialogStore = useDialogV2Store()

const providers = ref<SsoProvider[]>([])
const isLoading = ref(true)
const isSubmitting = ref(false)
const isVerifying = ref<string | null>(null)
const showAddForm = ref(false)

// Form fields
const newDomain = ref('')
const newMetadataUrl = ref('')

// Track recently created provider to show DNS token
const recentlyCreatedId = ref<string | null>(null)

const recentlyCreatedProvider = computed(() => {
  if (!recentlyCreatedId.value)
    return null
  return providers.value.find(p => p.id === recentlyCreatedId.value) ?? null
})

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: currentSession } = await supabase.auth.getSession()
  if (!currentSession.session)
    throw new Error('Not authenticated')

  return {
    'Content-Type': 'application/json',
    'authorization': `Bearer ${currentSession.session.access_token}`,
  }
}

async function fetchProviders() {
  isLoading.value = true
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${defaultApiHost}/private/sso/providers/${props.orgId}`, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      console.error('Failed to fetch SSO providers:', response.status)
      toast.error(t('sso-error-loading'))
      return
    }

    const data = await response.json() as SsoProvider[]
    providers.value = data
  }
  catch (error) {
    console.error('Error fetching SSO providers:', error)
    toast.error(t('sso-error-loading'))
  }
  finally {
    isLoading.value = false
  }
}

async function addProvider() {
  if (!newDomain.value.trim() || !newMetadataUrl.value.trim()) {
    toast.error(t('sso-fill-all-fields'))
    return
  }

  isSubmitting.value = true
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${defaultApiHost}/private/sso/providers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        org_id: props.orgId,
        domain: newDomain.value.trim(),
        metadata_url: newMetadataUrl.value.trim(),
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      toast.error(errorData.error || t('sso-error-creating'))
      return
    }

    const created = await response.json() as SsoProvider
    providers.value.push(created)
    recentlyCreatedId.value = created.id

    // Reset form
    newDomain.value = ''
    newMetadataUrl.value = ''
    showAddForm.value = false

    toast.success(t('sso-provider-created'))
  }
  catch (error) {
    console.error('Error creating SSO provider:', error)
    toast.error(t('sso-error-creating'))
  }
  finally {
    isSubmitting.value = false
  }
}

async function verifyDns(providerId: string) {
  isVerifying.value = providerId
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${defaultApiHost}/private/sso/verify-dns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider_id: providerId }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      toast.error(errorData.error || t('sso-dns-verification-failed'))
      return
    }

    // Refresh to get updated status
    await fetchProviders()
    toast.success(t('sso-dns-verified'))
  }
  catch (error) {
    console.error('Error verifying DNS:', error)
    toast.error(t('sso-dns-verification-failed'))
  }
  finally {
    isVerifying.value = null
  }
}

async function deleteProvider(provider: SsoProvider) {
  dialogStore.openDialog({
    title: t('sso-delete-title'),
    description: t('sso-delete-confirm', { domain: provider.domain }),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-delete'),
        role: 'danger',
        handler: async () => {
          try {
            const headers = await getAuthHeaders()
            const response = await fetch(`${defaultApiHost}/private/sso/providers/${provider.id}`, {
              method: 'DELETE',
              headers,
            })

            if (!response.ok) {
              toast.error(t('sso-error-deleting'))
              return
            }

            providers.value = providers.value.filter(p => p.id !== provider.id)
            if (recentlyCreatedId.value === provider.id)
              recentlyCreatedId.value = null

            toast.success(t('sso-provider-deleted'))
          }
          catch (error) {
            console.error('Error deleting SSO provider:', error)
            toast.error(t('sso-error-deleting'))
          }
        },
      },
    ],
  })
}

function getStatusBadgeClass(status: SsoProvider['status']): string {
  switch (status) {
    case 'active':
      return 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400'
    case 'verified':
      return 'text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400'
    case 'pending_verification':
      return 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400'
    case 'disabled':
      return 'text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-300'
    default:
      return 'text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-300'
  }
}

function getStatusLabel(status: SsoProvider['status']): string {
  switch (status) {
    case 'active':
      return t('sso-status-active')
    case 'verified':
      return t('sso-status-verified')
    case 'pending_verification':
      return t('sso-status-pending')
    case 'disabled':
      return t('sso-status-disabled')
    default:
      return status
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

onMounted(fetchProviders)
</script>

<template>
  <section class="p-6 border rounded-lg border-slate-200 dark:border-slate-700">
    <!-- Header -->
    <div class="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-4">
        <div class="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
          <IconGlobeAlt class="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 class="text-lg font-semibold dark:text-white text-slate-800">
            {{ t('sso-configuration') }}
          </h3>
          <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {{ t('sso-configuration-description') }}
          </p>
        </div>
      </div>
      <button
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800"
        @click="showAddForm = !showAddForm"
      >
        <IconPlus class="w-5 h-5" />
        {{ t('sso-add-provider') }}
      </button>
    </div>

    <!-- Add Provider Form -->
    <div
      v-if="showAddForm"
      class="p-4 mb-6 border rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
    >
      <h4 class="mb-4 text-base font-semibold dark:text-white text-slate-800">
        {{ t('sso-new-provider') }}
      </h4>
      <div class="space-y-4">
        <div>
          <label class="block mb-1 text-sm font-medium dark:text-white text-slate-700">
            {{ t('sso-domain') }}
          </label>
          <input
            v-model="newDomain"
            type="text"
            :placeholder="t('sso-domain-placeholder')"
            :disabled="isSubmitting"
            class="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50"
          >
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {{ t('sso-domain-help') }}
          </p>
        </div>
        <div>
          <label class="block mb-1 text-sm font-medium dark:text-white text-slate-700">
            {{ t('sso-metadata-url') }}
          </label>
          <input
            v-model="newMetadataUrl"
            type="url"
            :placeholder="t('sso-metadata-url-placeholder')"
            :disabled="isSubmitting"
            class="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50"
          >
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {{ t('sso-metadata-url-help') }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            :disabled="isSubmitting"
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="addProvider"
          >
            <span v-if="isSubmitting" class="flex items-center gap-2">
              <Spinner size="w-4 h-4" />
              {{ t('sso-creating') }}
            </span>
            <span v-else>{{ t('sso-create-provider') }}</span>
          </button>
          <button
            :disabled="isSubmitting"
            class="px-4 py-2 text-sm font-medium border rounded-lg text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
            @click="showAddForm = false"
          >
            {{ t('button-cancel') }}
          </button>
        </div>
      </div>
    </div>

    <!-- DNS Verification Instructions (shown after creation) -->
    <div
      v-if="recentlyCreatedProvider && recentlyCreatedProvider.dns_verification_token"
      class="p-4 mb-6 border rounded-lg border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
    >
      <h4 class="mb-2 font-semibold text-blue-800 dark:text-blue-200">
        {{ t('sso-dns-verification-required') }}
      </h4>
      <p class="mb-3 text-sm text-blue-700 dark:text-blue-300">
        {{ t('sso-dns-verification-instructions') }}
      </p>
      <div class="p-3 mb-3 font-mono text-sm bg-white border border-blue-200 rounded dark:bg-gray-800 dark:border-blue-700">
        <p class="text-slate-600 dark:text-slate-400">
          {{ t('sso-dns-record-type') }}: <span class="font-semibold text-slate-800 dark:text-white">TXT</span>
        </p>
        <p class="text-slate-600 dark:text-slate-400">
          {{ t('sso-dns-record-name') }}: <span class="font-semibold text-slate-800 dark:text-white">_capgo-sso.{{ recentlyCreatedProvider.domain }}</span>
        </p>
        <p class="text-slate-600 dark:text-slate-400">
          {{ t('sso-dns-record-value') }}: <span class="font-semibold text-slate-800 dark:text-white">{{ recentlyCreatedProvider.dns_verification_token }}</span>
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button
          :disabled="isVerifying === recentlyCreatedProvider.id"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="verifyDns(recentlyCreatedProvider.id)"
        >
          <span v-if="isVerifying === recentlyCreatedProvider.id" class="flex items-center gap-2">
            <Spinner size="w-4 h-4" />
            {{ t('sso-verifying') }}
          </span>
          <span v-else>{{ t('sso-verify-dns') }}</span>
        </button>
        <button
          class="px-3 py-2 text-sm font-medium border rounded-lg text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
          @click="recentlyCreatedId = null"
        >
          {{ t('sso-dismiss') }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Spinner size="w-8 h-8" color="fill-blue-500 text-gray-200 dark:text-gray-600" />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="providers.length === 0"
      class="py-12 text-center"
    >
      <div class="flex justify-center mb-4">
        <div class="p-4 bg-gray-100 rounded-full dark:bg-gray-700">
          <IconGlobeAlt class="w-12 h-12 text-gray-400" />
        </div>
      </div>
      <h4 class="text-lg font-medium text-gray-900 dark:text-white">
        {{ t('sso-no-providers') }}
      </h4>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {{ t('sso-no-providers-description') }}
      </p>
    </div>

    <!-- Providers List -->
    <div v-else class="space-y-3">
      <div
        v-for="provider in providers"
        :key="provider.id"
        class="flex flex-col gap-3 p-4 border rounded-lg sm:flex-row sm:items-center sm:justify-between border-slate-200 dark:border-slate-700"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-3">
            <h4 class="text-sm font-semibold truncate dark:text-white text-slate-800">
              {{ provider.domain }}
            </h4>
            <span
              class="px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap"
              :class="getStatusBadgeClass(provider.status)"
            >
              {{ getStatusLabel(provider.status) }}
            </span>
          </div>
          <p class="mt-1 text-xs truncate text-slate-500 dark:text-slate-400">
            {{ provider.metadata_url }}
          </p>
          <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {{ t('created-at') }}: {{ formatDate(provider.created_at) }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="provider.status === 'pending_verification'"
            :disabled="isVerifying === provider.id"
            class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 dark:bg-gray-800 dark:text-blue-400 dark:border-blue-600 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="verifyDns(provider.id)"
          >
            <Spinner v-if="isVerifying === provider.id" size="w-4 h-4" />
            <span>{{ t('sso-verify-dns') }}</span>
          </button>
          <button
            class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 dark:bg-gray-800 dark:border-red-600 dark:hover:bg-red-900/20"
            @click="deleteProvider(provider)"
          >
            <IconTrash class="w-4 h-4" />
            {{ t('delete') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
