<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconCopy from '~icons/ion/copy-outline'
import IconCheck from '~icons/lucide/check'
import IconLoader from '~icons/lucide/loader-2'
import { createDefaultApiKey } from '~/services/apikeys'
import { createSignedImageUrl } from '~/services/storage'
import { getLocalConfig, isLocal, useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  onboarding: boolean
}>()

const route = useRoute('/app/new')
const router = useRouter()
const { t } = useI18n()
const supabase = useSupabase()
const dialogStore = useDialogV2Store()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const config = getLocalConfig()

type AppRow = Database['public']['Tables']['apps']['Row']

const isLoading = ref(true)
const isSubmitting = ref(false)
const isImportingStore = ref(false)
const isSeedingDemo = ref(false)
const isCliCommandVisible = ref(false)
const apiKey = ref<string | null>(null)
const createdApp = ref<AppRow | null>(null)
const flowStep = ref<'details' | 'choice' | 'install'>('details')
const selectedIconFile = ref<File | null>(null)
const localIconPreview = ref('')
const storeIconPreview = ref('')
const storeScreenshotPreview = ref('')
const existingApp = ref<boolean | null>(null)
const existingAppSetup = ref<'import' | 'manual' | null>(null)
const appName = ref('')
const storeUrl = ref('')
const importedStoreAppId = ref('')
const manualAppId = ref('')
const appIdSuggestions = ref<string[]>([])
const appIdFeedback = ref('')
const hasEditedAppId = ref(false)

const localCommand = isLocal(config.supaHost) ? ` --supa-host ${config.supaHost} --supa-anon ${config.supaKey}` : ''
const cliCommand = computed(() => `npx @capgo/cli@latest init ${apiKey.value ?? '[APIKEY]'}${localCommand}`)
const cliCommandArgs = computed(() => {
  const args: string[] = []

  if (isLocal(config.supaHost)) {
    args.push('--supa-host', config.supaHost, '--supa-anon', config.supaKey)
  }

  return args
})
const currentOrg = computed(() => organizationStore.currentOrganization)
const resumeAppId = computed(() => {
  const value = route.query.resume
  return typeof value === 'string' ? value : ''
})
const iconPreview = computed(() => localIconPreview.value || storeIconPreview.value || '')
const hasImportedStoreMetadata = computed(() => !!(importedStoreAppId.value || storeIconPreview.value || storeScreenshotPreview.value))
const canShowAppDetails = computed(() => {
  if (existingApp.value === false)
    return true
  if (existingApp.value === true)
    return existingAppSetup.value !== null
  return false
})
const suggestedAppId = computed(() => {
  if (createdApp.value)
    return createdApp.value.app_id

  const storeAppId = importedStoreAppId.value || extractAndroidAppId(storeUrl.value)
  if (existingApp.value === true && storeAppId)
    return storeAppId

  const orgSlug = slugify(currentOrg.value?.name || 'capgo')
  const appSlug = slugify(appName.value || 'mobile-app')
  return `com.${orgSlug}.${appSlug}`
})
const generatedAppId = computed(() => createdApp.value?.app_id || manualAppId.value.trim() || suggestedAppId.value)

function whiteCardToggleButtonClass(active: boolean) {
  return active
    ? 'border-slate-900 bg-slate-900 text-white hover:border-slate-800 hover:bg-slate-800'
    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
}

function whiteCardSecondaryButtonClass() {
  return 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100'
}

function whiteCardPrimaryButtonClass() {
  return 'border-slate-900 bg-slate-900 text-white hover:border-slate-800 hover:bg-slate-800 disabled:border-slate-300 disabled:bg-slate-300 disabled:text-white disabled:opacity-100'
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    || 'app'
}

function extractAndroidAppId(url: string) {
  if (!url)
    return ''

  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('id')?.trim() ?? ''
  }
  catch {
    return ''
  }
}

function getStoreUrls(url: string) {
  if (!url)
    return { iosStoreUrl: null, androidStoreUrl: null }

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    if (host === 'apps.apple.com') {
      return {
        iosStoreUrl: parsed.toString(),
        androidStoreUrl: null,
      }
    }

    if (host === 'play.google.com') {
      return {
        iosStoreUrl: null,
        androidStoreUrl: parsed.toString(),
      }
    }
  }
  catch {
    // Keep validation soft here, backend will report invalid URLs on import.
  }

  return { iosStoreUrl: null, androidStoreUrl: null }
}

async function ensureApiKey() {
  const userId = main.user?.id
  if (!userId)
    return

  const isLiveKey = (expiresAt: string | null) => !expiresAt || new Date(expiresAt).getTime() > Date.now()

  const { data, error } = await supabase
    .from('apikeys')
    .select('key, expires_at')
    .eq('user_id', userId)
    .eq('mode', 'all')
    .order('created_at', { ascending: false })

  const validKey = !error ? data?.find(key => !!key.key && isLiveKey(key.expires_at)) : null
  if (validKey?.key) {
    apiKey.value = validKey.key
    return
  }

  const { data: claimsData } = await supabase.auth.getClaims()
  const claimsUserId = claimsData?.claims?.sub
  if (!claimsUserId)
    return

  const { error: createError } = await createDefaultApiKey(supabase, 'api-key')
  if (createError)
    throw createError

  const { data: refreshedData } = await supabase
    .from('apikeys')
    .select('key, expires_at')
    .eq('user_id', claimsUserId)
    .eq('mode', 'all')
    .order('created_at', { ascending: false })

  apiKey.value = refreshedData?.find(key => !!key.key && isLiveKey(key.expires_at))?.key ?? null
}

async function loadResumeApp() {
  if (!resumeAppId.value || !currentOrg.value?.gid)
    return false

  const { data, error } = await supabase
    .from('apps')
    .select()
    .eq('owner_org', currentOrg.value.gid)
    .eq('app_id', resumeAppId.value)
    .single()

  if (error || !data) {
    toast.error(t('app-onboarding-toast-resume-not-found'))
    return false
  }

  createdApp.value = data
  appName.value = data.name ?? ''
  existingApp.value = data.existing_app ?? null
  storeUrl.value = data.ios_store_url ?? data.android_store_url ?? ''
  importedStoreAppId.value = extractAndroidAppId(data.android_store_url ?? '') || ''
  if (data.icon_url)
    localIconPreview.value = await createSignedImageUrl(data.icon_url) ?? ''
  storeScreenshotPreview.value = ''
  flowStep.value = 'install'
  return true
}

async function importStoreMetadata() {
  if (!storeUrl.value)
    return

  isImportingStore.value = true
  try {
    const { data, error } = await supabase.functions.invoke('app/store-metadata', {
      method: 'POST',
      body: { url: storeUrl.value },
    })

    if (error)
      throw error

    if (typeof data?.name === 'string' && data.name.trim() && !appName.value.trim())
      appName.value = data.name.trim()

    const importedIcon = typeof data?.icon_data_url === 'string' && data.icon_data_url.trim()
      ? data.icon_data_url.trim()
      : typeof data?.icon_url === 'string' && data.icon_url.trim()
        ? data.icon_url.trim()
        : ''
    if (importedIcon && !localIconPreview.value)
      storeIconPreview.value = importedIcon

    if (typeof data?.screenshot_url === 'string' && data.screenshot_url.trim())
      storeScreenshotPreview.value = data.screenshot_url.trim()

    if (typeof data?.app_id === 'string' && data.app_id.trim())
      importedStoreAppId.value = data.app_id.trim()
  }
  catch (error) {
    console.error('Cannot import store metadata', error)
    toast.error(t('app-onboarding-toast-store-metadata-error'))
  }
  finally {
    isImportingStore.value = false
  }
}

function onSelectIconFormKit(value: unknown) {
  const fileValue = Array.isArray(value) ? value[0] : value
  const file = fileValue && typeof fileValue === 'object' && 'file' in fileValue
    ? (fileValue as { file?: File }).file ?? null
    : fileValue instanceof File
      ? fileValue
      : null

  selectedIconFile.value = file
  if (localIconPreview.value.startsWith('blob:'))
    URL.revokeObjectURL(localIconPreview.value)
  localIconPreview.value = file ? URL.createObjectURL(file) : ''
}

function onAppIdInput(event: Event) {
  hasEditedAppId.value = true
  manualAppId.value = (event.target as HTMLInputElement).value
  appIdFeedback.value = ''
}

function applyAppIdSuggestion(suggestion: string) {
  hasEditedAppId.value = true
  manualAppId.value = suggestion
  appIdFeedback.value = ''
}

function isAppIdConflict(error: { status?: number, message?: string } | null | undefined) {
  if (!error)
    return false

  if (error.status === 409)
    return true

  const message = error.message?.toLowerCase() || ''
  return ['duplicate', 'already exists', 'unique constraint', 'apps_pkey', 'app_id_key', 'app_id_already_exists'].some(fragment => message.includes(fragment))
}

function buildAlternativeAppIds(baseId: string) {
  const normalized = baseId.trim().replace(/\.+$/g, '') || suggestedAppId.value
  const proposals = [
    `${normalized}.app`,
    `${normalized}.mobile`,
    `${normalized}.capgo`,
    `${normalized}.${currentOrg.value?.name ? slugify(currentOrg.value.name) : 'prod'}`,
    `${normalized}.${crypto.randomUUID().slice(0, 4)}`,
  ]

  return [...new Set(proposals.filter(candidate => candidate !== normalized))]
}

async function readFunctionError(error: unknown) {
  if (!(error instanceof FunctionsHttpError) || !(error.context instanceof Response))
    return null

  try {
    const json = await error.context.clone().json() as {
      error?: string
      message?: string
      app_id?: string
      moreInfo?: { app_id?: string, error?: string }
    }

    return {
      status: error.context.status,
      code: json.error ?? '',
      message: json.message ?? t('app-onboarding-toast-create-error'),
      appId: json.app_id ?? json.moreInfo?.app_id ?? '',
    }
  }
  catch {
    return {
      status: error.context.status,
      code: '',
      message: t('app-onboarding-toast-create-error-status', { status: error.context.status }),
      appId: '',
    }
  }
}

async function uploadIcon(appId: string, iconSourceUrl?: string) {
  if (!currentOrg.value?.gid)
    return

  let fileToUpload = selectedIconFile.value

  if (!fileToUpload && iconSourceUrl) {
    try {
      const parsedIconUrl = new URL(iconSourceUrl)
      if (parsedIconUrl.protocol !== 'https:') {
        console.warn('Skipping non-HTTPS icon URL', iconSourceUrl)
      }
      else {
        const response = await fetch(parsedIconUrl.toString())
        const blob = await response.blob()
        fileToUpload = new File([blob], 'store-icon.png', { type: blob.type || 'image/png' })
      }
    }
    catch (error) {
      console.warn('Cannot fetch remote icon', error)
    }
  }

  if (!fileToUpload)
    return

  const iconPath = `org/${currentOrg.value.gid}/${appId}/icon`
  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(iconPath, fileToUpload, {
      upsert: true,
      contentType: fileToUpload.type || 'image/png',
    })

  if (uploadError) {
    console.error('Cannot upload app icon', uploadError)
    return
  }

  await supabase
    .from('apps')
    .update({ icon_url: iconPath })
    .eq('app_id', appId)
}

async function createAppRecord() {
  if (!currentOrg.value?.gid) {
    toast.error(t('app-onboarding-toast-no-organization'))
    return
  }

  if (existingApp.value === null) {
    toast.error(t('app-onboarding-toast-existing-required'))
    return
  }

  if (!appName.value.trim()) {
    toast.error(t('app-onboarding-toast-name-required'))
    return
  }

  if (!generatedAppId.value.trim()) {
    toast.error(t('app-onboarding-toast-appid-required'))
    return
  }

  isSubmitting.value = true
  try {
    const normalizedStoreUrls = getStoreUrls(storeUrl.value.trim())

    let appId = generatedAppId.value
    let responseData: AppRow | null = null
    const candidateIds = [appId, ...buildAlternativeAppIds(appId)]

    for (const candidateId of candidateIds) {
      const { data, error } = await supabase.functions.invoke('app', {
        method: 'POST',
        body: {
          owner_org: currentOrg.value.gid,
          app_id: candidateId,
          name: appName.value.trim(),
          need_onboarding: true,
          existing_app: existingApp.value,
          ios_store_url: normalizedStoreUrls.iosStoreUrl,
          android_store_url: normalizedStoreUrls.androidStoreUrl,
        },
      })

      if (!error && data?.app_id) {
        responseData = data as AppRow
        appId = candidateId
        manualAppId.value = candidateId
        if (candidateId !== candidateIds[0]) {
          appIdFeedback.value = t('app-onboarding-appid-taken-switched', {
            original: candidateIds[0],
            replacement: candidateId,
          })
          appIdSuggestions.value = buildAlternativeAppIds(candidateIds[0])
          toast.info(appIdFeedback.value)
        }
        else {
          appIdFeedback.value = ''
          appIdSuggestions.value = []
        }
        break
      }

      const functionError = await readFunctionError(error)
      const isConflict = isAppIdConflict({
        status: functionError?.status ?? (error as { status?: number } | null | undefined)?.status,
        message: `${functionError?.code ?? ''} ${functionError?.message ?? (error as { message?: string } | null | undefined)?.message ?? ''}`,
      })

      if (isConflict)
        continue

      appIdFeedback.value = functionError?.message ?? t('app-onboarding-toast-create-error')
      toast.error(appIdFeedback.value)
      throw error ?? new Error(appIdFeedback.value)
    }

    if (!responseData) {
      appIdSuggestions.value = buildAlternativeAppIds(candidateIds[0])
      appIdFeedback.value = t('app-onboarding-appid-taken-pick-another', {
        appId: candidateIds[0],
      })
      toast.error(appIdFeedback.value)
      return
    }

    await uploadIcon(appId, storeIconPreview.value)
    const { data: refreshed } = await supabase
      .from('apps')
      .select()
      .eq('app_id', appId)
      .single()

    createdApp.value = refreshed ?? responseData
    flowStep.value = 'choice'
  }
  catch (error) {
    console.error('Cannot create onboarding app', error)
    if (!appIdFeedback.value)
      toast.error(t('app-onboarding-toast-create-error'))
  }
  finally {
    isSubmitting.value = false
  }
}

async function seedDemoData() {
  if (!createdApp.value || !currentOrg.value?.gid)
    return

  isSeedingDemo.value = true
  try {
    const { data, error } = await supabase.functions.invoke('app/demo', {
      method: 'POST',
      body: {
        owner_org: currentOrg.value.gid,
        app_id: createdApp.value.app_id,
      },
    })

    if (error || !data?.app_id) {
      throw error
    }

    router.push(`/app/${encodeURIComponent(createdApp.value.app_id)}?tour=1&refresh=true`)
  }
  catch (error) {
    console.error('Cannot seed demo data', error)
    toast.error(t('app-onboarding-toast-demo-error'))
  }
  finally {
    isSeedingDemo.value = false
  }
}

async function copyCliCommand() {
  try {
    await navigator.clipboard.writeText(cliCommand.value)
    toast.success(t('copied-to-clipboard'))
  }
  catch (error) {
    console.error('Failed to copy CLI command', error)
    dialogStore.openDialog({
      title: t('cannot-copy'),
      description: cliCommand.value,
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    })
    await dialogStore.onDialogDismiss()
  }
}

function goToInstallStep() {
  isCliCommandVisible.value = false
  flowStep.value = 'install'
}

function openDashboard() {
  if (!createdApp.value)
    return

  router.push(`/app/${encodeURIComponent(createdApp.value.app_id)}`)
}

onMounted(async () => {
  isLoading.value = true
  try {
    await organizationStore.awaitInitialLoad()
    await main.awaitInitialLoad()
    try {
      await ensureApiKey()
    }
    catch (error) {
      console.error('Cannot ensure API key', error)
      toast.error(t('app-onboarding-toast-apikey-error'))
    }
    const resumed = await loadResumeApp()
    if (!resumed)
      flowStep.value = 'details'
  }
  finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  if (localIconPreview.value.startsWith('blob:'))
    URL.revokeObjectURL(localIconPreview.value)
})

watch(existingApp, (value) => {
  existingAppSetup.value = value === true ? null : value === false ? 'manual' : null
  if (value !== true) {
    storeUrl.value = ''
    storeIconPreview.value = ''
    storeScreenshotPreview.value = ''
    importedStoreAppId.value = ''
  }
  appIdSuggestions.value = []
  appIdFeedback.value = ''
})

watch(suggestedAppId, (value) => {
  if (!hasEditedAppId.value && !createdApp.value)
    manualAppId.value = value
}, { immediate: true })
</script>

<template>
  <section class="h-full py-10 overflow-y-auto sm:py-16 max-h-fit">
    <div class="px-4 mx-auto max-w-5xl sm:px-6 lg:px-8">
      <div v-if="isLoading" class="flex items-center justify-center min-h-[50vh]">
        <Spinner size="w-32 h-32" />
      </div>

      <div v-else class="space-y-6">
        <div class="text-center">
          <p class="text-sm font-semibold tracking-[0.18em] uppercase text-azure-500">
            {{ t('app-onboarding-badge') }}
          </p>
          <h1 class="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl dark:text-slate-50">
            {{ props.onboarding
              ? t('app-onboarding-title-first')
              : t('app-onboarding-title-return') }}
          </h1>
          <p class="max-w-2xl mx-auto mt-3 text-base text-slate-600 dark:text-slate-300">
            {{ t('app-onboarding-subtitle') }}
          </p>
        </div>

        <div v-if="flowStep === 'details'" class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-200 dark:bg-white">
          <div class="grid gap-6 md:grid-cols-[1.25fr_0.9fr]">
            <div class="space-y-5">
              <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-200 dark:bg-slate-50/70">
                <p class="text-sm font-medium text-slate-900 dark:text-slate-900">
                  {{ t('app-onboarding-existing-question') }}
                </p>
                <div class="flex flex-wrap gap-3 mt-4">
                  <button class="d-btn" :class="whiteCardToggleButtonClass(existingApp === true)" @click="existingApp = true">
                    {{ t('app-onboarding-existing-yes') }}
                  </button>
                  <button class="d-btn" :class="whiteCardToggleButtonClass(existingApp === false)" @click="existingApp = false">
                    {{ t('app-onboarding-existing-no') }}
                  </button>
                </div>
                <div class="mt-4">
                  <button
                    class="text-xs font-medium text-slate-400 underline decoration-slate-300 underline-offset-3 transition hover:text-slate-600 dark:text-slate-500 dark:decoration-slate-600 dark:hover:text-slate-300"
                    @click="isCliCommandVisible = !isCliCommandVisible"
                  >
                    {{ isCliCommandVisible ? t('app-onboarding-command-hide') : t('app-onboarding-command-show') }}
                  </button>
                  <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {{ t('app-onboarding-command-help') }}
                  </p>
                  <div
                    v-if="isCliCommandVisible"
                    class="group relative mt-3 cursor-pointer rounded-xl bg-black p-4 pr-14 ring-1 ring-white/10 transition hover:ring-white/20 dark:bg-slate-950"
                    role="button"
                    tabindex="0"
                    @click="copyCliCommand"
                    @keydown.enter.prevent="copyCliCommand"
                    @keydown.space.prevent="copyCliCommand"
                  >
                    <code class="block whitespace-pre-wrap break-all text-sm">
                      <span class="text-slate-500">npx</span>
                      <span class="text-sky-300"> @capgo/cli@latest</span>
                      <span class="text-violet-300"> init</span>
                      <span class="text-emerald-300"> {{ apiKey ?? '[APIKEY]' }}</span>
                      <template v-for="(arg, index) in cliCommandArgs" :key="`${arg}-${index}`">
                        <span :class="index % 2 === 0 ? 'text-amber-300' : 'text-cyan-300'"> {{ arg }}</span>
                      </template>
                    </code>
                    <IconCopy class="absolute right-4 top-4 h-5 w-5 text-muted-blue-300 transition group-hover:text-white" />
                  </div>
                </div>
              </div>

              <div v-if="existingApp === true" class="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-200 dark:bg-slate-50/70">
                <div>
                  <p class="text-sm font-medium text-slate-900 dark:text-slate-900">
                    {{ t('app-onboarding-start-question') }}
                  </p>
                  <div class="flex flex-wrap gap-3 mt-4">
                    <button class="d-btn" :class="whiteCardToggleButtonClass(existingAppSetup === 'import')" @click="existingAppSetup = 'import'">
                      {{ t('app-onboarding-mode-import') }}
                    </button>
                    <button class="d-btn" :class="whiteCardToggleButtonClass(existingAppSetup === 'manual')" @click="existingAppSetup = 'manual'">
                      {{ t('app-onboarding-mode-manual') }}
                    </button>
                  </div>
                </div>

                <template v-if="existingAppSetup === 'import'">
                  <div>
                    <label class="text-sm font-medium text-slate-800 dark:text-slate-800">{{ t('app-onboarding-store-link-label') }}</label>
                    <input v-model="storeUrl" class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-azure-400 focus:ring-2 focus:ring-azure-100 dark:border-slate-300 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-400 dark:focus:border-azure-400 dark:focus:ring-azure-100" :placeholder="t('app-onboarding-store-link-placeholder')" type="url">
                  </div>
                  <button class="d-btn w-fit" :class="whiteCardSecondaryButtonClass()" :disabled="isImportingStore || !storeUrl" @click="importStoreMetadata()">
                    <IconLoader v-if="isImportingStore" class="w-4 h-4 animate-spin" />
                    <span v-else>{{ t('app-onboarding-store-import-button') }}</span>
                  </button>
                  <p class="text-xs text-slate-500 dark:text-slate-500">
                    {{ hasImportedStoreMetadata
                      ? t('app-onboarding-store-imported-help')
                      : t('app-onboarding-store-help') }}
                  </p>
                </template>
              </div>

              <template v-if="canShowAppDetails">
                <div>
                  <label class="text-sm font-medium text-slate-800 dark:text-slate-800">{{ t('app-name') }}</label>
                  <input v-model="appName" class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-azure-400 focus:ring-2 focus:ring-azure-100 dark:border-slate-300 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-400 dark:focus:border-azure-400 dark:focus:ring-azure-100" :placeholder="t('app-onboarding-name-placeholder')" maxlength="100">
                </div>

                <div>
                  <label class="text-sm font-medium text-slate-800 dark:text-slate-800">{{ t('app-id') }}</label>
                  <input
                    :value="manualAppId"
                    class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-azure-400 focus:ring-2 focus:ring-azure-100 dark:border-slate-300 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-400 dark:focus:border-azure-400 dark:focus:ring-azure-100"
                    :placeholder="t('app-onboarding-appid-placeholder')"
                    @input="onAppIdInput"
                  >
                  <p class="mt-2 text-xs text-slate-500 dark:text-slate-500">
                    {{ existingApp
                      ? t('app-onboarding-appid-help-existing')
                      : t('app-onboarding-appid-help-new') }}
                  </p>
                  <p v-if="appIdFeedback" class="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {{ appIdFeedback }}
                  </p>
                  <div v-if="appIdSuggestions.length > 0" class="mt-3 flex flex-wrap gap-2">
                    <button
                      v-for="suggestion in appIdSuggestions"
                      :key="suggestion"
                      class="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-azure-300 hover:text-azure-600 dark:border-slate-300 dark:bg-white dark:text-slate-700 dark:hover:border-azure-300 dark:hover:text-azure-600"
                      @click="applyAppIdSuggestion(suggestion)"
                    >
                      {{ suggestion }}
                    </button>
                  </div>
                </div>

                <div>
                  <FormKit
                    type="file"
                    :label="t('app-onboarding-icon-label')"
                    accept="image/*"
                    outer-class="mt-0"
                    label-class="text-sm font-medium text-slate-800 dark:text-slate-800"
                    input-class="mt-2 block w-full text-sm text-slate-600 dark:text-slate-600"
                    @update:model-value="onSelectIconFormKit"
                  />
                  <p class="text-xs text-slate-500 dark:text-slate-500">
                    {{ t('app-onboarding-icon-help') }}
                  </p>
                </div>

                <div class="flex flex-wrap gap-3">
                  <button class="d-btn" :class="whiteCardPrimaryButtonClass()" :disabled="isSubmitting" @click="createAppRecord">
                    <IconLoader v-if="isSubmitting" class="w-4 h-4 animate-spin" />
                    <span v-else>{{ t('app-onboarding-continue') }}</span>
                  </button>
                  <button class="d-btn" :class="whiteCardSecondaryButtonClass()" @click="router.push('/apps')">
                    {{ t('button-cancel') }}
                  </button>
                </div>
              </template>
            </div>

            <div class="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white dark:border-slate-800 dark:bg-linear-to-br dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
              <div class="rounded-3xl border border-white/10 bg-slate-900 p-5 dark:border-slate-800 dark:bg-slate-900/90">
                <div class="flex items-center gap-4">
                  <div class="flex h-18 w-18 items-center justify-center overflow-hidden rounded-[22px] bg-slate-800 text-3xl">
                    <img v-if="iconPreview" :src="iconPreview" :alt="t('app-onboarding-icon-preview-alt')" class="h-full w-full object-cover">
                    <span v-else>📱</span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs uppercase tracking-[0.2em] text-slate-300 dark:text-slate-400">
                      {{ t('app-onboarding-preview-label') }}
                    </p>
                    <p class="truncate text-lg font-semibold">
                      {{ appName || t('app-onboarding-preview-placeholder') }}
                    </p>
                    <p class="mt-1 truncate text-xs text-slate-300 dark:text-slate-400">
                      {{ generatedAppId }}
                    </p>
                  </div>
                </div>
                <div v-if="storeScreenshotPreview" class="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/40">
                  <img :src="storeScreenshotPreview" :alt="t('app-onboarding-store-screenshot-alt')" class="aspect-9/19.5 w-full object-cover object-top">
                </div>
                <ul class="mt-6 space-y-3 text-sm text-slate-200 dark:text-slate-300">
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('app-onboarding-preview-bullet-one') }}
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('app-onboarding-preview-bullet-two') }}
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('app-onboarding-preview-bullet-three') }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="flowStep === 'choice' && createdApp" class="grid gap-6 md:grid-cols-2">
          <button class="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-azure-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-azure-500 dark:hover:bg-slate-900/90 dark:hover:shadow-none" @click="goToInstallStep">
            <p class="text-sm font-semibold uppercase tracking-[0.18em] text-azure-500">
              {{ t('app-onboarding-choice-real-badge') }}
            </p>
            <h2 class="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">
              {{ t('app-onboarding-choice-real-title') }}
            </h2>
            <p class="mt-3 text-sm text-slate-600 dark:text-slate-300">
              {{ t('app-onboarding-choice-real-subtitle') }} <span class="font-mono">{{ createdApp.app_id }}</span>.
            </p>
          </button>

          <button
            class="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500 dark:hover:bg-slate-900/90 dark:hover:shadow-none"
            :disabled="isSeedingDemo"
            @click="seedDemoData"
          >
            <p class="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-500">
              {{ t('app-onboarding-choice-demo-badge') }}
            </p>
            <h2 class="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">
              {{ t('app-onboarding-choice-demo-title') }}
            </h2>
            <p class="mt-3 text-sm text-slate-600 dark:text-slate-300">
              {{ t('app-onboarding-choice-demo-subtitle') }}
            </p>
            <p v-if="isSeedingDemo" class="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <IconLoader class="h-4 w-4 animate-spin" />
              {{ t('app-onboarding-choice-demo-loading') }}
            </p>
          </button>
        </div>

        <div v-else-if="flowStep === 'install' && createdApp" class="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.18em] text-azure-500">
                {{ t('app-onboarding-install-badge') }}
              </p>
              <h2 class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
                {{ t('app-onboarding-install-title') }}
              </h2>
              <p class="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                {{ t('app-onboarding-install-subtitle') }}
              </p>
            </div>
            <button class="d-btn d-btn-outline" @click="openDashboard">
              {{ t('app-onboarding-open-dashboard') }}
            </button>
          </div>

          <div
            class="group relative cursor-pointer rounded-2xl bg-black p-5 pr-14 ring-1 ring-white/10 transition hover:ring-white/20 dark:bg-slate-950"
            role="button"
            tabindex="0"
            @click="copyCliCommand"
            @keydown.enter.prevent="copyCliCommand"
            @keydown.space.prevent="copyCliCommand"
          >
            <code class="block whitespace-pre-wrap break-all text-sm">
              <span class="text-slate-500">npx</span>
              <span class="text-sky-300"> @capgo/cli@latest</span>
              <span class="text-violet-300"> init</span>
              <span class="text-emerald-300"> {{ apiKey ?? '[APIKEY]' }}</span>
              <template v-for="(arg, index) in cliCommandArgs" :key="`${arg}-${index}`">
                <span :class="index % 2 === 0 ? 'text-amber-300' : 'text-cyan-300'"> {{ arg }}</span>
              </template>
            </code>
            <IconCopy class="absolute right-4 top-4 h-5 w-5 text-muted-blue-300 transition group-hover:text-white" />
          </div>

          <div class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
            <p class="font-medium text-slate-900 dark:text-slate-100">
              {{ t('app-onboarding-next-title') }}
            </p>
            <ul class="mt-3 space-y-2">
              <li class="flex gap-3">
                <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {{ createdApp.existing_app
                  ? t('app-onboarding-next-existing')
                  : t('app-onboarding-next-new') }}
              </li>
              <li class="flex gap-3">
                <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {{ t('app-onboarding-next-cleanup') }}
              </li>
            </ul>
          </div>

          <div class="flex flex-wrap gap-3">
            <button class="d-btn d-btn-primary" @click="openDashboard">
              {{ t('app-onboarding-install-later') }}
            </button>
            <button class="d-btn d-btn-outline" @click="flowStep = 'choice'">
              {{ t('button-back') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
