<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconCheck from '~icons/lucide/check'
import IconLoader from '~icons/lucide/loader-2'
import { createDefaultApiKey } from '~/services/apikeys'
import { createSignedImageUrl } from '~/services/storage'
import { getLocalConfig, isLocal, useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  onboarding: boolean
}>()

const route = useRoute('/app/new')
const router = useRouter()
const supabase = useSupabase()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const config = getLocalConfig()

type AppRow = Database['public']['Tables']['apps']['Row']

const isLoading = ref(true)
const isSubmitting = ref(false)
const isImportingStore = ref(false)
const isSeedingDemo = ref(false)
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

const localCommand = isLocal(config.supaHost) ? ` --supa-host ${config.supaHost} --supa-anon ${config.supaKey}` : ''
const cliCommand = computed(() => `npx @capgo/cli@latest i ${apiKey.value ?? '[APIKEY]'}${localCommand}`)
const currentOrg = computed(() => organizationStore.currentOrganization)
const resumeAppId = computed(() => {
  const value = route.query.resume
  return typeof value === 'string' ? value : ''
})
const iconPreview = computed(() => localIconPreview.value || storeIconPreview.value || '')
const canShowAppDetails = computed(() => {
  if (existingApp.value === false)
    return true
  if (existingApp.value === true)
    return existingAppSetup.value !== null
  return false
})
const generatedAppId = computed(() => {
  if (createdApp.value)
    return createdApp.value.app_id

  const storeAppId = importedStoreAppId.value || extractAndroidAppId(storeUrl.value)
  if (existingApp.value === true && storeAppId)
    return storeAppId

  const orgSlug = slugify(currentOrg.value?.name || 'capgo')
  const appSlug = slugify(appName.value || 'mobile-app')
  return `com.${orgSlug}.${appSlug}`
})

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

  const { data, error } = await supabase
    .from('apikeys')
    .select('key')
    .eq('user_id', userId)
    .eq('mode', 'all')
    .limit(1)

  if (!error && data?.[0]?.key) {
    apiKey.value = data[0].key
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
    .select('key')
    .eq('user_id', claimsUserId)
    .eq('mode', 'all')
    .limit(1)

  apiKey.value = refreshedData?.[0]?.key ?? null
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
    toast.error('Unable to find the onboarding app.')
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
  flowStep.value = 'choice'
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
    toast.error('Unable to fetch metadata from that store link.')
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
  localIconPreview.value = file ? URL.createObjectURL(file) : ''
}

async function uploadIcon(appId: string, iconSourceUrl?: string) {
  if (!currentOrg.value?.gid)
    return

  let fileToUpload = selectedIconFile.value

  if (!fileToUpload && iconSourceUrl) {
    try {
      const response = await fetch(iconSourceUrl)
      const blob = await response.blob()
      fileToUpload = new File([blob], 'store-icon.png', { type: blob.type || 'image/png' })
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
    toast.error('No organization selected.')
    return
  }

  if (existingApp.value === null) {
    toast.error('Choose whether the app already exists.')
    return
  }

  if (!appName.value.trim()) {
    toast.error('Add an app name to continue.')
    return
  }

  isSubmitting.value = true
  try {
    const normalizedStoreUrls = getStoreUrls(storeUrl.value.trim())

    let appId = generatedAppId.value
    let responseData: AppRow | null = null

    for (let attempt = 0; attempt < 2; attempt++) {
      const candidateId = attempt === 0 ? appId : `${appId}.${crypto.randomUUID().slice(0, 4)}`
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
        break
      }
    }

    if (!responseData) {
      toast.error('Unable to create the onboarding app.')
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
    toast.error('Unable to create the onboarding app.')
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

    router.push(`/app/${encodeURIComponent(createdApp.value.app_id)}?tour=1`)
  }
  catch (error) {
    console.error('Cannot seed demo data', error)
    toast.error('Unable to create demo data for this app.')
  }
  finally {
    isSeedingDemo.value = false
  }
}

function goToInstallStep() {
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
    await ensureApiKey()
    const resumed = await loadResumeApp()
    if (!resumed)
      flowStep.value = 'details'
  }
  finally {
    isLoading.value = false
  }
})

watch(existingApp, (value) => {
  existingAppSetup.value = value === true ? null : value === false ? 'manual' : null
  if (value !== true) {
    storeUrl.value = ''
    storeIconPreview.value = ''
    storeScreenshotPreview.value = ''
    importedStoreAppId.value = ''
  }
})
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
            Create your app
          </p>
          <h1 class="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
            {{ props.onboarding ? 'Create your first app, then choose how you want to start.' : 'Create an app, then install Capgo when you are ready.' }}
          </h1>
          <p class="max-w-2xl mx-auto mt-3 text-base text-slate-600">
            The app is created immediately in Capgo. From there you can either connect your real project in the CLI or explore the dashboard with temporary demo data.
          </p>
        </div>

        <div v-if="flowStep === 'details'" class="p-6 bg-white border shadow-sm rounded-3xl border-slate-200">
          <div class="grid gap-6 md:grid-cols-[1.25fr_0.9fr]">
            <div class="space-y-5">
              <div class="rounded-2xl border border-slate-200 p-4">
                <p class="text-sm font-medium text-slate-900">
                  Does the app already exist?
                </p>
                <div class="flex flex-wrap gap-3 mt-4">
                  <button class="d-btn" :class="existingApp === true ? 'd-btn-primary' : 'd-btn-outline'" @click="existingApp = true">
                    Yes, it already exists
                  </button>
                  <button class="d-btn" :class="existingApp === false ? 'd-btn-primary' : 'd-btn-outline'" @click="existingApp = false">
                    No, create it from the CLI
                  </button>
                </div>
              </div>

              <div v-if="existingApp === true" class="grid gap-4 rounded-2xl border border-slate-200 p-4">
                <div>
                  <p class="text-sm font-medium text-slate-900">
                    How do you want to start?
                  </p>
                  <div class="flex flex-wrap gap-3 mt-4">
                    <button class="d-btn" :class="existingAppSetup === 'import' ? 'd-btn-primary' : 'd-btn-outline'" @click="existingAppSetup = 'import'">
                      Import from store
                    </button>
                    <button class="d-btn" :class="existingAppSetup === 'manual' ? 'd-btn-primary' : 'd-btn-outline'" @click="existingAppSetup = 'manual'">
                      Set up manually
                    </button>
                  </div>
                </div>

                <template v-if="existingAppSetup === 'import'">
                  <div>
                    <label class="text-sm font-medium text-slate-800">App Store or Google Play link</label>
                    <input v-model="storeUrl" class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="https://apps.apple.com/... or https://play.google.com/store/apps/details?id=com.example.app" type="url">
                  </div>
                  <button class="d-btn d-btn-outline w-fit" :disabled="isImportingStore || !storeUrl" @click="importStoreMetadata()">
                    <IconLoader v-if="isImportingStore" class="w-4 h-4 animate-spin" />
                    Import app name and icon
                  </button>
                </template>
              </div>

              <template v-if="canShowAppDetails">
                <div>
                  <label class="text-sm font-medium text-slate-800">App name</label>
                  <input v-model="appName" class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="Capgo demo app" maxlength="100">
                </div>

                <div>
                  <FormKit
                    type="file"
                    label="App icon"
                    accept="image/*"
                    outer-class="mt-0"
                    input-class="mt-2 block w-full text-sm text-slate-600"
                    @update:model-value="onSelectIconFormKit"
                  />
                  <p class="text-xs text-slate-500">
                    We keep the icon optional. If you imported store metadata, we will try to reuse that icon automatically.
                  </p>
                </div>

                <div class="flex flex-wrap gap-3">
                  <button class="d-btn d-btn-primary" :disabled="isSubmitting" @click="createAppRecord">
                    <IconLoader v-if="isSubmitting" class="w-4 h-4 animate-spin" />
                    Continue
                  </button>
                  <button class="d-btn d-btn-outline" @click="router.push('/apps')">
                    Cancel
                  </button>
                </div>
              </template>
            </div>

            <div class="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
              <div class="rounded-[24px] border border-white/10 bg-slate-900 p-5">
                <div class="flex items-center gap-4">
                  <div class="flex h-18 w-18 items-center justify-center overflow-hidden rounded-[22px] bg-slate-800 text-3xl">
                    <img v-if="iconPreview" :src="iconPreview" alt="App icon preview" class="h-full w-full object-cover">
                    <span v-else>📱</span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Preview
                    </p>
                    <p class="truncate text-lg font-semibold">
                      {{ appName || 'Your app' }}
                    </p>
                    <p class="mt-1 truncate text-xs text-slate-400">
                      {{ generatedAppId }}
                    </p>
                  </div>
                </div>
                <div v-if="storeScreenshotPreview" class="mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/40">
                  <img :src="storeScreenshotPreview" alt="Store screenshot preview" class="aspect-[9/19.5] w-full object-cover object-top">
                </div>
                <ul class="mt-6 space-y-3 text-sm text-slate-300">
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    Capgo creates one onboarding app and keeps the same record for demo mode or real setup.
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    Demo data stays disposable. When the CLI completes, pending onboarding data can be cleared automatically.
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    Existing apps skip local Capacitor scaffolding later in the CLI.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="flowStep === 'choice' && createdApp" class="grid gap-6 md:grid-cols-2">
          <button class="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-azure-300 hover:shadow-md" @click="goToInstallStep">
            <p class="text-sm font-semibold uppercase tracking-[0.18em] text-azure-500">
              Real app
            </p>
            <h2 class="mt-3 text-2xl font-semibold text-slate-900">
              Install Capgo in your project
            </h2>
            <p class="mt-3 text-sm text-slate-600">
              Continue with the CLI and finish the real setup in your codebase. Capgo will reuse <span class="font-mono">{{ createdApp.app_id }}</span>.
            </p>
          </button>

          <button
            class="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md"
            :disabled="isSeedingDemo"
            @click="seedDemoData"
          >
            <p class="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-500">
              Explore first
            </p>
            <h2 class="mt-3 text-2xl font-semibold text-slate-900">
              Add demo data and take a tour
            </h2>
            <p class="mt-3 text-sm text-slate-600">
              We will populate this app with temporary bundles, channels, devices, and charts so you can learn the dashboard before touching the CLI.
            </p>
            <p v-if="isSeedingDemo" class="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <IconLoader class="h-4 w-4 animate-spin" />
              Creating demo data
            </p>
          </button>
        </div>

        <div v-else-if="flowStep === 'install' && createdApp" class="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.18em] text-azure-500">
                CLI onboarding
              </p>
              <h2 class="mt-2 text-2xl font-semibold text-slate-900">
                Finish setup in your app
              </h2>
              <p class="mt-2 max-w-2xl text-sm text-slate-600">
                Run the init command in the app project. The upcoming CLI change can detect this pending app and reuse it instead of creating a second app in Capgo.
              </p>
            </div>
            <button class="d-btn d-btn-outline" @click="openDashboard">
              Open dashboard
            </button>
          </div>

          <div class="rounded-2xl bg-black p-5">
            <code class="block whitespace-pre-wrap break-all text-sm text-pumpkin-orange-700">{{ cliCommand }}</code>
          </div>

          <div class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <p class="font-medium text-slate-900">
              What happens next
            </p>
            <ul class="mt-3 space-y-2">
              <li class="flex gap-3">
                <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {{ createdApp.existing_app ? 'The CLI should attach Capgo to your existing project without scaffolding a new Capacitor app.' : 'The CLI can scaffold the local Capacitor app with the generated app ID if you do not have one yet.' }}
              </li>
              <li class="flex gap-3">
                <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                When the CLI marks onboarding as completed, the temporary onboarding data can be cleared automatically before the first real upload continues.
              </li>
            </ul>
          </div>

          <div class="flex flex-wrap gap-3">
            <button class="d-btn d-btn-primary" @click="openDashboard">
              I’ll do the CLI later
            </button>
            <button class="d-btn d-btn-outline" @click="flowStep = 'choice'">
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
