<script setup lang="ts">
import type { OnboardingSetupMode } from '~/utils/onboardingSetupMode'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconBot from '~icons/lucide/bot'
import IconCheck from '~icons/lucide/check'
import IconListChecks from '~icons/lucide/list-checks'
import IconLoader from '~icons/lucide/loader-2'
import IconUsers from '~icons/lucide/users'
import AppOnboardingHeader from '~/components/dashboard/AppOnboardingHeader.vue'
import BillingRegionChoice from '~/components/dashboard/BillingRegionChoice.vue'
import { developmentEnvironmentOptions } from '~/components/dashboard/onboardingDevelopmentEnvironmentOptions'
import OnboardingToolPattern from '~/components/dashboard/OnboardingToolPattern.vue'
import { getCapgoApiErrorCode, invokeCapgoApi } from '~/services/capgoApi'
import { sendOnboardingEvent } from '~/services/onboardingTracking'
import { replaceUserOnboardingWithRetry, serializeUserOnboardingWrite } from '~/services/userOnboardingWriteQueue'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import { onboardingPrimaryButtonClass, onboardingSecondaryButtonClass } from '~/utils/onboardingButtonClasses'
import { onboardingPlanStops } from '~/utils/onboardingPlanStops'
import { AI_ONBOARDING_PATH, defaultAiOrganizationName, withOnboardingSetupMode } from '~/utils/onboardingSetupMode'

const props = defineProps<{ initialScreen: 'choice' | 'ai' }>()
const emit = defineEmits<{ manual: [] }>()

const { t } = useI18n()
const router = useRouter()
const main = useMainStore()
const organizationStore = useOrganizationStore()

const screen = ref<'choice' | 'ai'>(props.initialScreen)
const isSaving = ref(false)
const isCreating = ref(false)
const planIndex = ref<number | null>(null)
const billingAccount = ref<'ee' | 'us' | undefined>()
const hasEditedOrgName = ref(false)
const orgNameInput = ref('')
const assistantIcons = developmentEnvironmentOptions.find(option => option.value === 'ai_assistant')?.icons ?? []

const defaultOrgName = computed(() => defaultAiOrganizationName(
  main.user?.first_name,
  t('ai-onboarding-default-org-name-fallback'),
  name => t('ai-onboarding-default-org-name', { name }),
))
const orgName = computed({
  get: () => hasEditedOrgName.value ? orgNameInput.value : defaultOrgName.value,
  set: (value: string) => {
    hasEditedOrgName.value = true
    orgNameInput.value = value
  },
})
const planStops = computed(() => onboardingPlanStops(main.plans))
const selectedPlan = computed(() => planIndex.value === null ? null : planStops.value[planIndex.value] ?? null)
const canCreate = computed(() => !!selectedPlan.value && orgName.value.trim().length >= 3 && !isCreating.value)
const steps = computed(() => [
  { id: 'name', label: t('unified-onboarding-step-about-you') },
  { id: 'mode', label: t('ai-onboarding-step-mode') },
  { id: 'plan', label: t('ai-onboarding-step-plan') },
  { id: 'agent', label: t('ai-onboarding-step-agent') },
])

function planTitle(index: number) {
  const stop = planStops.value[index]
  if (!stop)
    return ''
  if (stop.startingOut)
    return t('organization-onboarding-starting-out')
  if (stop.value >= 1_000_000)
    return t('organization-onboarding-active-users-plus', { count: stop.label })
  return t('organization-onboarding-active-users-up-to', { count: stop.label })
}

// Remembering the choice lets a refresh land on the same screen. A failed write only costs
// that convenience, so the user is never blocked here.
async function rememberSetupMode(mode: OnboardingSetupMode) {
  const userId = main.user?.id
  if (!userId)
    return
  try {
    await serializeUserOnboardingWrite(userId, async () => {
      const result = await replaceUserOnboardingWithRetry(
        userId,
        main.user!.onboarding,
        current => withOnboardingSetupMode(current, mode),
        () => main.user?.id === userId,
      )
      if (result.status === 'persisted' && main.user?.id === userId)
        main.user = { ...main.user, onboarding: result.onboarding }
    })
  }
  catch (error) {
    console.warn('Cannot remember onboarding setup mode', error)
  }
}

async function chooseMode(mode: OnboardingSetupMode) {
  if (isSaving.value)
    return
  isSaving.value = true
  try {
    sendOnboardingEvent('onboarding_setup_mode_selected', { setup_mode: mode })
    await rememberSetupMode(mode)
    if (mode === 'manual') {
      emit('manual')
      return
    }
    screen.value = 'ai'
  }
  finally {
    isSaving.value = false
  }
}

async function createOrganization() {
  const plan = selectedPlan.value
  const name = orgName.value.trim()
  if (!plan || name.length < 3 || isCreating.value)
    return

  isCreating.value = true
  try {
    const { data, error } = await invokeCapgoApi<{ id: string }>('organization', {
      method: 'POST',
      body: {
        name,
        email: main.auth?.email ?? '',
        estimatedMau: plan.value,
        startingOut: plan.startingOut === true,
        developmentEnvironment: 'ai_assistant',
        billingAccount: billingAccount.value,
      },
    })
    if (error || !data?.id) {
      console.error('Cannot create organization for AI onboarding', error)
      const code = await getCapgoApiErrorCode(error)
      toast.error(code === '23505' ? t('org-with-this-name-exists') : t('cannot-create-org'))
      return
    }

    sendOnboardingEvent('onboarding_ai_org_created', {
      org_id: data.id,
      estimated_mau: plan.value,
      plan_name: plan.planName,
      starting_out: plan.startingOut === true,
      org_name_edited: hasEditedOrgName.value,
    })

    try {
      await organizationStore.fetchOrganizations()
      organizationStore.setCurrentOrganization(data.id)
    }
    catch (refreshError) {
      // The org exists; the AI page reloads organizations itself.
      console.warn('Cannot refresh organizations after AI onboarding create', refreshError)
    }
    await router.replace(AI_ONBOARDING_PATH)
  }
  finally {
    isCreating.value = false
  }
}
</script>

<template>
  <section class="onboarding-flow-shell onboarding-flow-app-creation h-full min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 dark:bg-slate-950">
    <div class="onboarding-flow-content mx-auto w-full max-w-3xl space-y-6">
      <AppOnboardingHeader :title="t('onboarding-welcome-title')" :steps="steps" :current-step-id="screen === 'choice' ? 'mode' : 'plan'" />

      <div v-if="screen === 'choice'" class="onboarding-intent-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/15 dark:bg-slate-900/95" data-test="onboarding-setup-mode">
        <div class="onboarding-intent-card-content space-y-6">
          <div>
            <h2 class="text-2xl font-semibold text-slate-950 dark:text-white">
              {{ t('ai-onboarding-mode-title') }}
            </h2>
            <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {{ t('ai-onboarding-mode-subtitle') }}
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              class="d-btn d-btn-ghost group relative h-auto min-h-[13rem] w-full flex-col items-start justify-end gap-0 overflow-hidden whitespace-normal rounded-xl border border-primary-500 bg-white p-5 text-left ring-2 ring-primary-500/15 transition hover:border-primary-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-slate-950/90 dark:hover:bg-slate-900"
              :disabled="isSaving"
              data-test="onboarding-setup-mode-ai"
              @click="chooseMode('ai')"
            >
              <OnboardingToolPattern :icons="assistantIcons" muted />
              <span class="relative z-10 mb-auto inline-flex items-center gap-1.5 rounded-full bg-primary-500 px-2.5 py-1 text-xs font-semibold text-white">
                {{ t('ai-onboarding-mode-recommended') }}
              </span>
              <span class="relative z-10 mt-6 flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                <IconBot class="h-5 w-5 text-primary-500" aria-hidden="true" />
                {{ t('ai-onboarding-mode-ai-label') }}
              </span>
              <span class="relative z-10 mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                {{ t('ai-onboarding-mode-ai-desc') }}
              </span>
            </button>

            <button
              type="button"
              class="d-btn d-btn-ghost group h-auto min-h-[13rem] w-full flex-col items-start justify-end gap-0 whitespace-normal rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-primary-500/40 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-white/15 dark:bg-slate-950/90 dark:hover:border-white/30 dark:hover:bg-slate-900"
              :disabled="isSaving"
              data-test="onboarding-setup-mode-manual"
              @click="chooseMode('manual')"
            >
              <span class="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                <IconListChecks class="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                {{ t('ai-onboarding-mode-manual-label') }}
              </span>
              <span class="mt-1 block text-sm leading-6 text-slate-600 dark:text-slate-300">
                {{ t('ai-onboarding-mode-manual-desc') }}
              </span>
            </button>
          </div>

          <p class="text-xs leading-5 text-slate-500 dark:text-slate-400">
            {{ t('ai-onboarding-mode-footnote') }}
          </p>
        </div>
      </div>

      <form v-else class="onboarding-details-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/15 dark:bg-slate-900/95" data-test="onboarding-ai-plan" @submit.prevent="createOrganization">
        <div class="onboarding-details-card-content space-y-6">
          <div>
            <p class="text-sm font-semibold text-primary-500 dark:text-slate-300">
              {{ t('ai-onboarding-plan-kicker') }}
            </p>
            <h2 class="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
              {{ t('ai-onboarding-plan-title') }}
            </h2>
            <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {{ t('ai-onboarding-plan-subtitle') }}
            </p>
          </div>

          <div>
            <p id="ai-onboarding-plan-label" class="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              <IconUsers class="h-4 w-4 text-primary-500" />
              {{ t('organization-onboarding-existing-users-label') }}
            </p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="ai-onboarding-plan-label" data-test="onboarding-ai-plan-options">
              <label
                v-for="(stop, index) in planStops"
                :key="`${stop.planName}-${stop.value}`"
                class="group cursor-pointer"
                :class="{ 'sm:col-span-2': stop.startingOut }"
                :data-test="stop.startingOut ? 'onboarding-ai-plan-starting-out' : 'onboarding-ai-plan-option'"
              >
                <input v-model="planIndex" type="radio" name="ai-onboarding-plan" class="peer sr-only" :value="index">
                <span
                  class="flex min-h-16 items-center justify-between gap-3 rounded-xl border p-3 text-left transition peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-slate-900"
                  :class="planIndex === index
                    ? 'border-primary-500 bg-slate-100 text-slate-950 ring-2 ring-primary-500/15 dark:border-primary-500/80 dark:bg-primary-500/25 dark:text-white dark:ring-primary-500/30'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/15 dark:bg-slate-950/90 dark:text-slate-200 dark:hover:border-white/30 dark:hover:bg-slate-900'"
                >
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">{{ planTitle(index) }}</span>
                    <span class="mt-1 block text-xs text-slate-500 dark:text-slate-400">{{ t('organization-onboarding-plan-match') }}: {{ stop.planName }}</span>
                  </span>
                  <span
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition"
                    :class="planIndex === index ? 'border-primary-500 bg-primary-500 text-white' : 'border-slate-300 bg-white text-transparent group-hover:border-slate-400 dark:border-white/20 dark:bg-slate-900'"
                    aria-hidden="true"
                  >
                    <IconCheck class="h-3.5 w-3.5" />
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div>
            <label for="ai-onboarding-org-name" class="text-sm font-medium text-slate-800 dark:text-slate-200">
              {{ t('ai-onboarding-org-name-label') }}
            </label>
            <input
              id="ai-onboarding-org-name"
              v-model="orgName"
              type="text"
              minlength="3"
              maxlength="80"
              autocomplete="organization"
              class="d-input mt-2 w-full rounded-xl border-slate-300 bg-white text-slate-950 dark:border-white/15 dark:bg-slate-950 dark:text-white"
              data-test="onboarding-ai-org-name"
            >
            <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {{ t('ai-onboarding-org-name-help') }}
            </p>
          </div>

          <BillingRegionChoice v-model="billingAccount" />

          <div class="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-white/15">
            <button type="button" class="d-btn min-h-12" :class="onboardingSecondaryButtonClass" :disabled="isCreating" data-test="onboarding-ai-plan-back" @click="screen = 'choice'">
              {{ t('button-back') }}
            </button>
            <button type="submit" class="d-btn min-h-12" :class="onboardingPrimaryButtonClass" :disabled="!canCreate" data-test="onboarding-ai-create-org">
              <IconLoader v-if="isCreating" class="h-4 w-4 animate-spin" />
              {{ t('ai-onboarding-create-org') }}
              <IconArrowRight v-if="!isCreating" class="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  </section>
</template>
