<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconCopy from '~icons/ion/copy-outline'
import IconAppWindow from '~icons/lucide/app-window'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconBadgeCheck from '~icons/lucide/badge-check'
import IconCheck from '~icons/lucide/check'
import IconCode from '~icons/lucide/code-2'
import IconGlobe from '~icons/lucide/globe-2'
import IconImage from '~icons/lucide/image'
import IconLoader from '~icons/lucide/loader-2'
import IconPackage from '~icons/lucide/package'
import IconSmartphone from '~icons/lucide/smartphone'
import IconSparkles from '~icons/lucide/sparkles'
import IconStore from '~icons/lucide/store'
import IconTerminal from '~icons/lucide/terminal'
import { createDefaultApiKey, findUsablePlainApiKey } from '~/services/apikeys'
import { createSignedImageUrl, getImmediateImageUrl } from '~/services/storage'
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

interface StoreUrls {
  iosStoreUrl: string | null
  androidStoreUrl: string | null
}

interface StoreMetadataResponse {
  name?: unknown
  icon_data_url?: unknown
  icon_url?: unknown
  screenshot_url?: unknown
  app_id?: unknown
}

interface AppCreateValues {
  ownerOrg: string
  appName: string
  initialAppId: string
  existingApp: boolean
}

interface CreatedAppCandidate {
  appId: string
  responseData: AppRow
}

const isLoading = ref(true)
const isSubmitting = ref(false)
const isImportingStore = ref(false)
const isResumeIconLoading = ref(false)
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
const cliCommand = computed(() => `npx @capgo/cli@latest i ${apiKey.value ?? '[APIKEY]'}${localCommand}`)
const redactedCliCommand = computed(() => `npx @capgo/cli@latest i [YOUR_CAPGO_API_KEY]${localCommand}`)
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
const canUseStoreImportPreview = computed(() => existingApp.value === true && existingAppSetup.value === 'import')
const iconPreview = computed(() => localIconPreview.value || (canUseStoreImportPreview.value ? storeIconPreview.value : '') || '')
const hasImportedStoreMetadata = computed(() => canUseStoreImportPreview.value && !!(importedStoreAppId.value || storeIconPreview.value || storeScreenshotPreview.value))
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

  const storeAppId = existingAppSetup.value === 'import'
    ? importedStoreAppId.value || extractAndroidAppId(storeUrl.value)
    : ''
  if (existingApp.value === true && storeAppId)
    return storeAppId

  const orgSlug = slugify(currentOrg.value?.name || 'capgo')
  const appSlug = slugify(appName.value || 'mobile-app')
  return `com.${orgSlug}.${appSlug}`
})
const generatedAppId = computed(() => createdApp.value?.app_id || manualAppId.value.trim() || suggestedAppId.value)
const aiHelpPrompt = computed(() => {
  const resolvedAppId = createdApp.value?.app_id || generatedAppId.value || '[APP_ID]'
  const resolvedAppName = createdApp.value?.name?.trim() || appName.value.trim() || resolvedAppId
  const appStatus = createdApp.value?.existing_app
    ? t('app-onboarding-ai-help-status-existing')
    : t('app-onboarding-ai-help-status-new')

  return t('app-onboarding-ai-help-prompt', {
    appName: resolvedAppName,
    appId: resolvedAppId,
    appStatus,
    command: redactedCliCommand.value,
  })
})
const appOnboardingSteps = computed<Array<{ id: 'details' | 'choice' | 'install', label: string }>>(() => [
  { id: 'details', label: t('app-onboarding-step-details') },
  { id: 'choice', label: t('app-onboarding-step-choice') },
  { id: 'install', label: t('app-onboarding-step-install') },
])
const currentStepIndex = computed(() => Math.max(0, appOnboardingSteps.value.findIndex(entry => entry.id === flowStep.value)))
const stepProgress = computed(() => `${((currentStepIndex.value + 1) / appOnboardingSteps.value.length) * 100}%`)
const selectedStartLabel = computed(() => {
  if (existingApp.value === true)
    return t('app-onboarding-existing-yes')
  if (existingApp.value === false)
    return t('app-onboarding-existing-no')
  return t('app-onboarding-not-selected')
})
const selectedSetupLabel = computed(() => {
  if (existingApp.value === false)
    return t('app-onboarding-mode-manual')
  if (existingAppSetup.value === 'import')
    return t('app-onboarding-mode-import')
  if (existingAppSetup.value === 'manual')
    return t('app-onboarding-mode-manual')
  return t('app-onboarding-not-selected')
})
const previewStatusLabel = computed(() => {
  if (createdApp.value?.existing_app || existingApp.value === true)
    return t('app-onboarding-ai-help-status-existing')
  return t('app-onboarding-ai-help-status-new')
})

function whiteCardToggleButtonClass(active: boolean) {
  return active
    ? 'border-primary-500 bg-slate-100 text-slate-950 ring-2 ring-primary-500/15 hover:border-primary-500 hover:bg-slate-100 dark:border-primary-500/80 dark:bg-primary-500/25 dark:text-white dark:ring-primary-500/30 dark:hover:bg-primary-500/30'
    : 'border-slate-200 bg-white text-slate-700 hover:border-primary-500/40 hover:bg-slate-50 hover:text-slate-950 dark:border-white/15 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:border-white/30 dark:hover:bg-slate-900 dark:hover:text-white'
}

function whiteCardSecondaryButtonClass() {
  return 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100 dark:border-white/20 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-white/30 dark:hover:bg-slate-900 dark:disabled:border-white/15 dark:disabled:bg-slate-900 dark:disabled:text-slate-500'
}

function whiteCardPrimaryButtonClass() {
  return 'border-primary-500 bg-primary-500 text-white hover:border-primary-500 hover:bg-primary-500/90 disabled:border-slate-300 disabled:bg-slate-300 disabled:text-white disabled:opacity-100 dark:border-primary-500/90 dark:bg-primary-500 dark:hover:border-primary-500 dark:hover:bg-primary-500/90 dark:disabled:border-white/15 dark:disabled:bg-slate-800 dark:disabled:text-slate-500'
}

function slugify(value: string) {
  const slug = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '.')

  return slug
    .replace(/^\./g, '')
    .replace(/\.$/g, '')
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

function getStoreUrls(url: string): StoreUrls {
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

let storeImportRun = 0
function resetStoreImportState() {
  storeImportRun += 1
  storeUrl.value = ''
  storeIconPreview.value = ''
  storeScreenshotPreview.value = ''
  importedStoreAppId.value = ''
  isImportingStore.value = false
}

let resumeIconLoadRun = 0
async function loadResumeIconPreview(rawIconUrl: string | null | undefined, appId: string, run: number) {
  if (!rawIconUrl || getImmediateImageUrl(rawIconUrl)) {
    if (run === resumeIconLoadRun)
      isResumeIconLoading.value = false
    return
  }

  isResumeIconLoading.value = true
  try {
    const signedIconUrl = await createSignedImageUrl(rawIconUrl)
    if (!signedIconUrl || run !== resumeIconLoadRun || createdApp.value?.app_id !== appId)
      return

    localIconPreview.value = signedIconUrl
  }
  catch (error) {
    console.warn('Cannot load signed resume app icon', { appId, error })
  }
  finally {
    if (run === resumeIconLoadRun)
      isResumeIconLoading.value = false
  }
}

async function ensureApiKey() {
  const userId = main.user?.id
  if (!userId)
    return

  const existingKey = await findUsablePlainApiKey(supabase, userId, currentOrg.value?.gid, resumeAppId.value)
  if (existingKey) {
    apiKey.value = existingKey
    return
  }

  const { data: claimsData } = await supabase.auth.getClaims()
  const claimsUserId = claimsData?.claims?.sub
  if (!claimsUserId)
    return

  const { data, error: createError } = await createDefaultApiKey(supabase, 'api-key', {
    orgId: currentOrg.value?.gid,
    appId: resumeAppId.value,
  })
  if (createError)
    throw createError

  apiKey.value = typeof data?.key === 'string'
    ? data.key
    : await findUsablePlainApiKey(supabase, claimsUserId, currentOrg.value?.gid, resumeAppId.value)
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
  const iconLoadRun = ++resumeIconLoadRun
  localIconPreview.value = getImmediateImageUrl(data.icon_url) || ''
  void loadResumeIconPreview(data.icon_url, data.app_id, iconLoadRun)
  storeScreenshotPreview.value = ''
  flowStep.value = 'install'
  return true
}

function getInitialStoreUrlFromQuery() {
  const value = route.query.store_url
  return typeof value === 'string' ? value.trim() : ''
}

async function applyStorePrefillFromQuery() {
  const initialStoreUrl = getInitialStoreUrlFromQuery()
  if (!initialStoreUrl)
    return false

  existingApp.value = true
  await nextTick()
  existingAppSetup.value = 'import'
  storeUrl.value = initialStoreUrl
  await importStoreMetadata()
  return true
}

function getTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isCurrentStoreImportRun(requestedRun: number, requestedUrl: string) {
  return requestedRun === storeImportRun
    && existingAppSetup.value === 'import'
    && storeUrl.value.trim() === requestedUrl
}

function getImportedStoreIcon(data: StoreMetadataResponse) {
  return getTrimmedString(data.icon_data_url) || getTrimmedString(data.icon_url)
}

function applyImportedStoreMetadata(data: StoreMetadataResponse) {
  importedStoreAppId.value = ''
  storeIconPreview.value = ''
  storeScreenshotPreview.value = ''

  const importedName = getTrimmedString(data.name)
  if (importedName && !appName.value.trim())
    appName.value = importedName

  const importedIcon = getImportedStoreIcon(data)
  if (importedIcon && !localIconPreview.value)
    storeIconPreview.value = importedIcon

  const screenshotUrl = getTrimmedString(data.screenshot_url)
  storeScreenshotPreview.value = screenshotUrl

  const importedAppId = getTrimmedString(data.app_id)
  importedStoreAppId.value = importedAppId
}

async function importStoreMetadata() {
  const requestedUrl = storeUrl.value.trim()
  if (!requestedUrl || existingAppSetup.value !== 'import')
    return

  const requestedRun = ++storeImportRun
  isImportingStore.value = true
  try {
    const { data, error } = await supabase.functions.invoke('app/store-metadata', {
      method: 'POST',
      body: { url: requestedUrl },
    })

    if (!isCurrentStoreImportRun(requestedRun, requestedUrl))
      return

    if (error)
      throw error

    applyImportedStoreMetadata((data ?? {}) as StoreMetadataResponse)
  }
  catch (error) {
    if (!isCurrentStoreImportRun(requestedRun, requestedUrl))
      return

    console.error('Cannot import store metadata', error)
    toast.error(t('app-onboarding-toast-store-metadata-error'))
  }
  finally {
    if (requestedRun === storeImportRun)
      isImportingStore.value = false
  }
}

function resolveSelectedIconFile(value: unknown) {
  const fileValue = Array.isArray(value) ? value[0] : value
  if (fileValue instanceof File)
    return fileValue

  if (fileValue && typeof fileValue === 'object' && 'file' in fileValue)
    return (fileValue as { file?: File }).file ?? null

  return null
}

function onSelectIconFormKit(value: unknown) {
  const file = resolveSelectedIconFile(value)

  selectedIconFile.value = file
  if (localIconPreview.value.startsWith('blob:'))
    URL.revokeObjectURL(localIconPreview.value)
  localIconPreview.value = file ? URL.createObjectURL(file) : ''
  isResumeIconLoading.value = false
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

async function getRemoteIconFile(iconSourceUrl?: string) {
  if (!iconSourceUrl)
    return null

  try {
    const parsedIconUrl = new URL(iconSourceUrl)
    if (parsedIconUrl.protocol === 'https:') {
      const response = await fetch(parsedIconUrl.toString())
      if (!response.ok) {
        console.warn('Remote icon fetch failed', response.status, parsedIconUrl.toString())
        return null
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.startsWith('image/')) {
        console.warn('Remote icon is not an image', contentType)
        return null
      }

      const blob = await response.blob()
      return new File([blob], 'store-icon.png', { type: blob.type || 'image/png' })
    }

    console.warn('Skipping non-HTTPS icon URL', iconSourceUrl)
  }
  catch (error) {
    console.warn('Cannot fetch remote icon', error)
  }

  return null
}

async function uploadIcon(appId: string, iconSourceUrl?: string) {
  if (!currentOrg.value?.gid)
    return

  const fileToUpload = selectedIconFile.value ?? await getRemoteIconFile(iconSourceUrl)
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

function getAppCreateValues(): AppCreateValues | null {
  const ownerOrg = currentOrg.value?.gid
  if (!ownerOrg) {
    toast.error(t('app-onboarding-toast-no-organization'))
    return null
  }

  const existingAppValue = existingApp.value
  if (existingAppValue === null) {
    toast.error(t('app-onboarding-toast-existing-required'))
    return null
  }

  const appNameValue = appName.value.trim()
  if (!appNameValue) {
    toast.error(t('app-onboarding-toast-name-required'))
    return null
  }

  const initialAppId = generatedAppId.value.trim()
  if (!initialAppId) {
    toast.error(t('app-onboarding-toast-appid-required'))
    return null
  }

  return {
    ownerOrg,
    appName: appNameValue,
    initialAppId,
    existingApp: existingAppValue,
  }
}

function getNormalizedStoreUrlsForCreate(existingAppValue: boolean): StoreUrls {
  if (existingAppValue && existingAppSetup.value === 'import')
    return getStoreUrls(storeUrl.value.trim())

  return { iosStoreUrl: null, androidStoreUrl: null }
}

async function createCandidateApp(values: AppCreateValues, candidateId: string, normalizedStoreUrls: StoreUrls) {
  const { data, error } = await supabase.functions.invoke('app', {
    method: 'POST',
    body: {
      owner_org: values.ownerOrg,
      app_id: candidateId,
      name: values.appName,
      need_onboarding: true,
      existing_app: values.existingApp,
      ios_store_url: normalizedStoreUrls.iosStoreUrl,
      android_store_url: normalizedStoreUrls.androidStoreUrl,
    },
  })

  if (!error && data?.app_id)
    return data as AppRow

  const functionError = await readFunctionError(error)
  const isConflict = isAppIdConflict({
    status: functionError?.status ?? (error as { status?: number } | null | undefined)?.status,
    message: `${functionError?.code ?? ''} ${functionError?.message ?? (error as { message?: string } | null | undefined)?.message ?? ''}`,
  })

  if (isConflict)
    return null

  appIdFeedback.value = functionError?.message ?? t('app-onboarding-toast-create-error')
  toast.error(appIdFeedback.value)
  throw error ?? new Error(appIdFeedback.value)
}

function applyCreatedCandidateFeedback(candidateId: string, initialAppId: string) {
  manualAppId.value = candidateId
  if (candidateId === initialAppId) {
    appIdFeedback.value = ''
    appIdSuggestions.value = []
    return
  }

  appIdFeedback.value = t('app-onboarding-appid-taken-switched', {
    original: initialAppId,
    replacement: candidateId,
  })
  appIdSuggestions.value = buildAlternativeAppIds(initialAppId)
  toast.info(appIdFeedback.value)
}

async function findCreatedAppCandidate(values: AppCreateValues, normalizedStoreUrls: StoreUrls): Promise<CreatedAppCandidate | null> {
  const candidateIds = [values.initialAppId, ...buildAlternativeAppIds(values.initialAppId)]

  for (const candidateId of candidateIds) {
    const responseData = await createCandidateApp(values, candidateId, normalizedStoreUrls)
    if (!responseData)
      continue

    applyCreatedCandidateFeedback(candidateId, values.initialAppId)
    return { appId: candidateId, responseData }
  }

  return null
}

function showNoAppIdCandidate(initialAppId: string) {
  appIdSuggestions.value = buildAlternativeAppIds(initialAppId)
  appIdFeedback.value = t('app-onboarding-appid-taken-pick-another', {
    appId: initialAppId,
  })
  toast.error(appIdFeedback.value)
}

async function finishCreatedAppRecord(candidate: CreatedAppCandidate) {
  const importedIconSource = canUseStoreImportPreview.value ? storeIconPreview.value : ''
  await uploadIcon(candidate.appId, importedIconSource)
  const { data: refreshed } = await supabase
    .from('apps')
    .select()
    .eq('app_id', candidate.appId)
    .single()

  createdApp.value = refreshed ?? candidate.responseData
  flowStep.value = 'choice'
}

async function createAppRecord() {
  const values = getAppCreateValues()
  if (!values)
    return

  isSubmitting.value = true
  try {
    const normalizedStoreUrls = getNormalizedStoreUrlsForCreate(values.existingApp)
    const candidate = await findCreatedAppCandidate(values, normalizedStoreUrls)
    if (!candidate) {
      showNoAppIdCandidate(values.initialAppId)
      return
    }

    await finishCreatedAppRecord(candidate)
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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('copied-to-clipboard'))
  }
  catch (error) {
    console.error('Failed to copy text', error)
    dialogStore.openDialog({
      title: t('cannot-copy'),
      description: text,
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

async function copyCliCommand() {
  await copyText(cliCommand.value)
}

async function copyAiInstructions() {
  await copyText(aiHelpPrompt.value)
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
    if (!resumed) {
      await applyStorePrefillFromQuery()
      flowStep.value = 'details'
    }
  }
  finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  if (localIconPreview.value.startsWith('blob:'))
    URL.revokeObjectURL(localIconPreview.value)
})

function getDefaultExistingAppSetup(value: boolean | null) {
  if (value === false)
    return 'manual'

  return null
}

watch(existingApp, (value) => {
  existingAppSetup.value = getDefaultExistingAppSetup(value)
  if (value !== true) {
    resetStoreImportState()
  }
  appIdSuggestions.value = []
  appIdFeedback.value = ''
})

watch(existingAppSetup, (value) => {
  if (value === 'manual')
    resetStoreImportState()
})

watch(suggestedAppId, (value) => {
  if (!hasEditedAppId.value && !createdApp.value)
    manualAppId.value = value
}, { immediate: true })
</script>

<template>
  <section class="min-h-full overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 dark:bg-slate-950">
    <div class="mx-auto w-full max-w-7xl">
      <div v-if="isLoading" class="flex min-h-[50vh] items-center justify-center">
        <Spinner size="w-32 h-32" />
      </div>

      <div v-else class="space-y-6">
        <header class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-end">
          <div>
            <div class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:border-white/15 dark:bg-slate-900/95 dark:text-slate-200 dark:shadow-lg dark:shadow-black/20">
              <IconSparkles class="h-4 w-4" />
              {{ t('app-onboarding-badge') }}
            </div>
            <h1 class="mt-4 max-w-3xl text-3xl font-semibold text-slate-950 sm:text-4xl dark:text-white">
              {{ props.onboarding
                ? t('app-onboarding-title-first')
                : t('app-onboarding-title-return') }}
            </h1>
            <p class="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
              {{ t('app-onboarding-subtitle') }}
            </p>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/15 dark:bg-slate-900/95 dark:shadow-2xl dark:shadow-black/30">
            <div class="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <div
                v-for="(entry, index) in appOnboardingSteps"
                :key="entry.id"
                class="flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 transition"
                :aria-current="flowStep === entry.id ? 'step' : undefined"
                :class="[
                  flowStep === entry.id ? 'border-primary-500/30 bg-slate-100 text-slate-950 ring-1 ring-primary-500/10 dark:border-primary-500/60 dark:bg-primary-500/25 dark:text-white dark:ring-primary-500/20' : '',
                  flowStep !== entry.id && index < currentStepIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-100' : '',
                  flowStep !== entry.id && index > currentStepIndex ? 'border-transparent bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-slate-950/90 dark:text-slate-400' : '',
                ]"
              >
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  :class="index < currentStepIndex ? 'bg-emerald-500 text-white' : flowStep === entry.id ? 'bg-primary-500 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
                >
                  <IconCheck v-if="index < currentStepIndex" class="h-4 w-4" />
                  <span v-else>{{ index + 1 }}</span>
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold">{{ entry.label }}</span>
                  <span class="mt-0.5 block text-xs opacity-75">
                    {{ t('app-onboarding-progress-count', { current: index + 1, total: appOnboardingSteps.length }) }}
                  </span>
                </span>
              </div>
            </div>
            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-950" aria-hidden="true">
              <div class="h-full rounded-full bg-primary-500 transition-all duration-300" :style="{ width: stepProgress }" />
            </div>
          </div>
        </header>

        <div v-if="flowStep === 'details'" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/15 dark:bg-slate-900/95 dark:shadow-2xl dark:shadow-black/30">
            <div class="space-y-6">
              <div>
                <p class="text-sm font-semibold text-primary-500 dark:text-slate-300">
                  {{ t('app-onboarding-step-details') }}
                </p>
                <h2 class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                  {{ t('app-onboarding-existing-question') }}
                </h2>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  :aria-pressed="existingApp === true"
                  class="group flex min-h-32 items-start gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                  :class="whiteCardToggleButtonClass(existingApp === true)"
                  @click="existingApp = true"
                >
                  <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white">
                    <IconStore class="h-5 w-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-base font-semibold">{{ t('app-onboarding-existing-yes') }}</span>
                    <span
                      class="mt-1 block text-sm leading-6"
                      :class="existingApp === true ? 'text-slate-600 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'"
                    >
                      {{ t('app-onboarding-existing-yes-helper') }}
                    </span>
                  </span>
                  <IconCheck v-if="existingApp === true" class="h-5 w-5 shrink-0 text-current" />
                </button>
                <button
                  type="button"
                  :aria-pressed="existingApp === false"
                  class="group flex min-h-32 items-start gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                  :class="whiteCardToggleButtonClass(existingApp === false)"
                  @click="existingApp = false"
                >
                  <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950">
                    <IconAppWindow class="h-5 w-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-base font-semibold">{{ t('app-onboarding-existing-no') }}</span>
                    <span
                      class="mt-1 block text-sm leading-6"
                      :class="existingApp === false ? 'text-slate-600 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'"
                    >
                      {{ t('app-onboarding-existing-no-helper') }}
                    </span>
                  </span>
                  <IconCheck v-if="existingApp === false" class="h-5 w-5 shrink-0 text-current" />
                </button>
              </div>

              <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 dark:border-white/20 dark:bg-slate-950/90">
                <button
                  type="button"
                  class="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-slate-300 dark:hover:text-white"
                  @click="isCliCommandVisible = !isCliCommandVisible"
                >
                  <IconTerminal class="h-4 w-4" />
                  {{ isCliCommandVisible ? t('app-onboarding-command-hide') : t('app-onboarding-command-show') }}
                </button>
                <p class="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {{ t('app-onboarding-command-help') }}
                </p>
                <button
                  v-if="isCliCommandVisible"
                  type="button"
                  class="d-btn d-btn-neutral group relative mt-3 h-auto min-h-0 w-full justify-start rounded-xl p-4 pr-14 text-left font-normal normal-case"
                  :aria-label="t('app-onboarding-command-copy')"
                  @click="copyCliCommand"
                >
                  <code class="block whitespace-pre-wrap break-all text-sm">
                    <span class="text-slate-500">npx</span>
                    <span class="text-sky-300"> @capgo/cli@latest</span>
                    <span class="mr-1 font-bold text-violet-300"> i</span>
                    <span class="text-emerald-300"> {{ apiKey ?? '[APIKEY]' }}</span>
                    <template v-for="(arg, index) in cliCommandArgs" :key="`${arg}-${index}`">
                      <span :class="index % 2 === 0 ? 'text-amber-300' : 'text-cyan-300'"> {{ arg }}</span>
                    </template>
                  </code>
                  <IconCopy class="absolute right-4 top-4 h-5 w-5 text-muted-blue-300 transition group-hover:text-white" />
                </button>
              </div>

              <div v-if="existingApp === true" class="space-y-5 border-t border-slate-200 pt-6 dark:border-white/15">
                <div>
                  <p class="text-sm font-semibold text-slate-950 dark:text-white">
                    {{ t('app-onboarding-start-question') }}
                  </p>
                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      :aria-pressed="existingAppSetup === 'import'"
                      class="flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                      :class="whiteCardToggleButtonClass(existingAppSetup === 'import')"
                      @click="existingAppSetup = 'import'"
                    >
                      <IconGlobe class="mt-0.5 h-5 w-5 shrink-0" />
                      <span>
                        <span class="block text-sm font-semibold">{{ t('app-onboarding-mode-import') }}</span>
                        <span class="mt-1 block text-sm leading-6 opacity-75">{{ t('app-onboarding-mode-import-helper') }}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      :aria-pressed="existingAppSetup === 'manual'"
                      class="flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                      :class="whiteCardToggleButtonClass(existingAppSetup === 'manual')"
                      @click="existingAppSetup = 'manual'"
                    >
                      <IconCode class="mt-0.5 h-5 w-5 shrink-0" />
                      <span>
                        <span class="block text-sm font-semibold">{{ t('app-onboarding-mode-manual') }}</span>
                        <span class="mt-1 block text-sm leading-6 opacity-75">{{ t('app-onboarding-mode-manual-helper') }}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <template v-if="existingAppSetup === 'import'">
                  <div>
                    <label for="app-onboarding-store-url" class="text-sm font-medium text-slate-800 dark:text-slate-200">{{ t('app-onboarding-store-link-label') }}</label>
                    <div class="mt-2 flex flex-col gap-3 sm:flex-row">
                      <input
                        id="app-onboarding-store-url"
                        v-model="storeUrl"
                        class="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-white/20 dark:bg-slate-950/90 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-primary-500 dark:focus:ring-primary-500/30"
                        :placeholder="t('app-onboarding-store-link-placeholder')"
                        type="url"
                      >
                      <button class="d-btn min-h-12 shrink-0" :class="whiteCardSecondaryButtonClass()" :disabled="isImportingStore || !storeUrl" @click="importStoreMetadata()">
                        <IconLoader v-if="isImportingStore" class="h-4 w-4 animate-spin" />
                        <IconSparkles v-else class="h-4 w-4" />
                        <span>{{ t('app-onboarding-store-import-button') }}</span>
                      </button>
                    </div>
                    <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400" aria-live="polite">
                      {{ hasImportedStoreMetadata
                        ? t('app-onboarding-store-imported-help')
                        : t('app-onboarding-store-help') }}
                    </p>
                  </div>
                </template>
              </div>

              <template v-if="canShowAppDetails">
                <div class="border-t border-slate-200 pt-6 dark:border-white/15">
                  <label for="app-onboarding-name" class="text-sm font-medium text-slate-800 dark:text-slate-200">{{ t('app-name') }}</label>
                  <input
                    id="app-onboarding-name"
                    v-model="appName"
                    class="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-white/20 dark:bg-slate-950/90 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-primary-500 dark:focus:ring-primary-500/30"
                    :placeholder="t('app-onboarding-name-placeholder')"
                    maxlength="100"
                  >
                </div>

                <div>
                  <label for="app-onboarding-app-id" class="text-sm font-medium text-slate-800 dark:text-slate-200">{{ t('app-id') }}</label>
                  <input
                    id="app-onboarding-app-id"
                    :value="manualAppId"
                    class="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-white/20 dark:bg-slate-950/90 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-primary-500 dark:focus:ring-primary-500/30"
                    :placeholder="t('app-onboarding-appid-placeholder')"
                    @input="onAppIdInput"
                  >
                  <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {{ existingApp
                      ? t('app-onboarding-appid-help-existing')
                      : t('app-onboarding-appid-help-new') }}
                  </p>
                  <output v-if="appIdFeedback" class="mt-2 block text-sm font-medium text-amber-700 dark:text-amber-300" for="app-onboarding-app-id">
                    {{ appIdFeedback }}
                  </output>
                  <div v-if="appIdSuggestions.length > 0" class="mt-3 flex flex-wrap gap-2">
                    <button
                      v-for="suggestion in appIdSuggestions"
                      :key="suggestion"
                      type="button"
                      class="min-h-9 rounded-full border border-slate-300 bg-white px-3 py-1 font-mono text-xs text-slate-700 transition hover:border-primary-500/40 hover:text-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-white/20 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:border-white/30 dark:hover:text-white"
                      @click="applyAppIdSuggestion(suggestion)"
                    >
                      {{ suggestion }}
                    </button>
                  </div>
                </div>

                <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/15 dark:bg-slate-950/90">
                  <div class="flex items-start gap-3">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
                      <IconImage class="h-5 w-5" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <FormKit
                        type="file"
                        :label="t('app-onboarding-icon-label')"
                        accept="image/*"
                        outer-class="mt-0"
                        label-class="text-sm font-medium text-slate-800 dark:text-slate-200"
                        input-class="mt-2 block w-full min-h-11 text-sm text-slate-600 file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-white file:px-3 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-900 dark:file:text-slate-200"
                        @update:model-value="onSelectIconFormKit"
                      />
                      <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {{ t('app-onboarding-icon-help') }}
                      </p>
                    </div>
                  </div>
                </div>

                <div class="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-white/15">
                  <button class="d-btn min-h-12" :class="whiteCardSecondaryButtonClass()" @click="router.push('/apps')">
                    {{ t('button-cancel') }}
                  </button>
                  <button class="d-btn min-h-12" :class="whiteCardPrimaryButtonClass()" :disabled="isSubmitting" @click="createAppRecord">
                    <IconLoader v-if="isSubmitting" class="h-4 w-4 animate-spin" />
                    <span v-else>{{ t('app-onboarding-continue') }}</span>
                    <IconArrowRight v-if="!isSubmitting" class="h-4 w-4" />
                  </button>
                </div>
              </template>
            </div>
          </div>

          <aside class="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-white shadow-sm lg:sticky lg:top-6 dark:border-white/15 dark:bg-slate-900/95 dark:shadow-2xl dark:shadow-black/30" :aria-label="t('app-onboarding-preview-label')">
            <div class="flex items-center gap-4">
              <div class="flex h-18 w-18 items-center justify-center overflow-hidden rounded-[22px] bg-slate-900 ring-1 ring-white/10">
                <img v-if="iconPreview" :src="iconPreview" :alt="t('app-onboarding-icon-preview-alt')" class="h-full w-full object-cover">
                <span v-else-if="isResumeIconLoading" class="h-7 w-7 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" :aria-label="t('loading')" />
                <IconSmartphone v-else class="h-8 w-8 text-slate-500" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase text-slate-400">
                  {{ t('app-onboarding-preview-label') }}
                </p>
                <p class="truncate text-lg font-semibold">
                  {{ appName || t('app-onboarding-preview-placeholder') }}
                </p>
                <p class="mt-1 truncate font-mono text-xs text-slate-400">
                  {{ generatedAppId }}
                </p>
              </div>
            </div>

            <div v-if="storeScreenshotPreview" class="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
              <img :src="storeScreenshotPreview" :alt="t('app-onboarding-store-screenshot-alt')" class="aspect-9/19.5 w-full object-cover object-top">
            </div>

            <dl class="mt-6 grid gap-3 text-sm">
              <div class="rounded-xl bg-white/5 p-3">
                <dt class="text-xs font-semibold uppercase text-slate-400">
                  {{ t('app-onboarding-summary-source') }}
                </dt>
                <dd class="mt-1 text-slate-100">
                  {{ selectedStartLabel }}
                </dd>
              </div>
              <div class="rounded-xl bg-white/5 p-3">
                <dt class="text-xs font-semibold uppercase text-slate-400">
                  {{ t('app-onboarding-summary-method') }}
                </dt>
                <dd class="mt-1 text-slate-100">
                  {{ selectedSetupLabel }}
                </dd>
              </div>
              <div class="rounded-xl bg-white/5 p-3">
                <dt class="text-xs font-semibold uppercase text-slate-400">
                  {{ t('app-onboarding-summary-status') }}
                </dt>
                <dd class="mt-1 text-slate-100">
                  {{ previewStatusLabel }}
                </dd>
              </div>
            </dl>

            <div class="mt-6 border-t border-white/10 pt-5">
              <p class="text-sm font-semibold text-white">
                {{ t('app-onboarding-next-title') }}
              </p>
              <ul class="mt-3 space-y-3 text-sm leading-6 text-slate-300">
                <li class="flex gap-3">
                  <IconCheck class="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                  {{ t('app-onboarding-preview-bullet-one') }}
                </li>
                <li class="flex gap-3">
                  <IconCheck class="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                  {{ t('app-onboarding-preview-bullet-two') }}
                </li>
                <li class="flex gap-3">
                  <IconCheck class="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                  {{ t('app-onboarding-preview-bullet-three') }}
                </li>
              </ul>
            </div>
          </aside>
        </div>

        <div v-else-if="flowStep === 'choice' && createdApp" class="space-y-6">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/15 dark:bg-slate-900/95 dark:shadow-2xl dark:shadow-black/30">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-primary-500 dark:text-slate-300">
                  {{ t('app-onboarding-step-choice') }}
                </p>
                <h2 class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                  {{ t('app-onboarding-choice-title') }}
                </h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {{ t('app-onboarding-choice-subtitle') }}
                </p>
              </div>
              <div class="rounded-xl bg-slate-50 px-3 py-2 text-sm dark:border dark:border-white/10 dark:bg-slate-950/90">
                <span class="text-slate-500 dark:text-slate-400">{{ t('app-id') }}</span>
                <span class="ml-2 font-mono font-medium text-slate-950 dark:text-white">{{ createdApp.app_id }}</span>
              </div>
            </div>

            <div class="mt-6 grid gap-4 md:grid-cols-2">
              <button class="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-primary-500/40 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-white/15 dark:bg-slate-950/90 dark:hover:border-white/30 dark:hover:bg-slate-900" @click="goToInstallStep">
                <div class="flex items-start gap-4">
                  <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white">
                    <IconTerminal class="h-5 w-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="text-sm font-semibold uppercase text-primary-500 dark:text-slate-300">
                      {{ t('app-onboarding-choice-real-badge') }}
                    </span>
                    <span class="mt-2 block text-xl font-semibold text-slate-950 dark:text-white">
                      {{ t('app-onboarding-choice-real-title') }}
                    </span>
                    <span class="mt-2 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {{ t('app-onboarding-choice-real-subtitle') }} <span class="font-mono">{{ createdApp.app_id }}</span>.
                    </span>
                  </span>
                  <IconArrowRight class="mt-1 h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-primary-500" />
                </div>
              </button>

              <button
                class="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-70 dark:border-white/15 dark:bg-slate-950/90 dark:hover:border-emerald-400/60 dark:hover:bg-emerald-400/10"
                :disabled="isSeedingDemo"
                @click="seedDemoData"
              >
                <div class="flex items-start gap-4">
                  <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
                    <IconPackage class="h-5 w-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="text-sm font-semibold uppercase text-emerald-600 dark:text-emerald-300">
                      {{ t('app-onboarding-choice-demo-badge') }}
                    </span>
                    <span class="mt-2 block text-xl font-semibold text-slate-950 dark:text-white">
                      {{ t('app-onboarding-choice-demo-title') }}
                    </span>
                    <span class="mt-2 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {{ t('app-onboarding-choice-demo-subtitle') }}
                    </span>
                    <span v-if="isSeedingDemo" class="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      <IconLoader class="h-4 w-4 animate-spin" />
                      {{ t('app-onboarding-choice-demo-loading') }}
                    </span>
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="flowStep === 'install' && createdApp" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div class="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/15 dark:bg-slate-900/95 dark:shadow-2xl dark:shadow-black/30">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="text-sm font-semibold text-primary-500 dark:text-slate-300">
                  {{ t('app-onboarding-install-badge') }}
                </p>
                <h2 class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                  {{ t('app-onboarding-install-title') }}
                </h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {{ t('app-onboarding-install-subtitle') }}
                </p>
              </div>
              <button class="d-btn min-h-11" :class="whiteCardSecondaryButtonClass()" @click="openDashboard">
                {{ t('app-onboarding-open-dashboard') }}
              </button>
            </div>

            <button
              type="button"
              class="d-btn d-btn-neutral group relative h-auto min-h-0 w-full justify-start rounded-2xl p-5 pr-14 text-left font-normal normal-case"
              :aria-label="t('app-onboarding-command-copy')"
              @click="copyCliCommand"
            >
              <code class="block whitespace-pre-wrap break-all text-sm">
                <span class="text-slate-500">npx</span>
                <span class="text-sky-300"> @capgo/cli@latest</span>
                <span class="mr-1 font-bold text-violet-300"> i</span>
                <span class="text-emerald-300"> {{ apiKey ?? '[APIKEY]' }}</span>
                <template v-for="(arg, index) in cliCommandArgs" :key="`${arg}-${index}`">
                  <span :class="index % 2 === 0 ? 'text-amber-300' : 'text-cyan-300'"> {{ arg }}</span>
                </template>
              </code>
              <IconCopy class="absolute right-4 top-4 h-5 w-5 text-muted-blue-300 transition group-hover:text-white" />
            </button>

            <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 dark:border-white/15 dark:bg-slate-950/90 dark:text-slate-200">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="max-w-2xl">
                  <p class="font-medium text-slate-950 dark:text-white">
                    {{ t('app-onboarding-ai-help-title') }}
                  </p>
                  <p class="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {{ t('app-onboarding-ai-help-caption') }}
                  </p>
                </div>
                <button class="d-btn min-h-11" :class="whiteCardSecondaryButtonClass()" @click="copyAiInstructions">
                  <IconCopy class="h-4 w-4" />
                  {{ t('app-onboarding-ai-help-button') }}
                </button>
              </div>
            </div>

            <div class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button class="d-btn min-h-11" :class="whiteCardSecondaryButtonClass()" @click="flowStep = 'choice'">
                {{ t('button-back') }}
              </button>
              <button class="d-btn min-h-11" :class="whiteCardPrimaryButtonClass()" @click="openDashboard">
                {{ t('app-onboarding-install-later') }}
                <IconArrowRight class="h-4 w-4" />
              </button>
            </div>
          </div>

          <aside class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/15 dark:bg-slate-900/95 dark:shadow-2xl dark:shadow-black/30" :aria-label="t('app-onboarding-install-ready-title')">
            <div class="flex items-center gap-3">
              <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white">
                <IconBadgeCheck class="h-5 w-5" />
              </span>
              <div>
                <p class="text-sm font-semibold text-slate-950 dark:text-white">
                  {{ t('app-onboarding-install-ready-title') }}
                </p>
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  {{ createdApp.app_id }}
                </p>
              </div>
            </div>
            <p class="mt-6 text-sm font-semibold text-slate-950 dark:text-white">
              {{ t('app-onboarding-next-title') }}
            </p>
            <ul class="mt-3 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <li class="flex gap-3">
                <IconCheck class="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                {{ createdApp.existing_app
                  ? t('app-onboarding-next-existing')
                  : t('app-onboarding-next-new') }}
              </li>
              <li class="flex gap-3">
                <IconCheck class="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                {{ t('app-onboarding-next-cleanup') }}
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>
