<script setup lang="ts">
import type { ConnectApp } from '~/components/connect/ConnectAppPicker.vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconArrowLeft from '~icons/heroicons/arrow-left-20-solid'
import IconCheckCircle from '~icons/heroicons/check-circle'
import IconClipboard from '~icons/heroicons/clipboard-document'
import IconKey from '~icons/heroicons/key'
import IconLock from '~icons/heroicons/lock-closed'
import ConnectAppPicker from '~/components/connect/ConnectAppPicker.vue'
import { createAiApiKey } from '~/services/apikeys'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'

type Role = 'admin' | 'member'

const { t } = useI18n()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()

const tokenName = ref(t('connect-token-name-default'))
const role = ref<Role>('member')
const apps = ref<ConnectApp[]>([])
const selectedAppIds = ref<string[]>([])
const isLoadingApps = ref(false)
const isGenerating = ref(false)
const generatedKey = ref<string | null>(null)

const currentOrgId = computed(() => organizationStore.currentOrganization?.gid ?? null)
const currentOrgName = computed(() => organizationStore.currentOrganization?.name ?? '')

const pasteLine = computed(() => `Log into Capgo with this key: ${generatedKey.value ?? ''}`)

const scopeChip = computed(() => {
  if (role.value === 'admin')
    return t('connect-scope-admin')
  return t('connect-scope-member', { count: selectedAppIds.value.length })
})

const canGenerate = computed(() => {
  if (!currentOrgId.value || isGenerating.value)
    return false
  if (role.value === 'member' && selectedAppIds.value.length === 0)
    return false
  return true
})

async function loadApps(orgId: string): Promise<void> {
  isLoadingApps.value = true
  try {
    const { data, error } = await supabase
      .from('apps')
      .select('id, app_id, name, owner_org')
      .eq('owner_org', orgId)
      .order('name', { ascending: true })

    if (error)
      throw error

    apps.value = (data ?? [])
      .filter((app): app is typeof app & { id: string } => typeof app.id === 'string')
      .map(app => ({
        id: app.id,
        app_id: app.app_id,
        name: app.name,
      }))
  }
  catch {
    apps.value = []
    toast.error(t('connect-generate-error'))
  }
  finally {
    isLoadingApps.value = false
  }
}

watch(currentOrgId, (orgId) => {
  selectedAppIds.value = []
  apps.value = []
  if (orgId)
    loadApps(orgId)
}, { immediate: true })

async function generate(): Promise<void> {
  const orgId = currentOrgId.value
  if (!orgId || !canGenerate.value)
    return

  isGenerating.value = true
  try {
    const { data, error } = await createAiApiKey(supabase, tokenName.value.trim() || t('connect-token-name-default'), {
      orgId,
      role: role.value,
      appUuids: role.value === 'member' ? [...selectedAppIds.value] : undefined,
    })

    if (error)
      throw error

    const key = typeof data?.key === 'string' ? data.key : null
    if (!key)
      throw new Error('missing key')

    generatedKey.value = key
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  catch (e) {
    // Surface actionable backend errors (e.g. a forbidden binding for a non-admin)
    // instead of a blind generic toast; log for diagnostics, keep a generic fallback.
    console.error('createAiApiKey failed', e)
    let detail = ''
    try {
      const ctx = (e as { context?: { json?: () => Promise<{ error?: string, message?: string }> } }).context
      if (ctx?.json) {
        const body = await ctx.json()
        detail = body?.error ?? body?.message ?? ''
      }
      else if (e instanceof Error && e.message && e.message !== 'missing key') {
        detail = e.message
      }
    }
    catch {
      // response body wasn't JSON / unreadable — fall back to the generic message
    }
    toast.error(detail ? `${t('connect-generate-error')}: ${detail}` : t('connect-generate-error'))
  }
  finally {
    isGenerating.value = false
  }
}

async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(t('connect-copied'))
  }
  catch {
    toast.error(t('copy-fail'))
  }
}

function back(): void {
  generatedKey.value = null
}
</script>

<template>
  <div class="h-full w-full overflow-y-auto bg-slate-100 dark:bg-slate-900">
    <div class="mx-auto flex w-full max-w-xl flex-col px-4 py-8 sm:px-6">
      <!-- Header -->
      <div class="mb-5 flex items-center gap-3">
        <span class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <IconKey class="h-5 w-5 text-primary" />
        </span>
        <div class="min-w-0">
          <p class="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Capgo
          </p>
          <p class="mt-0.5 truncate text-sm font-medium text-slate-600 dark:text-slate-300">
            {{ t('connect-subtitle') }}
          </p>
        </div>
      </div>

      <!-- ============ GENERATE VIEW ============ -->
      <div
        v-if="!generatedKey"
        class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-7"
      >
        <div>
          <p class="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-slate-500">
            {{ t('connect-key-label') }}
          </p>
          <h2 class="mt-2 text-2xl font-semibold leading-tight text-slate-950 dark:text-white">
            {{ t('connect-title') }}
          </h2>
          <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {{ t('connect-intro') }}
          </p>
        </div>

        <div class="mt-6 space-y-5">
          <!-- Token name -->
          <div>
            <label for="connect-token-name-input" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
              {{ t('connect-token-name') }}
            </label>
            <input
              id="connect-token-name-input"
              v-model="tokenName"
              type="text"
              class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-azure-500 focus:ring-2 focus:ring-azure-500/25 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <!-- Organization (read-only scope) -->
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {{ t('connect-organization') }}
              </label>
              <div class="flex items-center rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                <span class="truncate">{{ currentOrgName || '—' }}</span>
              </div>
            </div>
            <!-- Role -->
            <div>
              <label for="connect-role-select" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                {{ t('connect-role') }}
              </label>
              <select
                id="connect-role-select"
                v-model="role"
                class="w-full appearance-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-azure-500 focus:ring-2 focus:ring-azure-500/25 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="member">
                  {{ t('connect-role-member') }}
                </option>
                <option value="admin">
                  {{ t('connect-role-admin') }}
                </option>
              </select>
            </div>
          </div>

          <!-- App scope: member only -->
          <ConnectAppPicker
            v-if="role === 'member'"
            v-model="selectedAppIds"
            :apps="apps"
          />

          <!-- Admin note -->
          <div
            v-else
            class="rounded-2xl border border-azure-500/35 bg-azure-500/5 p-4"
          >
            <div class="flex items-start gap-2.5">
              <IconLock class="mt-0.5 h-5 w-5 shrink-0 text-azure-500" />
              <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">
                {{ t('connect-admin-note', { org: currentOrgName }) }}
              </p>
            </div>
          </div>
        </div>

        <!-- No org hint -->
        <p v-if="!currentOrgId" class="mt-5 text-sm text-error">
          {{ t('connect-no-org') }}
        </p>

        <div class="mt-7">
          <button
            type="button"
            :disabled="!canGenerate"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#244366] to-azure-500 px-4 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            @click="generate"
          >
            <IconKey class="h-5 w-5" />
            <span v-if="isGenerating">{{ t('loading') }}</span>
            <span v-else>{{ t('connect-generate') }}</span>
          </button>
        </div>

        <div class="mt-5 flex items-start gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <IconLock class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p class="text-xs leading-5 text-slate-400">
            {{ t('connect-key-ready-desc') }}
          </p>
        </div>
      </div>

      <!-- ============ SUCCESS VIEW ============ -->
      <div
        v-else
        class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-7"
      >
        <div class="flex flex-col items-center text-center">
          <span class="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15">
            <IconCheckCircle class="h-7 w-7 text-success" />
          </span>
          <h2 class="mt-4 text-2xl font-semibold leading-tight text-slate-950 dark:text-white">
            {{ t('connect-key-ready') }}
          </h2>
          <p class="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
            {{ t('connect-key-ready-desc') }}
          </p>
          <div class="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            <span>{{ scopeChip }}</span>
          </div>
        </div>

        <!-- API key -->
        <div class="mt-6">
          <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {{ t('connect-key-label') }}
          </label>
          <div class="flex items-stretch gap-2">
            <code class="flex-1 truncate rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 font-mono text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
              {{ generatedKey }}
            </code>
            <button
              type="button"
              class="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:border-azure-500/45 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              @click="copy(generatedKey ?? '')"
            >
              <IconClipboard class="h-4 w-4" />
              <span>{{ t('connect-copy') }}</span>
            </button>
          </div>
        </div>

        <!-- Paste this to your AI -->
        <div class="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <p class="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-slate-500">
            {{ t('connect-paste-title') }}
          </p>
          <div class="mt-2 flex items-stretch gap-2">
            <code class="flex-1 truncate rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              {{ pasteLine }}
            </code>
            <button
              type="button"
              class="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-azure-500/45 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              @click="copy(pasteLine)"
            >
              <IconClipboard class="h-4 w-4" />
              <span>{{ t('connect-copy') }}</span>
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-400">
            {{ t('connect-paste-hint') }}
          </p>
        </div>

        <!-- Back -->
        <div class="mt-6">
          <button
            type="button"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base font-semibold text-slate-700 transition-colors hover:border-azure-500/45 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            @click="back"
          >
            <IconArrowLeft class="h-5 w-5" />
            {{ t('connect-back') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
