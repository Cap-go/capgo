<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconLoader from '~icons/lucide/loader-2'
import AuthPageShell from '~/components/auth/AuthPageShell.vue'
import { authGhostButtonClass, authPrimaryButtonClass } from '~/components/auth/pageStyles'
import OnboardingProfile from '~/components/OnboardingProfile.vue'
import { getLocalConfig } from '~/services/supabase'
import { replaceUserOnboardingWithRetry, serializeUserOnboardingWrite } from '~/services/userOnboardingWriteQueue'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import { initialProfileOnboardingSteps, needsInitialOnboardingName, PROFILE_ONBOARDING_HANDOFF_KEY } from '~/utils/onboardingProfile'
import { createOnboardingDetailsFieldDebouncer, createOnboardingProgressTracker, createOnboardingTelemetryIdentity } from '~/utils/onboardingProgressAnalytics'
import { validateRedirectPath } from '~/utils/safeRedirect'

const main = useMainStore()
const organizationStore = useOrganizationStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const profileForm = ref<InstanceType<typeof OnboardingProfile> | null>(null)
const isSaving = ref(false)
const targetPath = computed(() => validateRedirectPath(typeof route.query.to === 'string' ? route.query.to : '', '/dashboard', { blockedPrefixes: ['/onboarding/name'] }))
const identity = createOnboardingTelemetryIdentity({ flow: 'pre_org', onboardingVersion: () => 6, supaHost: getLocalConfig().supaHost })
const tracker = createOnboardingProgressTracker({ flow: 'pre_org', onboardingVersion: () => 6, resumed: false, steps: initialProfileOnboardingSteps(main.user?.onboarding, window.matchMedia('(min-width: 640px) and (min-height: 640px)').matches), supaHost: getLocalConfig().supaHost, onboardingAttemptId: identity.attemptId, onboardingRunId: identity.runId })
const fields = createOnboardingDetailsFieldDebouncer((event, step, properties) => tracker.trackDetailsEvent(event, step, properties), 500)

function trackField(field: 'first_name' | 'last_name', value: string) {
  fields.schedule(field === 'first_name' ? 'onboarding_first_name_entered' : 'onboarding_last_name_entered', field, 'name', value)
}

async function continueAfterName() {
  if (isSaving.value || !profileForm.value?.isValid)
    return
  isSaving.value = true
  try {
    if (!await profileForm.value.save())
      return
    fields.dispose()
    tracker.trackStepEvent('onboarding_profile_saved', 'name')
    tracker.completeStep('name')
    const destination = router.resolve(targetPath.value)
    await router.replace({ path: destination.path, query: destination.query, hash: destination.hash, state: { [PROFILE_ONBOARDING_HANDOFF_KEY]: { attemptId: identity.attemptId, runId: identity.runId } } })
  }
  finally {
    isSaving.value = false
  }
}

async function restartName() {
  if (isSaving.value)
    return
  isSaving.value = true
  try {
    fields.dispose()
    if (!await profileForm.value?.resetDraft())
      toast.error(t('account-error'))
  }
  finally {
    isSaving.value = false
  }
}

async function logout() {
  await main.logout()
  await router.replace('/login')
}

function visibilityChanged() {
  tracker.trackVisibilityChange(document.visibilityState)
}

onMounted(async () => {
  if (!needsInitialOnboardingName(main.user, organizationStore.hasOrganizations)) {
    await router.replace(targetPath.value)
    return
  }
  tracker.viewStep('name')
  document.addEventListener('visibilitychange', visibilityChanged)
  const userId = main.user!.id
  const authGeneration = main.authGeneration
  await serializeUserOnboardingWrite(userId, async () => {
    const isCurrentUser = () => main.user?.id === userId && main.authGeneration === authGeneration
    if (!isCurrentUser())
      return
    const result = await replaceUserOnboardingWithRetry(userId, main.user!.onboarding, current => ({
      ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
      onboarding_attempt_id: identity.attemptId,
      last_run_id: identity.runId,
    }), isCurrentUser)
    if (result.status === 'persisted' && isCurrentUser())
      main.user = { ...main.user!, onboarding: result.onboarding }
  })
})

onBeforeUnmount(() => {
  fields.dispose()
  document.removeEventListener('visibilitychange', visibilityChanged)
})
</script>

<template>
  <AuthPageShell :card-title="t('unified-onboarding-step-about-you')" :card-kicker="t('onboarding-name-kicker')" :card-description="t('onboarding-name-description')">
    <form class="space-y-6" data-test="onboarding-name-step" @submit.prevent="continueAfterName">
      <OnboardingProfile ref="profileForm" :disabled="isSaving" @field-input="trackField" @save-failed="tracker.trackStepEvent('onboarding_profile_save_failed', 'name')" />
      <p class="text-sm leading-6 text-slate-500 dark:text-slate-400">
        {{ t('onboarding-name-required') }}
      </p>
      <button type="submit" :class="authPrimaryButtonClass" :disabled="!profileForm?.isValid || isSaving" data-test="onboarding-name-continue">
        <IconLoader v-if="isSaving" class="h-4 w-4 animate-spin" />
        {{ t('continue') }}
        <IconArrowRight v-if="!isSaving" class="h-4 w-4" />
      </button>
      <div class="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-700">
        <button type="button" :class="authGhostButtonClass" :disabled="isSaving" data-test="onboarding-name-restart" @click="restartName">
          {{ t('onboarding-resume-restart') }}
        </button>
        <button type="button" :class="authGhostButtonClass" :disabled="isSaving" data-test="onboarding-logout" @click="logout">
          {{ t('sign-out') }}
        </button>
      </div>
    </form>
  </AuthPageShell>
</template>

<route lang="yaml">
meta:
  layout: naked
  middleware: auth
</route>
