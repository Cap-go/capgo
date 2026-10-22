<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconCheck from '~icons/lucide/check'
import IconCircleCheck from '~icons/lucide/circle-check'
import IconCopy from '~icons/lucide/copy'
import IconLoader from '~icons/lucide/loader-2'
import IconShieldCheck from '~icons/lucide/shield-check'
import AppOnboardingHeader from '~/components/dashboard/AppOnboardingHeader.vue'
import AppOnboardingPageFrame from '~/components/dashboard/AppOnboardingPageFrame.vue'
import { developmentEnvironmentOptions } from '~/components/dashboard/onboardingDevelopmentEnvironmentOptions'
import { createDefaultApiKey, findUsablePlainApiKey, shareInFlightApiKeyLoad } from '~/services/apikeys'
import { buildAiOnboardingPrompt } from '~/services/cliAiPrompt'
import { sendOnboardingEvent } from '~/services/onboardingTracking'
import { useSupabase } from '~/services/supabase'
import { replaceUserOnboardingWithRetry, serializeUserOnboardingWrite } from '~/services/userOnboardingWriteQueue'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import { onboardingPrimaryButtonClass, onboardingSecondaryButtonClass } from '~/utils/onboardingButtonClasses'
import { allowOnboardingDashboardExploration, getAppGettingStartedPath } from '~/utils/onboardingRedirect'
import { withOnboardingSetupMode } from '~/utils/onboardingSetupMode'

const APP_POLL_INTERVAL_MS = 4000
const MASKED_KEY = 'capgo_••••••••••••••••'

const { t } = useI18n()
const router = useRouter()
const supabase = useSupabase()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const dialogStore = useDialogV2Store()

const isLoading = ref(true)
const isLoggingOut = ref(false)
const isLeaving = ref(false)
const loadFailed = ref(false)
const apiKey = ref<string | null>(null)
const copied = ref(false)
const detectedApp = ref<{ app_id: string, name: string | null } | null>(null)
const organization = computed(() => organizationStore.currentOrganization)
const assistantIcons = developmentEnvironmentOptions.find(option => option.value === 'ai_assistant')?.icons ?? []
let pollTimer: ReturnType<typeof setInterval> | undefined
let disposed = false

const steps = computed(() => [
  { id: 'name', label: t('unified-onboarding-step-about-you') },
  { id: 'mode', label: t('ai-onboarding-step-mode') },
  { id: 'plan', label: t('ai-onboarding-step-plan') },
  { id: 'agent', label: t('ai-onboarding-step-agent') },
])
const agentTasks = computed(() => [
  t('ai-onboarding-task-login'),
  t('ai-onboarding-task-mcp'),
  t('ai-onboarding-task-app'),
  t('ai-onboarding-task-setup'),
])

function promptFor(key: string) {
  const org = organization.value
  if (!org)
    return ''
  return buildAiOnboardingPrompt({ apiKey: key, organization: { id: org.gid, name: org.name } })
}

const prompt = computed(() => apiKey.value ? promptFor(apiKey.value) : '')
// Show the prompt without the secret; the real key only goes to the clipboard.
const promptPreview = computed(() => apiKey.value ? promptFor(MASKED_KEY) : '')

async function ensureApiKey(userId: string, orgId: string) {
  const existing = await findUsablePlainApiKey(supabase, userId, orgId)
  if (existing)
    return existing
  const { data, error } = await createDefaultApiKey(supabase, 'ai-onboarding', { orgId })
  if (error)
    throw error
  return typeof data?.key === 'string' ? data.key : await findUsablePlainApiKey(supabase, userId, orgId)
}

async function loadApiKey() {
  const userId = main.user?.id ?? main.auth?.id
  const orgId = organization.value?.gid
  if (!userId || !orgId)
    return
  loadFailed.value = false
  try {
    apiKey.value = await shareInFlightApiKeyLoad({ userId, orgId }, () => ensureApiKey(userId, orgId))
    if (!apiKey.value)
      loadFailed.value = true
  }
  catch (error) {
    console.error('Cannot prepare API key for AI onboarding', error)
    loadFailed.value = true
  }
}

async function copyPrompt() {
  if (!prompt.value)
    return
  try {
    await navigator.clipboard.writeText(prompt.value)
    copied.value = true
    toast.success(t('copied-to-clipboard'))
    sendOnboardingEvent('onboarding_ai_setup_prompt_copied', { org_id: organization.value?.gid ?? '' })
  }
  catch (error) {
    console.error('Failed to copy AI onboarding prompt', error)
    dialogStore.openDialog({
      title: t('cannot-copy'),
      description: prompt.value,
      buttons: [{ text: t('button-cancel'), role: 'cancel' }],
    })
  }
}

async function checkForApp() {
  const orgId = organization.value?.gid
  if (!orgId || detectedApp.value || document.visibilityState === 'hidden')
    return
  const { data, error } = await supabase
    .from('apps')
    .select('app_id, name')
    .eq('owner_org', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
  if (disposed || error || !data?.[0])
    return
  detectedApp.value = data[0]
  stopPolling()
  sendOnboardingEvent('onboarding_ai_app_detected', { org_id: orgId, app_id: data[0].app_id })
}

function stopPolling() {
  if (pollTimer)
    clearInterval(pollTimer)
  pollTimer = undefined
}

async function rememberManualSetup() {
  const userId = main.user?.id
  if (!userId)
    return
  try {
    await serializeUserOnboardingWrite(userId, async () => {
      const result = await replaceUserOnboardingWithRetry(userId, main.user!.onboarding, current => withOnboardingSetupMode(current, 'manual'), () => main.user?.id === userId)
      if (result.status === 'persisted' && main.user?.id === userId)
        main.user = { ...main.user, onboarding: result.onboarding }
    })
  }
  catch (error) {
    console.warn('Cannot remember manual onboarding setup', error)
  }
}

async function switchToManual() {
  if (isLeaving.value)
    return
  isLeaving.value = true
  try {
    sendOnboardingEvent('onboarding_ai_switched_to_manual', { org_id: organization.value?.gid ?? '' })
    await rememberManualSetup()
    await router.push('/app/new')
  }
  finally {
    isLeaving.value = false
  }
}

async function exploreDashboard() {
  allowOnboardingDashboardExploration(main.user?.id ?? main.auth?.id)
  await router.push('/dashboard')
}

async function openApp() {
  if (detectedApp.value)
    await router.push(getAppGettingStartedPath(detectedApp.value.app_id))
}

async function logout() {
  if (isLoggingOut.value)
    return
  isLoggingOut.value = true
  try {
    await main.logout()
    await router.replace('/login')
  }
  catch (error) {
    console.error('Failed to log out from AI onboarding', error)
    toast.error(t('cannot-sign-off'))
  }
  finally {
    isLoggingOut.value = false
  }
}

onMounted(async () => {
  try {
    await organizationStore.awaitInitialLoad()
    if (disposed)
      return
    if (!organization.value) {
      // No organization yet: the plan step creates it.
      await router.replace('/onboarding/app')
      return
    }
    await Promise.all([loadApiKey(), checkForApp()])
    if (!detectedApp.value)
      pollTimer = setInterval(() => void checkForApp(), APP_POLL_INTERVAL_MS)
  }
  finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  disposed = true
  stopPolling()
})
</script>

<template>
  <AppOnboardingPageFrame :is-logging-out="isLoggingOut" @logout="logout">
    <section class="onboarding-flow-shell onboarding-flow-app-creation h-full min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div class="onboarding-flow-content mx-auto w-full max-w-3xl space-y-6">
        <AppOnboardingHeader :title="t('ai-onboarding-agent-title')" :steps="steps" current-step-id="agent" />

        <div v-if="isLoading" class="flex min-h-[40vh] items-center justify-center">
          <Spinner size="w-16 h-16" />
        </div>

        <template v-else>
          <div v-if="detectedApp" class="rounded-2xl border border-emerald-500/40 bg-emerald-50 p-5 shadow-sm sm:p-6 dark:border-emerald-400/30 dark:bg-emerald-500/10" data-test="onboarding-ai-app-detected">
            <div class="flex gap-3">
              <IconCircleCheck class="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <div class="min-w-0">
                <h2 class="text-lg font-semibold text-slate-950 dark:text-white">
                  {{ t('ai-onboarding-app-detected-title', { name: detectedApp.name || detectedApp.app_id }) }}
                </h2>
                <p class="mt-1 break-all text-sm text-slate-600 dark:text-slate-300">
                  {{ detectedApp.app_id }}
                </p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {{ t('ai-onboarding-app-detected-desc') }}
                </p>
              </div>
            </div>
            <div class="mt-5 flex justify-end">
              <button type="button" class="d-btn min-h-12" :class="onboardingPrimaryButtonClass" data-test="onboarding-ai-open-app" @click="openApp">
                {{ t('ai-onboarding-open-app') }}<IconArrowRight class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/15 dark:bg-slate-900/95" data-test="onboarding-ai-prompt-card">
            <div class="space-y-5">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-sm font-semibold text-primary-500 dark:text-slate-300">
                    {{ organization?.name }}
                  </p>
                  <h2 class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                    {{ t('ai-onboarding-prompt-title') }}
                  </h2>
                  <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {{ t('ai-onboarding-prompt-subtitle') }}
                  </p>
                </div>
                <div class="flex shrink-0 -space-x-2" aria-hidden="true">
                  <img v-for="icon in assistantIcons" :key="icon" :src="icon" alt="" class="h-8 w-8 rounded-full border-2 border-white bg-white p-1 dark:border-slate-900">
                </div>
              </div>

              <div v-if="loadFailed" role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {{ t('app-onboarding-toast-apikey-error') }}
                <button type="button" class="ml-2 font-semibold underline" data-test="onboarding-ai-retry-key" @click="loadApiKey">
                  {{ t('retry') }}
                </button>
              </div>

              <pre
                v-else
                class="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-200 dark:border-white/10"
                data-test="onboarding-ai-prompt"
              >{{ promptPreview || '…' }}</pre>

              <button
                type="button"
                class="d-btn min-h-14 w-full text-base"
                :class="onboardingPrimaryButtonClass"
                :disabled="!prompt"
                data-test="onboarding-ai-copy-prompt"
                @click="copyPrompt"
              >
                <IconCheck v-if="copied" class="h-5 w-5" />
                <IconCopy v-else class="h-5 w-5" />
                {{ copied ? t('ai-onboarding-prompt-copied') : t('ai-onboarding-copy-prompt') }}
              </button>

              <p class="flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                <IconShieldCheck class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {{ t('ai-onboarding-prompt-key-note') }}
              </p>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/15 dark:bg-slate-900/95">
            <h3 class="text-base font-semibold text-slate-950 dark:text-white">
              {{ t('ai-onboarding-tasks-title') }}
            </h3>
            <ol class="mt-4 space-y-3">
              <li v-for="(task, index) in agentTasks" :key="task" class="flex items-start gap-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-xs font-semibold text-primary-500">{{ index + 1 }}</span>
                <span>{{ task }}</span>
              </li>
            </ol>
            <div v-if="!detectedApp" class="mt-5 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-950/60 dark:text-slate-300" role="status" data-test="onboarding-ai-waiting">
              <IconLoader class="h-4 w-4 animate-spin text-primary-500" aria-hidden="true" />
              {{ t('ai-onboarding-waiting-for-app') }}
            </div>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" class="d-btn min-h-11" :class="onboardingSecondaryButtonClass" :disabled="isLeaving" data-test="onboarding-ai-manual" @click="switchToManual">
              {{ t('ai-onboarding-switch-manual') }}
            </button>
            <button type="button" class="d-btn d-btn-ghost min-h-11 text-slate-600 dark:text-slate-300" data-test="onboarding-ai-explore" @click="exploreDashboard">
              {{ t('ai-onboarding-explore-dashboard') }}
            </button>
          </div>
        </template>
      </div>
    </section>
  </AppOnboardingPageFrame>
</template>

<route lang="yaml">
meta:
  layout: naked
  middleware: auth
</route>
