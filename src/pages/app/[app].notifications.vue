<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconBell from '~icons/lucide/bell'
import IconCheckCircle from '~icons/lucide/check-circle-2'
import IconClock from '~icons/lucide/clock-3'
import IconDatabaseZap from '~icons/lucide/database-zap'
import IconRefresh from '~icons/lucide/refresh-cw'
import IconSearch from '~icons/lucide/search'
import IconSend from '~icons/lucide/send'
import IconSettings from '~icons/lucide/settings'
import IconSmartphone from '~icons/lucide/smartphone'
import IconZap from '~icons/lucide/zap'
import { defaultApiHost, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

interface NotificationProviderConfig {
  id: string
  platform: string
  status: string
  config: Record<string, unknown>
  secret_ref?: string | null
}

interface NotificationCampaign {
  id: string
  created_at: string
  name: string
  kind: string
  status: string
  audience: Record<string, unknown>
  payload: Record<string, unknown>
}

interface NotificationDevice {
  deviceKey: string
  recipientKey: string
  platform: string
  appVersion: string
  pluginVersion: string
  badge: number
  permission: number
  updatedAt: string
}

interface NotificationStat {
  event: string
  count: number
}

interface NotificationSettings {
  appId: string
  pushUpdateEnabled: boolean
  pushUpdateInstallMode: 'next' | 'set'
  pushUpdateChannel: string | null
}

interface NotificationQueueResponse {
  queued?: boolean
}

const { t } = useI18n()
const route = useRoute()
const supabase = useSupabase()
const displayStore = useDisplayStore()

const id = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const app = ref<Database['public']['Tables']['apps']['Row']>()
const providers = ref<NotificationProviderConfig[]>([])
const campaigns = ref<NotificationCampaign[]>([])
const stats = ref<NotificationStat[]>([])
const devices = ref<NotificationDevice[]>([])
const settings = ref<NotificationSettings>({
  appId: '',
  pushUpdateEnabled: false,
  pushUpdateInstallMode: 'next',
  pushUpdateChannel: null,
})

const providerForm = ref({
  platform: 'android',
  status: 'draft',
  secretRef: '',
  config: '{\n  "projectId": "",\n  "serviceAccountEmail": ""\n}',
})
const campaignForm = ref({
  name: '',
  kind: 'alert',
  audience: '{\n  "broadcast": false\n}',
  payload: '{\n  "title": "",\n  "body": ""\n}',
})
const lookupExternalId = ref('')
const sendExternalId = ref('')
const sendTitle = ref('')
const sendBody = ref('')
const pushUpdateChannel = ref('')

function normalizeSecretRefSegment(value: string): string {
  let normalized = ''
  let needsSeparator = false
  for (const char of value.toUpperCase()) {
    const code = char.charCodeAt(0)
    const isAlpha = code >= 65 && code <= 90
    const isDigit = code >= 48 && code <= 57
    if (isAlpha || isDigit) {
      if (needsSeparator && normalized)
        normalized += '_'
      normalized += char
      needsSeparator = false
      if (normalized.length >= 96)
        break
    }
    else if (normalized) {
      needsSeparator = true
    }
  }
  return normalized || 'APP'
}

const totalEvents = computed(() => stats.value.reduce((total, item) => total + Number(item.count || 0), 0))
const configuredProviders = computed(() => providers.value.filter(provider => provider.status === 'configured').length)
const latestCampaigns = computed(() => campaigns.value.slice(0, 6))
const hasStats = computed(() => stats.value.length > 0)
const expectedProviderSecretRef = computed(() => {
  const normalizedAppId = normalizeSecretRefSegment(id.value)
  return `NOTIFICATIONS_${normalizedAppId}_${providerSecretRefSegment(providerForm.value.platform)}`
})
const providerConfigPlaceholder = computed(() => {
  if (providerForm.value.platform === 'ios') {
    return '{\n  "teamId": "",\n  "keyId": "",\n  "bundleId": "",\n  "environment": "production"\n}'
  }
  return '{\n  "projectId": "",\n  "serviceAccountEmail": ""\n}'
})

function providerSecretRefSegment(platform: string) {
  return platform === 'ios' ? 'IOS' : 'ANDROID'
}

function notificationPlatformLabel(platform?: string) {
  if (platform === 'android')
    return t('notification-platform-android')
  if (platform === 'ios')
    return t('notification-platform-ios')
  return platform?.toUpperCase() || t('unknown')
}

let activeRefreshId = 0

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token)
    throw new Error(t('not-authenticated'))
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function notificationFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await authHeaders()
  const requestHeaders = new Headers(init.headers)
  Object.entries(headers).forEach(([key, value]) => requestHeaders.set(key, value))
  const response = await fetch(`${defaultApiHost}/notifications${path}`, {
    ...init,
    headers: requestHeaders,
  })
  if (!response.ok)
    throw new Error(await response.text())
  return response.json() as Promise<T>
}

function parseJson(value: string, fallback: Record<string, unknown>) {
  if (!value.trim())
    return fallback
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('invalid')
    return parsed as Record<string, unknown>
  }
  catch {
    throw new Error(t('notification-invalid-json'))
  }
}

function statusClass(status: string) {
  if (status === 'configured' || status === 'sent')
    return 'border-vista-blue-500/40 bg-vista-blue-500/10 text-vista-blue-700 dark:text-vista-blue-200'
  if (status === 'disabled' || status === 'failed' || status === 'cancelled')
    return 'border-pumpkin-orange-500/40 bg-pumpkin-orange-500/10 text-pumpkin-orange-700 dark:text-pumpkin-orange-200'
  if (status === 'queued' || status === 'sending' || status === 'scheduled')
    return 'border-azure-500/40 bg-azure-500/10 text-azure-700 dark:text-azure-200'
  return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortKey(value: string) {
  return value ? value.slice(0, 18) : ''
}

async function loadAppInfo(appId: string) {
  const { data, error } = await supabase
    .from('apps')
    .select()
    .eq('app_id', appId)
    .maybeSingle()
  if (error)
    throw error
  return data ?? undefined
}

async function loadNotifications(appId = id.value) {
  const query = encodeURIComponent(appId)
  const [providerResponse, campaignResponse, statsResponse, settingsResponse] = await Promise.all([
    notificationFetch<{ data: NotificationProviderConfig[] }>(`/providers?app_id=${query}`),
    notificationFetch<{ data: NotificationCampaign[] }>(`/campaigns?app_id=${query}`),
    notificationFetch<{ data: NotificationStat[] }>(`/stats?app_id=${query}&days=30`),
    notificationFetch<NotificationSettings>(`/settings?app_id=${query}`),
  ])
  return {
    campaigns: campaignResponse.data || [],
    providers: providerResponse.data || [],
    settings: settingsResponse,
    stats: statsResponse.data || [],
  }
}

function applyNotificationData(data: Awaited<ReturnType<typeof loadNotifications>>) {
  campaigns.value = data.campaigns
  providers.value = data.providers
  settings.value = data.settings
  stats.value = data.stats
  pushUpdateChannel.value = data.settings.pushUpdateChannel || ''
}

async function reloadNotifications() {
  applyNotificationData(await loadNotifications())
}

async function refreshData(appId = id.value, refreshId = ++activeRefreshId) {
  isLoading.value = true
  try {
    const appData = await loadAppInfo(appId)
    if (refreshId !== activeRefreshId)
      return
    app.value = appData
    if (!appData)
      return

    try {
      applyNotificationData(await loadNotifications(appId))
    }
    catch (error) {
      if (refreshId !== activeRefreshId)
        return
      console.error(error)
      toast.error(t('notification-load-error'))
    }
  }
  catch (error) {
    if (refreshId !== activeRefreshId)
      return
    console.error(error)
    toast.error(t('notification-load-error'))
  }
  finally {
    if (refreshId === activeRefreshId)
      isLoading.value = false
  }
}

async function saveProvider() {
  isSaving.value = true
  try {
    await notificationFetch('/providers', {
      method: 'PUT',
      body: JSON.stringify({
        appId: id.value,
        platform: providerForm.value.platform,
        status: providerForm.value.status,
        secretRef: providerForm.value.secretRef.trim() || (providerForm.value.status === 'configured' ? expectedProviderSecretRef.value : null),
        config: parseJson(providerForm.value.config, {}),
      }),
    })
    toast.success(t('notification-save-success'))
    await reloadNotifications()
  }
  catch (error) {
    console.error(error)
    toast.error(error instanceof Error ? error.message : t('notification-action-error'))
  }
  finally {
    isSaving.value = false
  }
}

async function createCampaign() {
  isSaving.value = true
  try {
    await notificationFetch('/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        appId: id.value,
        name: campaignForm.value.name,
        kind: campaignForm.value.kind,
        audience: parseJson(campaignForm.value.audience, {}),
        payload: parseJson(campaignForm.value.payload, {}),
      }),
    })
    campaignForm.value.name = ''
    toast.success(t('notification-create-success'))
    await reloadNotifications()
  }
  catch (error) {
    console.error(error)
    toast.error(error instanceof Error ? error.message : t('notification-action-error'))
  }
  finally {
    isSaving.value = false
  }
}

async function lookupRecipient() {
  if (!lookupExternalId.value.trim())
    return
  isSaving.value = true
  try {
    const response = await notificationFetch<{ devices: NotificationDevice[] }>('/recipients/lookup', {
      method: 'POST',
      body: JSON.stringify({ appId: id.value, externalId: lookupExternalId.value.trim() }),
    })
    devices.value = response.devices || []
    toast.success(t('notification-lookup-success'))
  }
  catch (error) {
    console.error(error)
    toast.error(error instanceof Error ? error.message : t('notification-action-error'))
  }
  finally {
    isSaving.value = false
  }
}

async function saveNotificationSettings() {
  isSaving.value = true
  try {
    settings.value = await notificationFetch<NotificationSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify({
        appId: id.value,
        pushUpdateEnabled: settings.value.pushUpdateEnabled,
        pushUpdateInstallMode: settings.value.pushUpdateInstallMode,
        pushUpdateChannel: pushUpdateChannel.value.trim() || null,
      }),
    })
    pushUpdateChannel.value = settings.value.pushUpdateChannel || ''
    toast.success(t('notification-settings-save-success'))
  }
  catch (error) {
    console.error(error)
    toast.error(error instanceof Error ? error.message : t('notification-action-error'))
  }
  finally {
    isSaving.value = false
  }
}

async function pushUpdateNow() {
  isSaving.value = true
  try {
    const response = await notificationFetch<NotificationQueueResponse>('/update-check', {
      method: 'POST',
      body: JSON.stringify({
        appId: id.value,
        target: { broadcast: true },
        installMode: settings.value.pushUpdateInstallMode,
        channel: pushUpdateChannel.value.trim() || null,
      }),
    })
    if (!response.queued)
      throw new Error(t('notification-queue-unavailable'))
    toast.success(t('notification-update-push-success'))
    await reloadNotifications()
  }
  catch (error) {
    console.error(error)
    toast.error(error instanceof Error ? error.message : t('notification-action-error'))
  }
  finally {
    isSaving.value = false
  }
}

async function sendTest() {
  if (!sendExternalId.value.trim())
    return
  isSaving.value = true
  try {
    const response = await notificationFetch<NotificationQueueResponse>('/send', {
      method: 'POST',
      body: JSON.stringify({
        appId: id.value,
        target: { externalId: sendExternalId.value.trim() },
        payload: { title: sendTitle.value, body: sendBody.value },
        limit: 10,
      }),
    })
    if (!response.queued)
      throw new Error(t('notification-queue-unavailable'))
    toast.success(t('notification-send-success'))
    await reloadNotifications()
  }
  catch (error) {
    console.error(error)
    toast.error(error instanceof Error ? error.message : t('notification-action-error'))
  }
  finally {
    isSaving.value = false
  }
}

watch(() => {
  const params = route.params as { app?: string | string[] }
  return typeof params.app === 'string' ? params.app : ''
}, async (appParam) => {
  const refreshId = ++activeRefreshId
  id.value = appParam
  if (!appParam) {
    app.value = undefined
    providers.value = []
    campaigns.value = []
    stats.value = []
    devices.value = []
    isLoading.value = false
    return
  }

  await refreshData(appParam, refreshId)
  if (refreshId === activeRefreshId) {
    displayStore.NavTitle = ''
    displayStore.defaultBack = '/apps'
  }
}, { immediate: true })

watch(() => providerForm.value.platform, () => {
  providerForm.value.config = providerConfigPlaceholder.value
})
</script>

<template>
  <div>
    <div v-if="app || isLoading" class="w-full h-full px-0 pt-0 mx-auto mb-8 sm:px-6 md:pt-8 lg:px-8 max-w-9xl">
      <div class="space-y-4">
        <header class="overflow-hidden bg-white border shadow-sm md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
          <div class="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0">
              <div class="flex items-center gap-3">
                <span class="flex items-center justify-center w-10 h-10 border rounded-lg shrink-0 border-azure-500/30 bg-azure-500/10">
                  <IconBell class="w-5 h-5 text-azure-500" aria-hidden="true" />
                </span>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h1 class="text-xl font-semibold leading-tight text-slate-950 dark:text-white">
                      {{ t('notification-title') }}
                    </h1>
                    <span class="px-2 py-0.5 text-[10px] font-semibold uppercase rounded border border-azure-500/40 bg-azure-500/10 text-azure-700 dark:text-azure-200">{{ t('beta') }}</span>
                  </div>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {{ t('notification-beta-description') }}
                  </p>
                  <p class="mt-1 font-mono text-sm text-slate-500 dark:text-slate-400">
                    {{ id }}
                  </p>
                </div>
              </div>
            </div>
            <button class="min-h-11 d-btn d-btn-outline" :disabled="isLoading" @click="() => refreshData()">
              <span v-if="isLoading" class="d-loading d-loading-spinner d-loading-xs" />
              <IconRefresh v-else class="w-4 h-4" aria-hidden="true" />
              {{ t('refresh') }}
            </button>
          </div>

          <div class="grid border-t divide-y sm:grid-cols-2 lg:grid-cols-4 sm:divide-x sm:divide-y-0 border-slate-200 divide-slate-200 dark:border-slate-700 dark:divide-slate-700">
            <div class="p-4">
              <div class="flex items-center gap-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                <IconCheckCircle class="w-4 h-4 text-vista-blue-500" aria-hidden="true" />
                {{ t('notification-configured-providers') }}
              </div>
              <div class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                {{ configuredProviders }}
              </div>
            </div>
            <div class="p-4">
              <div class="flex items-center gap-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                <IconDatabaseZap class="w-4 h-4 text-azure-500" aria-hidden="true" />
                {{ t('notification-events-30d') }}
              </div>
              <div class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                {{ totalEvents }}
              </div>
            </div>
            <div class="p-4">
              <div class="flex items-center gap-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                <IconClock class="w-4 h-4 text-cornflower-500" aria-hidden="true" />
                {{ t('notification-campaigns') }}
              </div>
              <div class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                {{ campaigns.length }}
              </div>
            </div>
            <div class="p-4">
              <div class="flex items-center gap-2 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                <IconSmartphone class="w-4 h-4 text-pumpkin-orange-500" aria-hidden="true" />
                {{ t('notification-device-results') }}
              </div>
              <div class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                {{ devices.length }}
              </div>
            </div>
          </div>
        </header>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <main class="space-y-4">
            <section class="bg-white border shadow-sm md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
              <div class="flex flex-col gap-3 p-4 border-b sm:flex-row sm:items-center sm:justify-between border-slate-200 dark:border-slate-700">
                <div>
                  <div class="flex items-center gap-2">
                    <IconSettings class="w-5 h-5 text-azure-500" aria-hidden="true" />
                    <h2 class="text-base font-semibold text-slate-950 dark:text-white">
                      {{ t('notification-provider-setup') }}
                    </h2>
                  </div>
                </div>
                <button class="min-h-11 d-btn d-btn-primary" :disabled="isSaving" @click="saveProvider">
                  <span v-if="isSaving" class="d-loading d-loading-spinner d-loading-xs" />
                  <IconCheckCircle v-else class="w-4 h-4" aria-hidden="true" />
                  {{ t('notification-save-provider') }}
                </button>
              </div>

              <div class="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div class="space-y-4">
                  <div class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    <label class="space-y-1">
                      <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-platform') }}</span>
                      <select v-model="providerForm.platform" class="w-full min-h-11 d-select d-select-bordered">
                        <option value="android">
                          {{ t('notification-platform-android') }}
                        </option>
                        <option value="ios">
                          {{ t('notification-platform-ios') }}
                        </option>
                      </select>
                    </label>
                    <label class="space-y-1">
                      <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('status') }}</span>
                      <select v-model="providerForm.status" class="w-full min-h-11 d-select d-select-bordered">
                        <option value="draft">
                          {{ t('draft') }}
                        </option>
                        <option value="configured">
                          {{ t('configured') }}
                        </option>
                        <option value="disabled">
                          {{ t('disabled') }}
                        </option>
                      </select>
                    </label>
                    <label class="space-y-1 sm:col-span-2 2xl:col-span-2">
                      <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-provider-secret-ref') }}</span>
                      <input v-model="providerForm.secretRef" class="w-full min-h-11 d-input d-input-bordered" :placeholder="expectedProviderSecretRef">
                      <span class="block text-xs leading-5 text-slate-500 dark:text-slate-400">{{ t('notification-provider-secret-ref-help') }}</span>
                    </label>
                  </div>
                  <label class="block space-y-1">
                    <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-provider-config-json') }}</span>
                    <textarea v-model="providerForm.config" class="w-full font-mono text-sm d-textarea d-textarea-bordered min-h-36" :placeholder="providerConfigPlaceholder" />
                    <span class="block text-xs leading-5 text-slate-500 dark:text-slate-400">{{ t('notification-provider-config-help') }}</span>
                  </label>
                </div>

                <div class="overflow-hidden border rounded-lg border-slate-200 dark:border-slate-700">
                  <div class="px-3 py-2 text-xs font-medium uppercase bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                    {{ t('notification-active-providers') }}
                  </div>
                  <div v-if="providers.length" class="divide-y divide-slate-200 dark:divide-slate-700">
                    <div v-for="provider in providers" :key="provider.id" class="p-3">
                      <div class="flex items-center justify-between gap-3">
                        <span class="font-medium text-slate-950 dark:text-white">{{ notificationPlatformLabel(provider.platform) }}</span>
                        <span class="inline-flex items-center px-2 py-1 text-xs font-medium border rounded-full" :class="statusClass(provider.status)">
                          {{ provider.status }}
                        </span>
                      </div>
                      <div class="mt-2 font-mono text-xs break-all text-slate-500 dark:text-slate-400">
                        {{ provider.secret_ref || t('not-set') }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="p-4 text-sm text-slate-500 dark:text-slate-400">
                    {{ t('notification-no-providers') }}
                  </div>
                </div>
              </div>
            </section>

            <section class="bg-white border shadow-sm md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
              <div class="flex flex-col gap-3 p-4 border-b sm:flex-row sm:items-center sm:justify-between border-slate-200 dark:border-slate-700">
                <div>
                  <h2 class="text-base font-semibold text-slate-950 dark:text-white">
                    {{ t('notification-campaigns') }}
                  </h2>
                </div>
                <button class="min-h-11 d-btn d-btn-primary" :disabled="isSaving || !campaignForm.name.trim()" @click="createCampaign">
                  <span v-if="isSaving" class="d-loading d-loading-spinner d-loading-xs" />
                  <IconSend v-else class="w-4 h-4" aria-hidden="true" />
                  {{ t('notification-create-campaign') }}
                </button>
              </div>

              <div class="grid gap-4 p-4 lg:grid-cols-2">
                <label class="space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-campaign-name') }}</span>
                  <input v-model="campaignForm.name" class="w-full min-h-11 d-input d-input-bordered" :placeholder="t('notification-campaign-name')">
                </label>
                <label class="space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('type') }}</span>
                  <select v-model="campaignForm.kind" class="w-full min-h-11 d-select d-select-bordered">
                    <option value="alert">
                      alert
                    </option>
                    <option value="background">
                      background
                    </option>
                    <option value="badge">
                      badge
                    </option>
                    <option value="update_check">
                      update_check
                    </option>
                  </select>
                </label>
                <label class="space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-audience-json') }}</span>
                  <textarea v-model="campaignForm.audience" class="w-full font-mono text-sm d-textarea d-textarea-bordered min-h-32" :placeholder="t('notification-audience-json')" />
                </label>
                <label class="space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-payload-json') }}</span>
                  <textarea v-model="campaignForm.payload" class="w-full font-mono text-sm d-textarea d-textarea-bordered min-h-32" :placeholder="t('notification-payload-json')" />
                </label>
              </div>

              <div class="overflow-x-auto border-t border-slate-200 dark:border-slate-700">
                <table class="d-table d-table-sm">
                  <thead>
                    <tr>
                      <th>{{ t('name') }}</th>
                      <th>{{ t('type') }}</th>
                      <th>{{ t('status') }}</th>
                      <th>{{ t('date') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="campaign in latestCampaigns" :key="campaign.id">
                      <td class="font-medium text-slate-950 dark:text-white">
                        {{ campaign.name }}
                      </td>
                      <td>{{ campaign.kind }}</td>
                      <td>
                        <span class="inline-flex items-center px-2 py-1 text-xs font-medium border rounded-full" :class="statusClass(campaign.status)">
                          {{ campaign.status }}
                        </span>
                      </td>
                      <td>{{ formatShortDate(campaign.created_at) }}</td>
                    </tr>
                    <tr v-if="!campaigns.length">
                      <td colspan="4" class="text-slate-500 dark:text-slate-400">
                        {{ t('notification-no-campaigns') }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </main>

          <aside class="space-y-4">
            <section class="bg-white border shadow-sm md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
              <div class="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-slate-700">
                <IconZap class="w-5 h-5 text-azure-500" aria-hidden="true" />
                <h2 class="text-base font-semibold text-slate-950 dark:text-white">
                  {{ t('notification-push-update') }}
                </h2>
              </div>
              <div class="p-4 space-y-3">
                <label class="flex items-center justify-between gap-3 p-3 border rounded-lg border-slate-200 dark:border-slate-700">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-push-update-enabled') }}</span>
                  <input v-model="settings.pushUpdateEnabled" type="checkbox" class="d-toggle d-toggle-primary" :aria-label="t('notification-push-update-enabled')">
                </label>
                <label class="block space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-update-install-mode') }}</span>
                  <select v-model="settings.pushUpdateInstallMode" class="w-full min-h-11 d-select d-select-bordered">
                    <option value="next">
                      {{ t('notification-update-install-next') }}
                    </option>
                    <option value="set">
                      {{ t('notification-update-install-now') }}
                    </option>
                  </select>
                </label>
                <label class="block space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('channel') }}</span>
                  <input v-model="pushUpdateChannel" class="w-full min-h-11 d-input d-input-bordered" :placeholder="t('channel')">
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <button class="min-h-11 d-btn d-btn-outline" :disabled="isSaving" @click="saveNotificationSettings">
                    <span v-if="isSaving" class="d-loading d-loading-spinner d-loading-xs" />
                    <IconCheckCircle v-else class="w-4 h-4" aria-hidden="true" />
                    {{ t('notification-save-settings') }}
                  </button>
                  <button class="min-h-11 d-btn d-btn-primary" :disabled="isSaving || !settings.pushUpdateEnabled" @click="pushUpdateNow">
                    <span v-if="isSaving" class="d-loading d-loading-spinner d-loading-xs" />
                    <IconZap v-else class="w-4 h-4" aria-hidden="true" />
                    {{ t('notification-push-update-now') }}
                  </button>
                </div>
              </div>
            </section>

            <section class="bg-white border shadow-sm md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
              <div class="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-slate-700">
                <IconSend class="w-5 h-5 text-azure-500" aria-hidden="true" />
                <h2 class="text-base font-semibold text-slate-950 dark:text-white">
                  {{ t('notification-quick-send') }}
                </h2>
              </div>
              <div class="p-4 space-y-3">
                <label class="block space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-recipient-external-id') }}</span>
                  <input v-model="sendExternalId" class="w-full min-h-11 d-input d-input-bordered" :placeholder="t('notification-recipient-external-id')">
                </label>
                <label class="block space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-message-title') }}</span>
                  <input v-model="sendTitle" class="w-full min-h-11 d-input d-input-bordered" :placeholder="t('notification-message-title')">
                </label>
                <label class="block space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-message-body') }}</span>
                  <textarea v-model="sendBody" class="w-full d-textarea d-textarea-bordered min-h-24" :placeholder="t('notification-message-body')" />
                </label>
                <button class="w-full min-h-11 d-btn d-btn-primary" :disabled="isSaving || !sendExternalId.trim()" @click="sendTest">
                  <span v-if="isSaving" class="d-loading d-loading-spinner d-loading-xs" />
                  <IconSend v-else class="w-4 h-4" aria-hidden="true" />
                  {{ t('notification-send-test') }}
                </button>
              </div>
            </section>

            <section class="bg-white border shadow-sm md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
              <div class="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-slate-700">
                <IconSearch class="w-5 h-5 text-azure-500" aria-hidden="true" />
                <h2 class="text-base font-semibold text-slate-950 dark:text-white">
                  {{ t('notification-recipient-lookup') }}
                </h2>
              </div>
              <div class="p-4 space-y-3">
                <label class="block space-y-1">
                  <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ t('notification-recipient-external-id') }}</span>
                  <input v-model="lookupExternalId" class="w-full min-h-11 d-input d-input-bordered" :placeholder="t('notification-recipient-external-id')">
                </label>
                <button class="w-full min-h-11 d-btn d-btn-outline" :disabled="isSaving || !lookupExternalId.trim()" @click="lookupRecipient">
                  <IconSearch class="w-4 h-4" aria-hidden="true" />
                  {{ t('notification-lookup') }}
                </button>
              </div>
              <div class="overflow-x-auto border-t border-slate-200 dark:border-slate-700">
                <table class="d-table d-table-sm">
                  <thead>
                    <tr>
                      <th>{{ t('device') }}</th>
                      <th>{{ t('platform') }}</th>
                      <th>{{ t('badge') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="device in devices" :key="device.deviceKey">
                      <td class="font-mono text-xs">
                        {{ shortKey(device.deviceKey) }}
                      </td>
                      <td>{{ notificationPlatformLabel(device.platform) }}</td>
                      <td>{{ device.badge }}</td>
                    </tr>
                    <tr v-if="!devices.length">
                      <td colspan="3" class="text-slate-500 dark:text-slate-400">
                        {{ t('notification-no-devices') }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section class="bg-white border shadow-sm md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
              <div class="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-slate-700">
                <IconDatabaseZap class="w-5 h-5 text-azure-500" aria-hidden="true" />
                <h2 class="text-base font-semibold text-slate-950 dark:text-white">
                  {{ t('notification-stats') }}
                </h2>
              </div>
              <div class="p-4">
                <div class="flex items-end justify-between gap-3">
                  <div>
                    <div class="text-3xl font-semibold text-slate-950 dark:text-white">
                      {{ totalEvents }}
                    </div>
                    <div class="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {{ t('notification-events-30d') }}
                    </div>
                  </div>
                </div>
                <div v-if="hasStats" class="mt-4 space-y-3">
                  <div v-for="stat in stats" :key="stat.event" class="space-y-1">
                    <div class="flex items-center justify-between gap-3 text-sm">
                      <span class="font-medium text-slate-700 dark:text-slate-200">{{ stat.event }}</span>
                      <span class="font-mono text-slate-950 dark:text-white">{{ stat.count }}</span>
                    </div>
                    <progress class="w-full h-1.5 d-progress d-progress-secondary" :value="stat.count" :max="totalEvents || 1" />
                  </div>
                </div>
                <div v-else class="mt-4 text-sm text-slate-500 dark:text-slate-400">
                  {{ t('notification-no-stats') }}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('app-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('app-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="$router.push('/apps')">
        {{ t('back-to-apps') }}
      </button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
