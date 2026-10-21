<script setup lang="ts">
/**
 * Offered right after a trial org saves a card on its own (Billing, Credits): asks whether
 * the plan picked during onboarding should start automatically when the trial ends.
 * Closes without showing anything when there is no plan to offer (paying org, trial over,
 * plan already scheduled).
 */

import type { TrialPlan } from '~/services/stripe'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconCalendar from '~icons/heroicons/calendar-days'
import BillingModal from '~/components/billing/BillingModal.vue'
import { formatLocalDate } from '~/services/date'
import { pushEvent } from '~/services/posthog'
import { formatStripeAmount, getTrialPlan, scheduleTrialPlan } from '~/services/stripe'
import { getLocalConfig } from '~/services/supabase'

const props = defineProps<{
  orgId: string
  source: string
}>()

const emit = defineEmits<{
  close: []
  scheduled: [plan: TrialPlan]
}>()

const { t } = useI18n()
const config = getLocalConfig()
const plan = ref<TrialPlan | null>(null)
// The offer belongs to the org it was loaded for; an org change closes it.
const offerOrgId = props.orgId
const isScheduling = ref(false)

const price = computed(() => plan.value ? formatStripeAmount(plan.value.amount, plan.value.currency) : '')
const date = computed(() => plan.value ? formatLocalDate(plan.value.startsAt) : '')

function track(event: string) {
  pushEvent(event, config.supaHost, { org_id: offerOrgId, source: props.source, plan: plan.value?.planName ?? '' })
}

watch(() => props.orgId, (id) => {
  if (id !== offerOrgId)
    emit('close')
})

onMounted(async () => {
  try {
    const result = await getTrialPlan(offerOrgId)
    if (props.orgId !== offerOrgId)
      return
    if (!result.plan || result.plan.scheduled || !result.card) {
      emit('close')
      return
    }
    plan.value = result.plan
    track('trial_plan_offer_shown')
  }
  catch (error) {
    console.error('Cannot load trial plan offer', error)
    emit('close')
  }
})

function decline() {
  if (isScheduling.value)
    return
  track('trial_plan_offer_declined')
  emit('close')
}

async function accept() {
  if (isScheduling.value)
    return
  isScheduling.value = true
  try {
    const result = await scheduleTrialPlan(offerOrgId)
    track('trial_plan_offer_accepted')
    toast.success(t('trial-plan-scheduled', { plan: result.plan.planName, date: formatLocalDate(result.plan.startsAt) }))
    emit('scheduled', result.plan)
  }
  catch (error) {
    console.error('Cannot schedule trial plan', error)
    toast.error(t('trial-plan-schedule-error'))
    emit('close')
  }
  finally {
    isScheduling.value = false
  }
}
</script>

<template>
  <BillingModal
    v-if="plan"
    :title="t('trial-plan-offer-title', { plan: plan.planName })"
    :busy="isScheduling"
    @close="decline"
  >
    <div class="flex items-start gap-3">
      <IconCalendar class="mt-0.5 h-6 w-6 shrink-0 text-blue-500" aria-hidden="true" />
      <div class="space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
        <p class="font-medium">
          {{ t('trial-card-prompt-plan', { plan: plan.planName, price, date }) }}
        </p>
        <p class="text-slate-600 dark:text-slate-300">
          {{ t('trial-plan-offer-no-charge') }}
        </p>
      </div>
    </div>
    <div class="mt-6 flex flex-wrap justify-end gap-2">
      <button type="button" class="d-btn d-btn-ghost" :disabled="isScheduling" data-test="trial-plan-offer-decline" @click="decline">
        {{ t('trial-plan-offer-decline') }}
      </button>
      <button type="button" class="d-btn d-btn-primary" :disabled="isScheduling" data-test="trial-plan-offer-accept" @click="accept">
        <span v-if="isScheduling" class="d-loading d-loading-spinner d-loading-sm" />
        {{ t('trial-plan-start', { plan: plan.planName }) }}
      </button>
    </div>
  </BillingModal>
</template>
