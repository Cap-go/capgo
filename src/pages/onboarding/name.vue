<script setup lang="ts">
import type { Json } from '~/types/supabase.types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconLoader from '~icons/lucide/loader-2'
import AppOnboardingHeader from '~/components/dashboard/AppOnboardingHeader.vue'
import AppOnboardingPageFrame from '~/components/dashboard/AppOnboardingPageFrame.vue'
import AppOnboardingWelcome from '~/components/dashboard/AppOnboardingWelcome.vue'
import OnboardingProfile from '~/components/OnboardingProfile.vue'
import { getLocalConfig } from '~/services/supabase'
import { mergeUserOnboardingProgress, replaceUserOnboardingWithRetry, serializeUserOnboardingWrite } from '~/services/userOnboardingWriteQueue'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import { onboardingPrimaryButtonClass } from '~/utils/onboardingButtonClasses'
import { canEditInitialOnboardingName, consumeProfileOnboardingHandoff, initialProfileOnboardingProgressSteps, initialProfileOnboardingSteps, needsInitialOnboardingName, PROFILE_ONBOARDING_HANDOFF_KEY } from '~/utils/onboardingProfile'
import { createOnboardingDetailsFieldDebouncer, createOnboardingProgressTracker, createOnboardingTelemetryIdentity } from '~/utils/onboardingProgressAnalytics'
import { validateRedirectPath } from '~/utils/safeRedirect'

const main = useMainStore()
const dialogStore = useDialogV2Store()
const organizationStore = useOrganizationStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const profileForm = ref<InstanceType<typeof OnboardingProfile> | null>(null)
const isSaving = ref(false)
const isLoggingOut = ref(false)
const onboarding = main.user?.onboarding
const savedOnboarding = onboarding && typeof onboarding === 'object' && !Array.isArray(onboarding) ? onboarding : {}
const savedDraft = savedOnboarding.profile_draft
const isEditingProfile = computed(() => route.query.edit === '1' && canEditInitialOnboardingName(main.user, organizationStore.hasOrganizations))
const hasSavedDraft = Boolean(savedDraft && typeof savedDraft === 'object' && !Array.isArray(savedDraft))
const showWelcome = ref(!isEditingProfile.value && !hasSavedDraft)
const targetPath = computed(() => validateRedirectPath(typeof route.query.to === 'string' ? route.query.to : '', '/onboarding/app', { blockedPrefixes: ['/onboarding/name'] }))
const progressSteps = computed(() => initialProfileOnboardingProgressSteps(main.user?.onboarding)
  .filter(step => !targetPath.value.startsWith('/onboarding/organization') || step.id === 'name' || step.id === 'organization')
  .map(step => ({ id: step.id, label: t(step.labelKey) })))
const profileHandoff = consumeProfileOnboardingHandoff(window.history)
const resumePending = ref(hasSavedDraft && !profileHandoff)
const identity = createOnboardingTelemetryIdentity({ continueFrom: profileHandoff ?? (!resumePending.value && !showWelcome.value && typeof savedOnboarding.onboarding_attempt_id === 'string' ? { attemptId: savedOnboarding.onboarding_attempt_id } : null), flow: 'pre_org', onboardingVersion: () => 6, supaHost: getLocalConfig().supaHost })
const analyticsSteps = targetPath.value.startsWith('/onboarding/organization') ? ['welcome', 'name', 'organization'] as const : initialProfileOnboardingSteps(main.user?.onboarding, true)
let tracker: ReturnType<typeof createOnboardingProgressTracker> | undefined
let disposed = false
const fields = createOnboardingDetailsFieldDebouncer((event, step, properties) => tracker?.trackDetailsEvent(event, step, properties), 500)

function trackField(field: 'first_name' | 'last_name', value: string) {
  fields.schedule(field === 'first_name' ? 'onboarding_first_name_entered' : 'onboarding_last_name_entered', field, 'name', value)
}

async function persistProfileProgress(patch: Record<string, Json> | ((current: Json) => Json)) {
  const userId = main.user?.id
  if (!userId)
    return false
  const authGeneration = main.authGeneration
  return serializeUserOnboardingWrite(userId, async () => {
    const isCurrentUser = () => !disposed && main.user?.id === userId && main.authGeneration === authGeneration
    if (!isCurrentUser())
      return false
    const result = await replaceUserOnboardingWithRetry(userId, main.user!.onboarding, current => typeof patch === 'function'
      ? patch(current)
      : ({
          ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
          ...patch,
        }), isCurrentUser)
    if (result.status !== 'persisted' || !isCurrentUser())
      return false
    main.user = { ...main.user!, onboarding: result.onboarding }
    return true
  })
}

async function continueAfterWelcome() {
  if (isSaving.value || !showWelcome.value)
    return
  isSaving.value = true
  try {
    // The existing draft records that About you has started, including before
    // any typing, so a refresh resumes the form instead of replaying welcome.
    const started = await persistProfileProgress({ profile_draft: {
      first_name: main.user?.first_name ?? '',
      last_name: main.user?.last_name ?? '',
    } })
    if (!started) {
      toast.error(t('account-error'))
      return
    }
    tracker?.completeStep('welcome', { nextStep: 'name' })
    showWelcome.value = false
    tracker?.viewStep('name', 'welcome')
  }
  catch (error) {
    console.warn('Cannot start profile onboarding', error)
    toast.error(t('account-error'))
  }
  finally {
    isSaving.value = false
  }
}

async function continueAfterName() {
  if (showWelcome.value || isSaving.value || !profileForm.value?.isValid)
    return
  isSaving.value = true
  try {
    if (!await profileForm.value.save())
      return
    let confirmed = false
    try {
      confirmed = await persistProfileProgress({ profile_completed_at: new Date().toISOString() })
    }
    catch (error) {
      console.warn('Cannot confirm profile onboarding', error)
    }
    if (!confirmed) {
      tracker?.trackStepEvent('onboarding_profile_save_failed', 'name')
      toast.error(t('account-error'))
      return
    }
    fields.dispose()
    tracker?.trackStepEvent('onboarding_profile_saved', 'name')
    tracker?.completeStep('name', { nextStep: targetPath.value.startsWith('/onboarding/organization') ? 'organization' : 'intent' })
    const destination = router.resolve(targetPath.value)
    await router.replace({ path: destination.path, query: destination.query, hash: destination.hash, state: { [PROFILE_ONBOARDING_HANDOFF_KEY]: { attemptId: identity.attemptId, runId: identity.runId } } })
  }
  finally {
    isSaving.value = false
  }
}

async function logout() {
  if (isLoggingOut.value || isSaving.value)
    return
  isLoggingOut.value = true
  try {
    await main.logout()
    await router.replace('/login')
  }
  catch (error) {
    console.error('Failed to log out from name onboarding', error)
    toast.error(t('cannot-sign-off'))
  }
  finally {
    isLoggingOut.value = false
  }
}

function visibilityChanged() {
  tracker?.trackVisibilityChange(document.visibilityState)
}

onMounted(async () => {
  if (!isEditingProfile.value && !needsInitialOnboardingName(main.user, organizationStore.hasOrganizations)) {
    await router.replace(targetPath.value)
    return
  }
  if (resumePending.value) {
    identity.prepareResumeCandidate({
      onboardingAttemptId: typeof savedOnboarding.onboarding_attempt_id === 'string' ? savedOnboarding.onboarding_attempt_id : undefined,
      lastRunId: typeof savedOnboarding.last_run_id === 'string' ? savedOnboarding.last_run_id : undefined,
      savedStep: 'name',
      steps: analyticsSteps,
    })
    dialogStore.openDialog({
      id: 'onboarding-profile-resume',
      title: t('onboarding-resume-title'),
      description: t('onboarding-resume-description'),
      preventAccidentalClose: true,
      buttons: [
        { text: t('onboarding-resume-restart'), id: 'onboarding-resume-restart', role: 'secondary', handler: async () => {
          try {
            if (await persistProfileProgress(current => mergeUserOnboardingProgress({}, current, { clearIntent: true, clearProfileDraft: true })))
              return true
          }
          catch (error) {
            console.warn('Cannot restart profile onboarding', error)
          }
          toast.error(t('account-error'))
          return false
        } },
        { text: t('onboarding-resume-continue'), id: 'onboarding-resume-continue', role: 'primary' },
      ],
    })
    identity.recordResumeDialogViewed()
    await dialogStore.onDialogDismiss()
    if (disposed)
      return
    if (dialogStore.lastButtonRole === 'onboarding-resume-restart') {
      identity.recordResumeRestarted()
      showWelcome.value = true
      if (isEditingProfile.value) {
        const { edit: _edit, ...query } = route.query
        await router.replace({ path: '/onboarding/name', query })
      }
    }
    else if (dialogStore.lastButtonRole === 'onboarding-resume-continue') {
      identity.recordResumeContinued()
    }
    else {
      return
    }
    resumePending.value = false
  }
  tracker = createOnboardingProgressTracker({ flow: 'pre_org', onboardingVersion: () => 6, resumed: !showWelcome.value && !profileHandoff, steps: analyticsSteps, supaHost: getLocalConfig().supaHost, onboardingAttemptId: identity.attemptId, onboardingRunId: identity.runId })
  tracker.viewStep(showWelcome.value ? 'welcome' : 'name', isEditingProfile.value ? 'intent' : undefined)
  document.addEventListener('visibilitychange', visibilityChanged)
  try {
    await persistProfileProgress({ onboarding_attempt_id: identity.attemptId, last_run_id: identity.runId })
  }
  catch (error) {
    console.warn('Cannot persist profile onboarding identity', error)
  }
})

onBeforeUnmount(() => {
  disposed = true
  if (resumePending.value && dialogStore.dialogOptions.id === 'onboarding-profile-resume')
    void dialogStore.closeDialog()
  fields.dispose()
  document.removeEventListener('visibilitychange', visibilityChanged)
})
</script>

<template>
  <AppOnboardingPageFrame :is-logging-out="isLoggingOut" :disabled="isSaving || resumePending" @logout="logout">
    <div v-if="showWelcome && !resumePending" class="min-h-0 flex-1 overflow-y-auto">
      <AppOnboardingWelcome :disabled="isSaving" @continue="continueAfterWelcome" />
    </div>
    <section v-else-if="!resumePending" class="onboarding-flow-shell onboarding-flow-app-creation onboarding-flow-details-name h-full min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div class="onboarding-flow-content mx-auto w-full max-w-3xl space-y-6">
        <AppOnboardingHeader :title="t('onboarding-welcome-title')" :steps="progressSteps" current-step-id="name" />
        <form class="onboarding-details-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/15 dark:bg-slate-900/95" data-test="onboarding-name-step" @submit.prevent="continueAfterName">
          <div class="onboarding-details-card-content space-y-6">
            <div class="onboarding-details-heading">
              <p class="text-sm font-semibold text-primary-500 dark:text-slate-300">
                {{ t('onboarding-name-kicker') }}
              </p>
              <h2 class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                {{ t('unified-onboarding-step-about-you') }}
              </h2>
              <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {{ t('onboarding-name-description') }}
              </p>
            </div>
            <OnboardingProfile ref="profileForm" initial :disabled="isSaving" @field-input="trackField" @save-failed="tracker?.trackStepEvent('onboarding_profile_save_failed', 'name')" />
            <p class="text-sm leading-6 text-slate-500 dark:text-slate-400">
              {{ t('onboarding-name-required') }}
            </p>
            <div class="onboarding-details-actions flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-end dark:border-white/15">
              <button type="submit" class="d-btn min-h-12" :class="onboardingPrimaryButtonClass" :disabled="!profileForm?.isValid || isSaving" data-test="onboarding-name-continue">
                <IconLoader v-if="isSaving" class="h-4 w-4 animate-spin" />
                {{ t('continue') }}
                <IconArrowRight v-if="!isSaving" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  </AppOnboardingPageFrame>
</template>

<route lang="yaml">
meta:
  layout: naked
  middleware: auth
</route>
